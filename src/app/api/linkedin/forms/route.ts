import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getToken, listLeadGenForms } from '@/lib/linkedin';

/** GET /api/linkedin/forms?accountId=123 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const accountId = new URL(req.url).searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const userId = (session.user as any).id as number;
  const tok    = await getToken(userId);
  if (!tok) return NextResponse.json({ error: 'Not connected to LinkedIn' }, { status: 403 });

  try {
    const forms = await listLeadGenForms(tok.access_token, accountId);
    return NextResponse.json(forms);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
