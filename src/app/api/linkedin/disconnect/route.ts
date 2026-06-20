import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { deleteToken } from '@/lib/linkedin';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const userId = (session.user as any).id as number;
  await deleteToken(userId);
  return NextResponse.json({ ok: true });
}
