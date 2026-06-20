import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { exchangeCode, saveToken } from '@/lib/linkedin';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL('/login', req.url));

  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // User declined
  if (error) {
    return NextResponse.redirect(new URL('/linkedin?error=access_denied', req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/linkedin?error=missing_params', req.url));
  }

  // Validate CSRF state
  const cookieState = req.cookies.get('li_oauth_state')?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL('/linkedin?error=state_mismatch', req.url));
  }

  try {
    const token = await exchangeCode(code);
    const userId = (session.user as any).id as number;
    await saveToken(userId, token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'token_exchange_failed';
    return NextResponse.redirect(new URL(`/linkedin?error=${encodeURIComponent(msg)}`, req.url));
  }

  // Clear state cookie and redirect to LinkedIn page
  const resp = NextResponse.redirect(new URL('/linkedin?connected=1', req.url));
  resp.cookies.set('li_oauth_state', '', { maxAge: 0, path: '/' });
  return resp;
}
