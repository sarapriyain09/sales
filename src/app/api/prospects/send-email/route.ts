import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { runStatement } from '@/lib/db-client';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json(
      { error: 'not_configured', message: 'SMTP credentials not set in .env.local' },
      { status: 503 },
    );
  }

  const body = await req.json() as {
    leadId: number;
    to: string;
    subject: string;
    message: string;
  };

  if (!body.leadId || !body.to || !body.subject || !body.message) {
    return NextResponse.json({ error: 'leadId, to, subject and message are required' }, { status: 400 });
  }

  const fromName  = process.env.SMTP_FROM_NAME  ?? 'Splendid Technology';
  const fromEmail = process.env.SMTP_USER;
  const replyTo   = process.env.SMTP_REPLY_TO ?? fromEmail;

  try {
    await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      replyTo: replyTo,
      to:      body.to,
      subject: body.subject,
      text:    body.message,
      html:    body.message.replace(/\n/g, '<br>'),
    });

    // Record on the lead: mark contacted + store the sent email body
    await runStatement(`
      UPDATE leads
      SET contacted_at = datetime('now'),
          outreach_email = @email,
          updated_at = datetime('now')
      WHERE id = @id
    `, { id: body.leadId, email: body.message });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[send-email]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send email' },
      { status: 500 },
    );
  }
}
