import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Activity } from '@/lib/types';

const LINKEDIN_STATUS_BY_ACTIVITY: Record<string, string> = {
  connection_sent: 'Pending',
  accepted: 'Connected',
  message_sent: 'Message1',
  replied: 'Interested',
  meeting_booked: 'Qualified',
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contact_id');
  const campaignId = searchParams.get('campaign_id');
  const activityType = searchParams.get('activity_type');

  let sql = `
    SELECT a.*, c.name as contact_name, l.company_name, cp.campaign_name
    FROM activities a
    LEFT JOIN contacts c ON a.contact_id = c.id
    LEFT JOIN leads l ON a.lead_id = l.id
    LEFT JOIN campaigns cp ON a.campaign_id = cp.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (contactId) {
    sql += ' AND a.contact_id = ?';
    params.push(Number(contactId));
  }
  if (campaignId) {
    sql += ' AND a.campaign_id = ?';
    params.push(Number(campaignId));
  }
  if (activityType) {
    sql += ' AND a.activity_type = ?';
    params.push(activityType);
  }

  sql += ' ORDER BY a.date DESC, a.created_at DESC';

  const activities = await queryAll(sql, params);
  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as Partial<Activity> & { metadata?: unknown };

  if (!body.activity_type?.trim()) {
    return NextResponse.json({ error: 'activity_type is required' }, { status: 400 });
  }

  const result = await runStatement(`
    INSERT INTO activities
      (contact_id, lead_id, campaign_id, activity_type, date, notes, metadata_json)
    VALUES
      (@contact_id, @lead_id, @campaign_id, @activity_type, @date, @notes, @metadata_json)
  `, {
    contact_id: body.contact_id ?? null,
    lead_id: body.lead_id ?? null,
    campaign_id: body.campaign_id ?? null,
    activity_type: body.activity_type.trim(),
    date: body.date ?? new Date().toISOString(),
    notes: body.notes ?? null,
    metadata_json: body.metadata ? JSON.stringify(body.metadata) : body.metadata_json ?? null,
  } as unknown as Record<string, string | number | boolean | null>);

  const mappedStatus = LINKEDIN_STATUS_BY_ACTIVITY[body.activity_type.trim()];
  if (mappedStatus && body.contact_id) {
    await runStatement('UPDATE contacts SET status = ? WHERE id = ?', [mappedStatus, body.contact_id]);
  }

  const activity = await queryOne('SELECT * FROM activities WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(activity, { status: 201 });
}
