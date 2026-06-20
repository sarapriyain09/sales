import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne } from '@/lib/db-client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const newLeadsToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM leads
    WHERE date(created_at) = date('now')
  `)) as { c: number }).c;

  const contactedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type IN ('connection_sent', 'message_sent', 'email_sent', 'sms_sent')
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const repliedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type IN ('replied', 'email_reply', 'linkedin_reply')
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const meetingsBookedToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM activities
    WHERE activity_type = 'meeting_booked'
      AND date(date) = date('now')
  `)) as { c: number }).c;

  const followUpsDueToday = ((await queryOne(`
    SELECT COUNT(*) as c
    FROM tasks
    WHERE done = 0
      AND due_date IS NOT NULL
      AND date(due_date) <= date('now')
  `)) as { c: number }).c;

  const priorityFollowUps = await queryAll(`
    SELECT t.id, t.title, t.due_date, l.id as lead_id, l.company_name, l.stage, l.lead_score
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id
    WHERE t.done = 0
      AND t.due_date IS NOT NULL
      AND date(t.due_date) <= date('now')
    ORDER BY l.lead_score DESC, date(t.due_date) ASC
    LIMIT 10
  `);

  return NextResponse.json({
    summary: {
      new_leads_found: newLeadsToday,
      contacted: contactedToday,
      replied: repliedToday,
      meetings_booked: meetingsBookedToday,
      followups_due_today: followUpsDueToday,
    },
    message: `Here are ${newLeadsToday} new prospects, ${followUpsDueToday} follow-ups due, ${repliedToday} replies received, and ${meetingsBookedToday} meetings booked today.`,
    priority_followups: priorityFollowUps,
  });
}
