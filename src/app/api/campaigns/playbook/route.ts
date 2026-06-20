import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  CRM_DAILY_ACTIVITIES,
  CRM_WEEKLY_ACTIVITIES,
  ensureWeeklyPlaybookTasks,
  getMondayIsoDate,
} from '@/lib/campaign-playbook';

interface CreatePlaybookBody {
  startDate?: string;
  force?: boolean;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  return NextResponse.json({
    daily: CRM_DAILY_ACTIVITIES,
    weekly: CRM_WEEKLY_ACTIVITIES,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CreatePlaybookBody;
  const requestedStartDate = body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : getMondayIsoDate(new Date());

  const userId = Number((session.user as { id?: string | number } | undefined)?.id ?? 0) || null;
  const result = await ensureWeeklyPlaybookTasks({
    userId,
    now: new Date(`${requestedStartDate}T08:00:00`),
    force: body.force === true,
  });

  return NextResponse.json({
    ok: true,
    created: result.created,
    startDate: result.weekStart,
    endDate: result.weekEnd,
    skipped: result.skipped,
  });
}
