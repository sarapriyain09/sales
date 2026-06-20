import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { queryOne, runStatement } from '@/lib/db-client';
import { isDemoMode } from '@/lib/app-mode';

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
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json() as {
    name?: string;
    email?: string;
    password?: string;
    company?: string;
    phone?: string;
  };

  const name = body.name?.trim() ?? '';
  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';
  const company = body.company?.trim() || null;
  const phone = body.phone?.trim() || null;

  if (!name || !email || !password || password.length < 8) {
    return NextResponse.json({ error: 'Name, email and password (min 8 chars) are required.' }, { status: 400 });
  }

  const existing = await queryOne('SELECT id, demo_verified FROM users WHERE email = ?', [email]) as { id: number; demo_verified: number } | undefined;
  const token = crypto.randomBytes(24).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let createdUser = 0;
  if (!existing) {
    const hash = await bcrypt.hash(password, 12);
    await runStatement('INSERT INTO users (name, email, password, role, demo_verified, demo_verify_token, demo_verify_expires) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      name,
      email,
      hash,
      'user',
      0,
      token,
      expiry,
    ]);
    createdUser = 1;
  } else if (existing.demo_verified === 1) {
    return NextResponse.json(
      {
        error: 'This email is already registered. Please use Forgot Password to reset your password and sign in.',
        code: 'already_registered',
        email,
      },
      { status: 409 }
    );
  } else if (existing.demo_verified !== 1) {
    await runStatement('UPDATE users SET demo_verify_token = ?, demo_verify_expires = ? WHERE id = ?', [token, expiry, existing.id]);
  }

  const host = req.headers.get('host');
  const userAgent = req.headers.get('user-agent');
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || null;
  const verificationSent = existing?.demo_verified === 1 ? 0 : 1;

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || null;
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || null;
  const effectiveHost = forwardedHost || host || req.nextUrl.host;
  const effectiveProto = forwardedProto || (req.nextUrl.protocol ? req.nextUrl.protocol.replace(':', '') : 'https');

  // Demo activation links must be publicly reachable; never emit localhost unless explicitly configured.
  const derivedBase = effectiveHost ? `${effectiveProto}://${effectiveHost}` : req.nextUrl.origin;
  const preferredDemoBase = process.env.DEMO_PUBLIC_BASE_URL?.trim();
  const nextAuthBase = process.env.NEXTAUTH_URL?.trim();
  const hostLooksLocal = /(^localhost$)|(^127\.0\.0\.1$)|(^\[::1\]$)/i.test((effectiveHost || '').split(':')[0]);
  const appBase = preferredDemoBase || (hostLooksLocal ? 'https://democrm.splendidtechnology.co.uk' : derivedBase) || nextAuthBase || req.nextUrl.origin;
  const activateUrl = `${appBase}/api/demo/activate?token=${token}`;

  if (verificationSent) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP is not configured for activation emails.' }, { status: 503 });
    }

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? 'Velynxia'}" <${process.env.SMTP_USER}>`,
      replyTo: process.env.SMTP_REPLY_TO ?? process.env.SMTP_USER,
      to: email,
      subject: 'Activate your Velynxia CRM demo access',
      text: `Hi ${name},\n\nPlease activate your demo account by opening this link:\n${activateUrl}\n\nThis link expires in 24 hours.\n`,
      html: `<p>Hi ${name},</p><p>Please activate your demo account by clicking the link below:</p><p><a href="${activateUrl}">${activateUrl}</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  await runStatement(
    `INSERT INTO demo_registrations (name, email, company, phone, verification_sent, source_host, ip_address, user_agent, created_user)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email, company, phone, verificationSent, host, ip, userAgent, createdUser]
  );

  return NextResponse.json({ ok: true, createdUser: createdUser === 1, verificationSent: verificationSent === 1 });
}
