import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { runStatement } from '@/lib/db-client';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
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
    return NextResponse.json({ error: 'SMTP is not configured' }, { status: 503 });
  }

  const body = await req.json() as {
    quote_id?: number;
    to?: string;
    subject?: string;
    message?: string;
    attachments?: Array<{ filename: string; content: string; encoding?: string }>;
  };

  const quoteId = Number(body.quote_id);
  if (!Number.isFinite(quoteId) || !body.to || !body.subject || !body.message) {
    return NextResponse.json({ error: 'quote_id, to, subject, message are required' }, { status: 400 });
  }

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? 'Sales CRM'}" <${process.env.SMTP_USER}>`,
      replyTo: process.env.SMTP_REPLY_TO ?? process.env.SMTP_USER,
      to: body.to,
      subject: body.subject,
      text: body.message,
      html: body.message.replace(/\n/g, '<br>'),
      attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
    });

    await runStatement(`
      INSERT INTO email_history (quote_id, to_email, subject, body, attachments_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      quoteId,
      body.to,
      body.subject,
      body.message,
      Array.isArray(body.attachments) ? JSON.stringify(body.attachments.map(a => a.filename)) : null,
      (session.user as { id?: number | string } | undefined)?.id ?? null,
    ]);

    await runStatement("UPDATE quotes SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, updated_at = datetime('now') WHERE id = ?", [quoteId]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send quote email' }, { status: 500 });
  }
}
