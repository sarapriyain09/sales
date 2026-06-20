import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getToken, listAdAccounts, hasToken } from '@/lib/linkedin';

/** GET /api/linkedin/status — returns connection status + ad accounts */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const userId = (session.user as any).id as number;

  if (!(await hasToken(userId))) {
    return NextResponse.json({ connected: false, accounts: [] });
  }

  const tok = await getToken(userId);
  if (!tok) return NextResponse.json({ connected: false, accounts: [] });

  try {
    const accounts = await listAdAccounts(tok.access_token);
    return NextResponse.json({ connected: true, accounts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ connected: true, accounts: [], error: msg });
  }
}
