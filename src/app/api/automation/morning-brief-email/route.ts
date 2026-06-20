import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';

interface BriefMailBody {
  force?: boolean;
  runAt?: string;
  to?: string | string[];
}

function isAuthorized(req: NextRequest): boolean {
  const configured = (process.env.AUTOMATION_API_KEY ?? '').trim();
  if (!configured) return false;

  const headerKey = (req.headers.get('x-automation-key') ?? '').trim();
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  return headerKey === configured || bearerKey === configured;
}

function toRecipientList(input?: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => v.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map((v) => v.trim()).filter(Boolean);
  }
  const envTo = (process.env.MORNING_BRIEF_TO ?? '').trim();
  if (envTo) return envTo.split(',').map((v) => v.trim()).filter(Boolean);
  const smtpUser = (process.env.SMTP_USER ?? '').trim();
  return smtpUser ? [smtpUser] : [];
}

async function buildMorningBrief() {
  const newLeadsToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM leads
    WHERE date(created_at) = date('now')
  `)) as { c: number }).c;

  const contactedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type IN ('connection_sent', 'message_sent', 'email_sent', 'sms_sent')
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const repliedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type IN ('replied', 'email_reply', 'linkedin_reply')
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const meetingsBookedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type = 'meeting_booked'
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const followUpsDueToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM tasks
    WHERE done = 0
      AND due_date IS NOT NULL
      AND date(due_date) <= date('now')
  `)) as { c: number }).c;

  const priorityFollowUps = await queryAll(`
    SELECT t.title, t.due_date, l.company_name
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.done = 0
      AND t.due_date IS NOT NULL
      AND date(t.due_date) <= date('now')
    ORDER BY l.lead_score DESC, date(t.due_date) ASC
    LIMIT 8
  `) as Array<{ title: string; due_date: string | null; company_name: string | null }>;

  return {
    summary: { newLeadsToday, contactedToday, repliedToday, meetingsBookedToday, followUpsDueToday },
    priorityFollowUps,
  };
}

export async function POST(req: NextRequest) {
  const hasKey = Boolean((process.env.AUTOMATION_API_KEY ?? '').trim());
  if (!hasKey) {
    return NextResponse.json({ error: 'AUTOMATION_API_KEY is not configured.' }, { status: 503 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized scheduler request.' }, { status: 401 });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ error: 'SMTP credentials are not configured.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as BriefMailBody;
  const force = body.force === true;

  const parsedRunAt = body.runAt ? new Date(body.runAt) : new Date();
  const now = Number.isNaN(parsedRunAt.getTime()) ? new Date() : parsedRunAt;
  const briefDate = now.toISOString().slice(0, 10);

  const recipients = toRecipientList(body.to);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients configured. Set MORNING_BRIEF_TO or SMTP_USER.' }, { status: 400 });
  }

  const alreadySent = await queryOne('SELECT id FROM morning_brief_mail_runs WHERE brief_date = ?', [briefDate]) as { id: number } | undefined;
  if (alreadySent && !force) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_sent', briefDate, recipients });
  }

  const brief = await buildMorningBrief();

  const fromName = process.env.SMTP_FROM_NAME ?? 'Splendid Technology';
  const fromEmail = process.env.SMTP_USER;
  const replyTo = process.env.SMTP_REPLY_TO ?? fromEmail;

  const subject = `Splendid CRM Morning Brief - ${briefDate}`;
  const lines = [
    `Morning Brief (${briefDate})`,
    '',
    `- New leads found: ${brief.summary.newLeadsToday}`,
    `- Contacted: ${brief.summary.contactedToday}`,
    `- Replied: ${brief.summary.repliedToday}`,
    `- Meetings booked: ${brief.summary.meetingsBookedToday}`,
    `- Follow-ups due today: ${brief.summary.followUpsDueToday}`,
    '',
    'Priority follow-ups:',
    ...brief.priorityFollowUps.map((item, index) => {
      const company = item.company_name ?? 'Campaign task';
      const due = item.due_date ?? 'No due date';
      return `${index + 1}. ${item.title} | ${company} | due ${due}`;
    }),
  ];

  const text = lines.join('\n');
  const html = `
    <h2>Morning Brief (${briefDate})</h2>
    <ul>
      <li>New leads found: <strong>${brief.summary.newLeadsToday}</strong></li>
      <li>Contacted: <strong>${brief.summary.contactedToday}</strong></li>
      <li>Replied: <strong>${brief.summary.repliedToday}</strong></li>
      <li>Meetings booked: <strong>${brief.summary.meetingsBookedToday}</strong></li>
      <li>Follow-ups due today: <strong>${brief.summary.followUpsDueToday}</strong></li>
    </ul>
    <h3>Priority follow-ups</h3>
    <ol>
      ${brief.priorityFollowUps.map((item) => `<li>${item.title} | ${item.company_name ?? 'Campaign task'} | due ${item.due_date ?? 'No due date'}</li>`).join('')}
    </ol>
  `;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    replyTo,
    to: recipients.join(', '),
    subject,
    text,
    html,
  });

  if (alreadySent && force) {
    await runStatement('DELETE FROM morning_brief_mail_runs WHERE id = ?', [alreadySent.id]);
  }
  await runStatement('INSERT INTO morning_brief_mail_runs (brief_date, sent_to, created_at) VALUES (?, ?, datetime(\'now\'))', [briefDate, recipients.join(',')]);

  return NextResponse.json({
    ok: true,
    skipped: false,
    briefDate,
    recipients,
    summary: brief.summary,
    followups: brief.priorityFollowUps.length,
  });
}
