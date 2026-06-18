import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const opportunity = db.prepare(`
    SELECT o.*, c.name AS company_name, ct.name AS contact_name, u.name AS assigned_user_name,
      p.name AS pipeline_name, s.name AS stage_name, s.is_won, s.is_closed,
      ROUND(COALESCE(o.estimated_value, 0) * (COALESCE(o.probability, 0) / 100.0), 2) AS forecast_value
    FROM opportunities o
    LEFT JOIN companies c ON c.id = o.company_id
    LEFT JOIN contacts ct ON ct.id = o.contact_id
    LEFT JOIN users u ON u.id = o.assigned_user
    LEFT JOIN pipelines p ON p.id = o.pipeline_id
    LEFT JOIN pipeline_stages s ON s.id = o.stage_id
    WHERE o.id = ?
  `).get(id);

  if (!opportunity) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const followUps = db.prepare(`
    SELECT f.*, u.name AS assigned_user_name
    FROM follow_ups f
    LEFT JOIN users u ON u.id = f.assigned_user
    WHERE f.opportunity_id = ?
    ORDER BY f.follow_up_date ASC
  `).all(id);

  const quotes = db.prepare('SELECT * FROM quotes WHERE opportunity_id = ? ORDER BY created_at DESC').all(id);

  return NextResponse.json({ opportunity, followUps, quotes });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const body = await req.json() as Record<string, unknown>;

  const fields = Object.keys(body).filter(k => k !== 'id');
  if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const setClause = fields.map(f => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE opportunities SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({ ...body, id });

  const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);

  return NextResponse.json({ ok: true });
}
