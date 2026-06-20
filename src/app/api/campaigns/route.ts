import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Campaign } from '@/lib/types';

function parseServices(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let sql = `
    SELECT c.*,
      COALESCE(SUM(CASE WHEN a.activity_type = 'connection_sent' THEN 1 ELSE 0 END), 0) as connections_sent,
      COALESCE(SUM(CASE WHEN a.activity_type = 'accepted' THEN 1 ELSE 0 END), 0) as accepted_count,
      COALESCE(SUM(CASE WHEN a.activity_type = 'replied' THEN 1 ELSE 0 END), 0) as replied_count,
      COALESCE(SUM(CASE WHEN a.activity_type = 'meeting_booked' THEN 1 ELSE 0 END), 0) as meetings_booked
    FROM campaigns c
    LEFT JOIN activities a ON a.campaign_id = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (c.campaign_name LIKE ? OR c.target_industry LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }

  sql += ' GROUP BY c.id ORDER BY c.created_at DESC';

  const campaigns = await queryAll(sql, params) as Array<Record<string, unknown>>;
  return NextResponse.json(
    campaigns.map((campaign) => ({
      ...campaign,
      services: parseServices(campaign.services_json),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as Partial<Campaign>;

  if (!body.campaign_name?.trim()) {
    return NextResponse.json({ error: 'campaign_name is required' }, { status: 400 });
  }

  const services = Array.isArray((body as { services?: unknown }).services)
    ? ((body as { services?: unknown }).services as unknown[]).filter((item): item is string => typeof item === 'string')
    : parseServices(body.services_json);

  const result = await runStatement(`
    INSERT INTO campaigns
      (campaign_name, target_industry, start_date, end_date, duration_days, focus_service, services_json, objective, status, updated_at)
    VALUES
      (@campaign_name, @target_industry, @start_date, @end_date, @duration_days, @focus_service, @services_json, @objective, @status, datetime('now'))
  `, {
    campaign_name: body.campaign_name.trim(),
    target_industry: body.target_industry ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    duration_days: body.duration_days ?? null,
    focus_service: body.focus_service ?? null,
    services_json: JSON.stringify(services),
    objective: body.objective ?? null,
    status: body.status ?? 'draft',
  } as unknown as Record<string, string | number | boolean | null>);

  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ?', [Number(result.lastInsertId)]) as Record<string, unknown> | undefined;
  if (!campaign) return NextResponse.json({ error: 'Campaign creation failed' }, { status: 500 });
  return NextResponse.json({ ...campaign, services: parseServices(campaign.services_json) }, { status: 201 });
}
