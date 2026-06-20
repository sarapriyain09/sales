import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, runStatement } from '@/lib/db-client';
import { normalizeVertical, renderOutreachTemplate, type OutreachChannel } from '@/lib/outreach-templates';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

type Channel = 'email' | 'sms';
type Scope = 'selected' | 'all' | 'not_sent';

interface BulkRequestBody {
  channel?: Channel;
  scope?: Scope;
  leadIds?: number[];
  vertical?: string;
}

function isChannel(v: string): v is Channel {
  return v === 'email' || v === 'sms';
}

function isScope(v: string): v is Scope {
  return v === 'selected' || v === 'all' || v === 'not_sent';
}

function normaliseUkNumber(input: string) {
  let to = input.trim().replace(/\s+/g, '');
  if (to.startsWith('0')) to = '+44' + to.slice(1);
  if (!to.startsWith('+')) to = '+44' + to;
  return to;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as BulkRequestBody;
  const channelRaw = String(body.channel ?? '');
  const scopeRaw = String(body.scope ?? '');

  if (!isChannel(channelRaw)) {
    return NextResponse.json({ error: 'Invalid channel. Use email or sms.' }, { status: 400 });
  }
  if (!isScope(scopeRaw)) {
    return NextResponse.json({ error: 'Invalid scope. Use selected, all, or not_sent.' }, { status: 400 });
  }

  const channel = channelRaw as Channel;
  const scope = scopeRaw as Scope;
  const verticalFilter = body.vertical ? normalizeVertical(body.vertical) : null;

  if (channel === 'email' && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
    return NextResponse.json({ error: 'Email is not configured.' }, { status: 503 });
  }
  if (channel === 'sms' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER)) {
    return NextResponse.json({ error: 'SMS is not configured.' }, { status: 503 });
  }

  let leads: Array<{
    id: number;
    company_name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    source: string | null;
    vertical: string | null;
    outreach_email: string | null;
    sms_sent_at: string | null;
    tps_status: string | null;
  }> = [];

  if (scope === 'selected') {
    const ids = (body.leadIds ?? []).filter(n => Number.isFinite(Number(n))).map(n => Number(n));
    if (ids.length === 0) {
      return NextResponse.json({ error: 'leadIds are required for selected scope.' }, { status: 400 });
    }
    const placeholders = ids.map(() => '?').join(',');
    leads = await queryAll(`
      SELECT id, company_name, email, phone, notes, source, vertical, outreach_email, sms_sent_at, tps_status
      FROM leads
      WHERE stage = 'prospect' AND id IN (${placeholders})
      ORDER BY id ASC
    `, ids) as typeof leads;
  } else if (scope === 'all') {
    leads = await queryAll(`
      SELECT id, company_name, email, phone, notes, source, vertical, outreach_email, sms_sent_at, tps_status
      FROM leads
      WHERE stage = 'prospect'
      ORDER BY id ASC
    `) as typeof leads;
  } else {
    if (channel === 'email') {
      leads = await queryAll(`
        SELECT id, company_name, email, phone, notes, source, vertical, outreach_email, sms_sent_at, tps_status
        FROM leads
        WHERE stage = 'prospect' AND (outreach_email IS NULL OR outreach_email = '')
        ORDER BY id ASC
      `) as typeof leads;
    } else {
      leads = await queryAll(`
        SELECT id, company_name, email, phone, notes, source, vertical, outreach_email, sms_sent_at, tps_status
        FROM leads
        WHERE stage = 'prospect' AND sms_sent_at IS NULL
        ORDER BY id ASC
      `) as typeof leads;
    }
  }

  if (verticalFilter) {
    leads = leads.filter(l => normalizeVertical(l.vertical) === verticalFilter);
  }

  const templateRows = await queryAll(`
    SELECT channel, vertical, subject, message
    FROM outreach_templates
    WHERE channel = ?
  `, [channel]) as Array<{ channel: OutreachChannel; vertical: string; subject: string | null; message: string }>;
  const templateMap = new Map(templateRows.map(t => [t.vertical, t]));

  const failures: Array<{ id: number; company: string; error: string }> = [];
  let skipped = 0;
  let sent = 0;

  const transporter = channel === 'email'
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  const twilioClient = channel === 'sms'
    ? twilio(process.env.TWILIO_ACCOUNT_SID as string, process.env.TWILIO_AUTH_TOKEN as string)
    : null;

  for (const lead of leads) {
    try {
      if (channel === 'email') {
        if (!lead.email) {
          skipped += 1;
          continue;
        }
        const vertical = normalizeVertical(lead.vertical);
        const template = templateMap.get(vertical);
        if (!template) {
          failures.push({ id: lead.id, company: lead.company_name, error: `No email template for vertical ${vertical}` });
          continue;
        }
        const emailDraft = renderOutreachTemplate(template, {
          company_name: lead.company_name,
          notes: lead.notes,
        });
        await transporter!.sendMail({
          from: `"${process.env.SMTP_FROM_NAME ?? 'Splendid Technology'}" <${process.env.SMTP_USER}>`,
          replyTo: process.env.SMTP_REPLY_TO ?? process.env.SMTP_USER,
          to: lead.email,
          subject: emailDraft.subject ?? `Quick note for ${lead.company_name}`,
          text: emailDraft.message,
          html: emailDraft.message.replace(/\n/g, '<br>'),
        });

        await runStatement(`
          UPDATE leads
          SET contacted_at = datetime('now'), outreach_email = @email, updated_at = datetime('now')
          WHERE id = @id
        `, { id: lead.id, email: emailDraft.message });

        sent += 1;
      } else {
        if (!lead.phone) {
          skipped += 1;
          continue;
        }
        if (lead.tps_status === 'tps' || lead.tps_status === 'ctps' || lead.tps_status === 'tps_and_ctps') {
          skipped += 1;
          continue;
        }

        const vertical = normalizeVertical(lead.vertical);
        const template = templateMap.get(vertical);
        if (!template) {
          failures.push({ id: lead.id, company: lead.company_name, error: `No SMS template for vertical ${vertical}` });
          continue;
        }
        const smsMessage = renderOutreachTemplate(template, {
          company_name: lead.company_name,
          notes: lead.notes,
        }).message;
        await twilioClient!.messages.create({
          from: process.env.TWILIO_FROM_NUMBER as string,
          to: normaliseUkNumber(lead.phone),
          body: smsMessage,
        });

        await runStatement(`
          UPDATE leads
          SET sms_sent_at = datetime('now'), sms_message = @msg, contacted_at = COALESCE(contacted_at, datetime('now')), updated_at = datetime('now')
          WHERE id = @id
        `, { id: lead.id, msg: smsMessage });

        sent += 1;
      }
    } catch (error) {
      failures.push({
        id: lead.id,
        company: lead.company_name,
        error: error instanceof Error ? error.message : 'Failed',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    channel,
    scope,
    vertical: verticalFilter,
    total: leads.length,
    sent,
    skipped,
    failed: failures.length,
    failures: failures.slice(0, 15),
  });
}
