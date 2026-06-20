import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Lead } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const lead    = await queryOne('SELECT * FROM leads WHERE id = ?', [id]);
  const contacts = await queryAll('SELECT * FROM contacts WHERE lead_id = ? ORDER BY is_primary DESC', [id]);
  const notes   = await queryAll('SELECT n.*, u.name as user_name FROM notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.lead_id = ? ORDER BY n.created_at DESC', [id]);
  const tasks   = await queryAll('SELECT * FROM tasks WHERE lead_id = ? ORDER BY done ASC, due_date ASC', [id]);
  const quotes  = await queryAll('SELECT * FROM quotes WHERE lead_id = ? ORDER BY created_at DESC', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ lead, contacts, notes, tasks, quotes });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as Partial<Lead>;

  const fields = Object.keys(body).filter(k => k !== 'id');
  if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const setClause = fields.map(f => `${f} = @${f}`).join(', ');
  await runStatement(`UPDATE leads SET ${setClause}, updated_at = datetime('now') WHERE id = @id`, { ...body, id } as unknown as Record<string, string | number | boolean | null>);
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [id]);
  return NextResponse.json(lead);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  await runStatement('DELETE FROM leads WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
