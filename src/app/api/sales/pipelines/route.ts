import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const pipelines = await queryAll(`
    SELECT p.*,
      (
        SELECT COUNT(*)
        FROM pipeline_stages s
        WHERE s.pipeline_id = p.id
      ) AS stage_count
    FROM pipelines p
    ORDER BY p.sort_order ASC, p.created_at ASC
  `);

  return NextResponse.json(pipelines);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; sort_order?: number };
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Pipeline name is required' }, { status: 400 });

  const result = await runStatement(`
    INSERT INTO pipelines (name, description, sort_order, updated_at)
    VALUES (@name, @description, @sort_order, datetime('now'))
  `, {
    name,
    description: body.description?.trim() || null,
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 999,
  });

  const pipeline = await queryOne('SELECT * FROM pipelines WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(pipeline, { status: 201 });
}
