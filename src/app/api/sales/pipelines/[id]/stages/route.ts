import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement, withTransaction } from '@/lib/db-client';

type Params = { params: Promise<{ id: string }> };

type StageInput = {
  id?: number;
  name?: string;
  sort_order?: number;
  is_closed?: number | boolean;
  is_won?: number | boolean;
  default_probability?: number;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const stages = await queryAll(`
    SELECT *
    FROM pipeline_stages
    WHERE pipeline_id = ?
    ORDER BY sort_order ASC, id ASC
  `, [id]);

  return NextResponse.json(stages);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const pipelineId = Number(id);
  if (!Number.isFinite(pipelineId)) return NextResponse.json({ error: 'Invalid pipeline id' }, { status: 400 });

  const body = await req.json() as { stages?: StageInput[] };
  const stages = Array.isArray(body.stages) ? body.stages : [];
  if (stages.length === 0) {
    return NextResponse.json({ error: 'At least one stage is required' }, { status: 400 });
  }

  await withTransaction(async () => {
    await runStatement('DELETE FROM pipeline_stages WHERE pipeline_id = ?', [pipelineId]);

    for (let i = 0; i < stages.length; i += 1) {
      const stage = stages[i];
      const stageName = (stage.name ?? '').trim();
      if (!stageName) continue;

      await runStatement(`
        INSERT INTO pipeline_stages (pipeline_id, name, sort_order, is_closed, is_won, default_probability, updated_at)
        VALUES (@pipeline_id, @name, @sort_order, @is_closed, @is_won, @default_probability, datetime('now'))
      `, {
        pipeline_id: pipelineId,
        name: stageName,
        sort_order: Number.isFinite(stage.sort_order) ? Number(stage.sort_order) : i + 1,
        is_closed: stage.is_closed ? 1 : 0,
        is_won: stage.is_won ? 1 : 0,
        default_probability: Number.isFinite(stage.default_probability) ? Number(stage.default_probability) : 0,
      });
    }

    await runStatement('UPDATE pipelines SET updated_at = datetime(\'now\') WHERE id = ?', [pipelineId]);
  });

  const updated = await queryAll('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC, id ASC', [pipelineId]);
  return NextResponse.json(updated);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const pipelineId = Number(id);
  if (!Number.isFinite(pipelineId)) return NextResponse.json({ error: 'Invalid pipeline id' }, { status: 400 });

  const body = await req.json() as StageInput;
  const stageName = (body.name ?? '').trim();
  if (!stageName) return NextResponse.json({ error: 'Stage name is required' }, { status: 400 });

  const maxSort = await queryOne('SELECT COALESCE(MAX(sort_order), 0) as sort_order FROM pipeline_stages WHERE pipeline_id = ?', [pipelineId]) as { sort_order: number };

  const result = await runStatement(`
    INSERT INTO pipeline_stages (pipeline_id, name, sort_order, is_closed, is_won, default_probability, updated_at)
    VALUES (@pipeline_id, @name, @sort_order, @is_closed, @is_won, @default_probability, datetime('now'))
  `, {
    pipeline_id: pipelineId,
    name: stageName,
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : Number(maxSort.sort_order) + 1,
    is_closed: body.is_closed ? 1 : 0,
    is_won: body.is_won ? 1 : 0,
    default_probability: Number.isFinite(body.default_probability) ? Number(body.default_probability) : 0,
  });

  const stage = await queryOne('SELECT * FROM pipeline_stages WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(stage, { status: 201 });
}
