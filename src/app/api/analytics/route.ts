import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne } from '@/lib/db-client';

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const connectionsSent = ((await queryOne(`SELECT COUNT(*) as c FROM activities WHERE activity_type = 'connection_sent'`)) as { c: number }).c;
  const accepted = ((await queryOne(`SELECT COUNT(*) as c FROM activities WHERE activity_type = 'accepted'`)) as { c: number }).c;
  const replied = ((await queryOne(`SELECT COUNT(*) as c FROM activities WHERE activity_type = 'replied'`)) as { c: number }).c;
  const meetingsBooked = ((await queryOne(`SELECT COUNT(*) as c FROM activities WHERE activity_type = 'meeting_booked'`)) as { c: number }).c;

  const platformPublishing = await queryAll(`
    SELECT platform,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled
    FROM content_posts
    GROUP BY platform
    ORDER BY platform ASC
  `);

  const campaignPerformance = await queryAll(`
    SELECT c.id, c.campaign_name,
      SUM(CASE WHEN a.activity_type = 'connection_sent' THEN 1 ELSE 0 END) as connections_sent,
      SUM(CASE WHEN a.activity_type = 'accepted' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN a.activity_type = 'replied' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN a.activity_type = 'meeting_booked' THEN 1 ELSE 0 END) as meetings
    FROM campaigns c
    LEFT JOIN activities a ON a.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `) as Array<{
    id: number;
    campaign_name: string;
    connections_sent: number;
    accepted: number;
    replied: number;
    meetings: number;
  }>;

  const campaigns = campaignPerformance.map((row) => ({
    ...row,
    acceptance_rate: ratio(row.accepted ?? 0, row.connections_sent ?? 0),
    reply_rate: ratio(row.replied ?? 0, row.accepted ?? 0),
    meeting_rate: ratio(row.meetings ?? 0, row.replied ?? 0),
  }));

  return NextResponse.json({
    linkedin: {
      connections_sent: connectionsSent,
      accepted,
      replied,
      meetings_booked: meetingsBooked,
      acceptance_rate: ratio(accepted, connectionsSent),
      reply_rate: ratio(replied, accepted),
      meeting_rate: ratio(meetingsBooked, replied),
    },
    campaigns,
    publishing: platformPublishing,
  });
}
