import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import { getServerSession } from 'next-auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lead_id, title, due_date } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const result = await runStatement(`INSERT INTO tasks (lead_id, title, due_date) VALUES (?, ?, ?)`, [lead_id || null, title.trim(), due_date || null]);
  const task = await queryOne(`SELECT * FROM tasks WHERE id = ?`, [Number(result.lastInsertId)]);
  return NextResponse.json(task, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const done = searchParams.get('done');
  const category = searchParams.get('category');

  let sql = `SELECT t.*, l.company_name FROM tasks t LEFT JOIN leads l ON t.lead_id = l.id`;
  const params: Array<string | number> = [];
  const whereParts: string[] = [];
  if (done !== null) {
    whereParts.push('t.done = ?');
    params.push(Number(done));
  }
  if (category === 'campaign') {
    whereParts.push("t.title LIKE '[CRM 90-Day] %'");
  }
  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(' AND ')}`;
  }
  sql += ` ORDER BY t.done ASC, t.due_date ASC, t.created_at DESC`;

  const tasks = await queryAll(sql, params);
  return NextResponse.json(tasks);
}
