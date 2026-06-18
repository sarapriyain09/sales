import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const owner = searchParams.get('owner');
  const type = searchParams.get('type');
  const fromDate = searchParams.get('from_date');
  const toDate = searchParams.get('to_date');

  const db = getDb();
  let sql = `
    SELECT f.*, u.name AS assigned_user_name, o.opportunity_name, l.company_name, c.name AS contact_name
    FROM follow_ups f
    LEFT JOIN users u ON u.id = f.assigned_user
    LEFT JOIN opportunities o ON o.id = f.opportunity_id
    LEFT JOIN leads l ON l.id = f.lead_id
    LEFT JOIN contacts c ON c.id = f.contact_id
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (owner) {
    sql += ' AND f.assigned_user = ?';
    params.push(Number(owner));
  }
  if (type) {
    sql += ' AND f.follow_up_type = ?';
    params.push(type);
  }
  if (fromDate) {
    sql += ' AND date(f.follow_up_date) >= date(?)';
    params.push(fromDate);
  }
  if (toDate) {
    sql += ' AND date(f.follow_up_date) <= date(?)';
    params.push(toDate);
  }

  sql += ' ORDER BY f.follow_up_date ASC, f.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as {
    lead_id?: number | null;
    opportunity_id?: number | null;
    contact_id?: number | null;
    follow_up_date?: string;
    follow_up_type?: 'Call' | 'Meeting' | 'Email' | 'WhatsApp' | string;
    reminder_at?: string | null;
    assigned_user?: number | null;
    comments?: string | null;
  };

  if (!body.follow_up_date || !body.follow_up_type) {
    return NextResponse.json({ error: 'follow_up_date and follow_up_type are required' }, { status: 400 });
  }

  const db = getDb();
  const assignedUser = body.assigned_user ?? (session.user as { id?: number | string } | undefined)?.id ?? null;

  const tx = db.transaction(() => {
    const taskTitle = `[Follow-up] ${body.follow_up_type}${body.comments ? ` - ${body.comments}` : ''}`;
    const taskResult = db.prepare(`
      INSERT INTO tasks (lead_id, user_id, title, due_date, done)
      VALUES (?, ?, ?, ?, 0)
    `).run(body.lead_id ?? null, assignedUser, taskTitle.slice(0, 220), body.follow_up_date);

    const followResult = db.prepare(`
      INSERT INTO follow_ups (
        lead_id, opportunity_id, contact_id, follow_up_date, follow_up_type,
        reminder_at, assigned_user, comments, task_id, updated_at
      ) VALUES (
        @lead_id, @opportunity_id, @contact_id, @follow_up_date, @follow_up_type,
        @reminder_at, @assigned_user, @comments, @task_id, datetime('now')
      )
    `).run({
      lead_id: body.lead_id ?? null,
      opportunity_id: body.opportunity_id ?? null,
      contact_id: body.contact_id ?? null,
      follow_up_date: body.follow_up_date,
      follow_up_type: body.follow_up_type,
      reminder_at: body.reminder_at ?? null,
      assigned_user: assignedUser,
      comments: body.comments ?? null,
      task_id: taskResult.lastInsertRowid,
    });

    if (body.lead_id) {
      db.prepare(`
        INSERT INTO activities (lead_id, contact_id, activity_type, date, notes)
        VALUES (?, ?, 'follow_up', datetime('now'), ?)
      `).run(body.lead_id, body.contact_id ?? null, `${body.follow_up_type}: ${body.comments ?? ''}`.trim());
    }

    return followResult.lastInsertRowid;
  });

  const followUpId = tx();
  const created = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(followUpId);

  return NextResponse.json(created, { status: 201 });
}
