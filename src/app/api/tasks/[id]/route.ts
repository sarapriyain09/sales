import { NextRequest, NextResponse } from 'next/server';
import { queryOne, runStatement } from '@/lib/db-client';
import { getServerSession } from 'next-auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await queryOne(`SELECT t.*, l.company_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id WHERE t.id = ?`, [id]);

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const fields = Object.entries(body).map(([k]) => `${k} = ?`).join(', ');
  const values = Object.values(body);
  await runStatement(`UPDATE tasks SET ${fields} WHERE id = ?`, [...values, id] as unknown as (string | number | boolean | null)[]);

  const task = await queryOne(`SELECT * FROM tasks WHERE id = ?`, [id]);
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await runStatement(`DELETE FROM tasks WHERE id = ?`, [id]);
  return NextResponse.json({ ok: true });
}
