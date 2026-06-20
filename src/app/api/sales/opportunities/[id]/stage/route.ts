import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement } from '@/lib/db-client';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const opportunityId = Number(id);
  if (!Number.isFinite(opportunityId)) return NextResponse.json({ error: 'Invalid opportunity id' }, { status: 400 });

  const body = await req.json() as { stage_id?: number };
  const stageId = Number(body.stage_id);
  if (!Number.isFinite(stageId)) return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });

  const stage = await queryOne('SELECT id, is_closed, is_won, default_probability FROM pipeline_stages WHERE id = ?', [stageId]) as { id: number; is_closed: number; is_won: number; default_probability: number } | undefined;
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

  const nextStatus = stage.is_closed ? (stage.is_won ? 'won' : 'lost') : 'open';

  await runStatement(`
    UPDATE opportunities
    SET stage_id = ?,
        status = ?,
        probability = CASE WHEN probability = 0 THEN ? ELSE probability END,
        won_at = CASE
          WHEN ? = 'won' THEN COALESCE(won_at, datetime('now'))
          ELSE NULL
        END,
        updated_at = datetime('now')
    WHERE id = ?
  `, [stage.id, nextStatus, stage.default_probability, nextStatus, opportunityId]);

  const updated = await queryOne('SELECT * FROM opportunities WHERE id = ?', [opportunityId]);
  return NextResponse.json(updated);
}
