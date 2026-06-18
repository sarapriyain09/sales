import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get('owner');
  const stage = searchParams.get('stage');
  const status = searchParams.get('status');
  const company = searchParams.get('company');
  const valueMin = searchParams.get('value_min');
  const valueMax = searchParams.get('value_max');
  const fromDate = searchParams.get('from_date');
  const toDate = searchParams.get('to_date');
  const search = searchParams.get('search');

  let sql = `
    SELECT o.*, c.name AS company_name, ct.name AS contact_name, u.name AS assigned_user_name,
      p.name AS pipeline_name, s.name AS stage_name, s.is_closed, s.is_won,
      ROUND(COALESCE(o.estimated_value, 0) * (COALESCE(o.probability, 0) / 100.0), 2) AS forecast_value
    FROM opportunities o
    LEFT JOIN companies c ON c.id = o.company_id
    LEFT JOIN contacts ct ON ct.id = o.contact_id
    LEFT JOIN users u ON u.id = o.assigned_user
    LEFT JOIN pipelines p ON p.id = o.pipeline_id
    LEFT JOIN pipeline_stages s ON s.id = o.stage_id
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (owner) {
    sql += ' AND o.assigned_user = ?';
    params.push(Number(owner));
  }
  if (stage) {
    sql += ' AND s.name = ?';
    params.push(stage);
  }
  if (status) {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  if (company) {
    sql += ' AND c.name LIKE ?';
    params.push(`%${company}%`);
  }
  if (valueMin) {
    sql += ' AND COALESCE(o.estimated_value, 0) >= ?';
    params.push(Number(valueMin));
  }
  if (valueMax) {
    sql += ' AND COALESCE(o.estimated_value, 0) <= ?';
    params.push(Number(valueMax));
  }
  if (fromDate) {
    sql += ' AND date(o.expected_close_date) >= date(?)';
    params.push(fromDate);
  }
  if (toDate) {
    sql += ' AND date(o.expected_close_date) <= date(?)';
    params.push(toDate);
  }
  if (search) {
    sql += ' AND (o.opportunity_name LIKE ? OR c.name LIKE ? OR ct.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY s.sort_order ASC, o.updated_at DESC';

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as {
    opportunity_name?: string;
    company_id?: number | null;
    contact_id?: number | null;
    lead_id?: number | null;
    pipeline_id?: number | null;
    stage_id?: number | null;
    estimated_value?: number;
    probability?: number;
    expected_close_date?: string | null;
    assigned_user?: number | null;
    status?: string;
    notes?: string | null;
  };

  const opportunityName = (body.opportunity_name ?? '').trim();
  if (!opportunityName) return NextResponse.json({ error: 'opportunity_name is required' }, { status: 400 });

  const db = getDb();
  let pipelineId = body.pipeline_id ?? null;
  if (!pipelineId) {
    const defaultPipeline = db.prepare('SELECT id FROM pipelines ORDER BY sort_order ASC, id ASC LIMIT 1').get() as { id: number } | undefined;
    pipelineId = defaultPipeline?.id ?? null;
  }

  let stageId = body.stage_id ?? null;
  if (!stageId && pipelineId) {
    const defaultStage = db.prepare('SELECT id, default_probability FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(pipelineId) as { id: number; default_probability: number } | undefined;
    stageId = defaultStage?.id ?? null;
    if (!body.probability && defaultStage) {
      body.probability = defaultStage.default_probability;
    }
  }

  const result = db.prepare(`
    INSERT INTO opportunities (
      opportunity_name, company_id, contact_id, lead_id, pipeline_id, stage_id,
      estimated_value, probability, expected_close_date, assigned_user, status, notes, won_at, updated_at
    ) VALUES (
      @opportunity_name, @company_id, @contact_id, @lead_id, @pipeline_id, @stage_id,
      @estimated_value, @probability, @expected_close_date, @assigned_user, @status, @notes, @won_at, datetime('now')
    )
  `).run({
    opportunity_name: opportunityName,
    company_id: body.company_id ?? null,
    contact_id: body.contact_id ?? null,
    lead_id: body.lead_id ?? null,
    pipeline_id: pipelineId,
    stage_id: stageId,
    estimated_value: Number.isFinite(body.estimated_value) ? Number(body.estimated_value) : 0,
    probability: Number.isFinite(body.probability) ? Number(body.probability) : 0,
    expected_close_date: body.expected_close_date ?? null,
    assigned_user: body.assigned_user ?? (session.user as { id?: number | string } | undefined)?.id ?? null,
    status: (body.status ?? 'open').toLowerCase(),
    notes: body.notes ?? null,
    won_at: (body.status ?? 'open').toLowerCase() === 'won' ? new Date().toISOString() : null,
  });

  const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(created, { status: 201 });
}
