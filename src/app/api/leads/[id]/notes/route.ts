import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement } from '@/lib/db-client';

type Params = { params: Promise<{ id: string }> };

// POST /api/leads/[id]/notes
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });

  const user = await queryOne('SELECT id FROM users WHERE email = ?', [session.user?.email ?? '']) as { id: number } | undefined;
  const result = await runStatement('INSERT INTO notes (lead_id, user_id, content) VALUES (?, ?, ?)', [id, user?.id ?? null, content.trim()]);
  const note = await queryOne('SELECT n.*, u.name as user_name FROM notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(note, { status: 201 });
}
