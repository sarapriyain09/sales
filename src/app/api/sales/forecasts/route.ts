import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const owner = searchParams.get('owner');
  const fromDate = searchParams.get('from_date');
  const toDate = searchParams.get('to_date');

  const db = getDb();
  let where = 'WHERE 1=1';
  const params: Array<string | number> = [];

  if (owner) {
    where += ' AND o.assigned_user = ?';
    params.push(Number(owner));
  }
  if (fromDate) {
    where += ' AND date(o.expected_close_date) >= date(?)';
    params.push(fromDate);
  }
  if (toDate) {
    where += ' AND date(o.expected_close_date) <= date(?)';
    params.push(toDate);
  }

  const metrics = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN o.status = 'open' THEN o.estimated_value ELSE 0 END), 0) AS current_pipeline_value,
      COALESCE(SUM(CASE WHEN o.status = 'open' THEN o.estimated_value * (o.probability / 100.0) ELSE 0 END), 0) AS weighted_pipeline,
      COALESCE(SUM(CASE WHEN o.status = 'won' THEN o.estimated_value ELSE 0 END), 0) AS closed_revenue,
      SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END) AS won_count,
      SUM(CASE WHEN o.status = 'lost' THEN 1 ELSE 0 END) AS lost_count
    FROM opportunities o
    ${where}
  `).get(...params) as {
    current_pipeline_value: number;
    weighted_pipeline: number;
    closed_revenue: number;
    won_count: number;
    lost_count: number;
  };

  const decisionCount = Number(metrics.won_count) + Number(metrics.lost_count);
  const winRate = decisionCount > 0 ? (Number(metrics.won_count) / decisionCount) * 100 : 0;

  const items = db.prepare(`
    SELECT o.id, o.opportunity_name, o.estimated_value, o.probability, o.expected_close_date,
      ROUND(COALESCE(o.estimated_value, 0) * (COALESCE(o.probability, 0) / 100.0), 2) AS forecast_value,
      c.name AS company_name, s.name AS stage_name, o.status
    FROM opportunities o
    LEFT JOIN companies c ON c.id = o.company_id
    LEFT JOIN pipeline_stages s ON s.id = o.stage_id
    ${where}
    ORDER BY o.expected_close_date ASC, o.updated_at DESC
  `).all(...params);

  return NextResponse.json({
    currentPipelineValue: Number(metrics.current_pipeline_value || 0),
    weightedPipeline: Number(metrics.weighted_pipeline || 0),
    closedRevenue: Number(metrics.closed_revenue || 0),
    winRate,
    items,
  });
}
