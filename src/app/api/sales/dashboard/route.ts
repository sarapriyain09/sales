import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne } from '@/lib/db-client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const leadsByStatus = await queryAll(`
    SELECT status, COUNT(*) AS count
    FROM leads
    GROUP BY status
    ORDER BY count DESC
  `);

  const opportunitiesByStage = await queryAll(`
    SELECT s.name AS stage, COUNT(o.id) AS count
    FROM pipeline_stages s
    LEFT JOIN opportunities o ON o.stage_id = s.id
    GROUP BY s.id, s.name
    ORDER BY s.sort_order ASC
  `);

  const pipelineValue = (await queryOne(`
    SELECT COALESCE(SUM(estimated_value), 0) AS total
    FROM opportunities
    WHERE status = 'open'
  `) as { total: number }).total;

  const weightedPipeline = (await queryOne(`
    SELECT COALESCE(SUM(estimated_value * (probability / 100.0)), 0) AS total
    FROM opportunities
    WHERE status = 'open'
  `) as { total: number }).total;

  const closedRevenue = (await queryOne(`
    SELECT COALESCE(SUM(estimated_value), 0) AS total
    FROM opportunities
    WHERE status = 'won'
  `) as { total: number }).total;

  const wonCount = (await queryOne("SELECT COUNT(*) AS c FROM opportunities WHERE status = 'won'") as { c: number }).c;
  const lostCount = (await queryOne("SELECT COUNT(*) AS c FROM opportunities WHERE status = 'lost'") as { c: number }).c;
  const decisionCount = wonCount + lostCount;
  const winRate = decisionCount > 0 ? (wonCount / decisionCount) * 100 : 0;

  const monthlySales = (await queryAll(`
    SELECT strftime('%Y-%m', COALESCE(expected_close_date, created_at)) AS month,
           ROUND(SUM(CASE WHEN status = 'won' THEN estimated_value ELSE 0 END), 2) AS won_value
    FROM opportunities
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `)).reverse();

  const opportunitiesByCreatedMonth = (await queryAll(`
    SELECT strftime('%Y-%m', created_at) AS month,
           COUNT(*) AS opp_count,
           ROUND(COALESCE(SUM(estimated_value), 0), 2) AS total_value
    FROM opportunities
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `)).reverse();

  const opportunitiesByWinMonth = (await queryAll(`
    SELECT strftime('%Y-%m', COALESCE(won_at, updated_at)) AS month,
           COUNT(*) AS won_count,
           ROUND(COALESCE(SUM(estimated_value), 0), 2) AS won_value
    FROM opportunities
    WHERE status = 'won'
      AND COALESCE(won_at, updated_at) IS NOT NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `)).reverse();

  const upcomingFollowUps = await queryAll(`
    SELECT f.*, o.opportunity_name, l.company_name, c.name AS contact_name
    FROM follow_ups f
    LEFT JOIN opportunities o ON o.id = f.opportunity_id
    LEFT JOIN leads l ON l.id = f.lead_id
    LEFT JOIN contacts c ON c.id = f.contact_id
    WHERE date(f.follow_up_date) >= date('now')
      AND f.status = 'pending'
    ORDER BY f.follow_up_date ASC
    LIMIT 10
  `);

  const recentActivities = await queryAll(`
    SELECT a.*, l.company_name, c.name AS contact_name
    FROM activities a
    LEFT JOIN leads l ON l.id = a.lead_id
    LEFT JOIN contacts c ON c.id = a.contact_id
    ORDER BY a.date DESC, a.created_at DESC
    LIMIT 10
  `);

  return NextResponse.json({
    leadsByStatus,
    opportunitiesByStage,
    pipelineValue,
    weightedPipeline,
    closedRevenue,
    winRate,
    monthlySales,
    opportunitiesByCreatedMonth,
    opportunitiesByWinMonth,
    upcomingFollowUps,
    recentActivities,
  });
}
