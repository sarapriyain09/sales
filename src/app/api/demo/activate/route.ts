import { NextRequest, NextResponse } from 'next/server';
import { queryOne, runStatement } from '@/lib/db-client';
import { isDemoMode } from '@/lib/app-mode';

function getDemoBaseUrl(req: NextRequest): string {
  const preferredDemoBase = process.env.DEMO_PUBLIC_BASE_URL?.trim();
  if (preferredDemoBase) return preferredDemoBase;

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || null;
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || null;
  const effectiveHost = forwardedHost || req.headers.get('host') || req.nextUrl.host;
  const effectiveProto = forwardedProto || (req.nextUrl.protocol ? req.nextUrl.protocol.replace(':', '') : 'https');
  const hostOnly = (effectiveHost || '').split(':')[0];
  const hostLooksLocal = /(^localhost$)|(^127\.0\.0\.1$)|(^\[::1\]$)/i.test(hostOnly);

  if (hostLooksLocal) return 'https://democrm.splendidtechnology.co.uk';
  return `${effectiveProto}://${effectiveHost}`;
}

export async function GET(req: NextRequest) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const appBase = getDemoBaseUrl(req);

  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?activated=invalid', appBase));
  }

  const user = await queryOne('SELECT id, demo_verify_expires FROM users WHERE demo_verify_token = ? AND demo_verified = 0', [token]) as { id: number; demo_verify_expires: string | null } | undefined;

  if (!user) {
    return NextResponse.redirect(new URL('/login?activated=invalid', appBase));
  }

  if (!user.demo_verify_expires || new Date(user.demo_verify_expires).getTime() < Date.now()) {
    return NextResponse.redirect(new URL('/login?activated=expired', appBase));
  }

  await runStatement('UPDATE users SET demo_verified = 1, demo_verify_token = NULL, demo_verify_expires = NULL WHERE id = ?', [user.id]);
  return NextResponse.redirect(new URL('/login?activated=1', appBase));
}
