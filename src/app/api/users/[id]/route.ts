import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isDemoMode } from '@/lib/app-mode';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isDemoMode() || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { phone?: string };
  await runStatement(`UPDATE users SET phone = ? WHERE id = ?`, [body.phone?.trim() ?? null, id]);
  const user = await queryOne(`SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?`, [id]);
  return NextResponse.json(user);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (isDemoMode() || role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Prevent deleting the last admin
  const admins = await queryAll(`SELECT id FROM users WHERE role = 'admin'`) as { id: number }[];
  const target = await queryOne(`SELECT role FROM users WHERE id = ?`, [id]) as { role: string } | undefined;
  if (target?.role === 'admin' && admins.length <= 1) {
    return NextResponse.json({ error: 'Cannot remove the last admin.' }, { status: 400 });
  }

  await runStatement(`DELETE FROM users WHERE id = ?`, [id]);
  return NextResponse.json({ ok: true });
}
