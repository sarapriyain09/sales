import { NextRequest, NextResponse } from 'next/server';
import { ensureWeeklyPlaybookTasks } from '@/lib/campaign-playbook';

interface SchedulerBody {
  force?: boolean;
  runAt?: string;
  userId?: number | null;
}

function isAuthorized(req: NextRequest): boolean {
  const configured = (process.env.AUTOMATION_API_KEY ?? '').trim();
  if (!configured) return false;

  const headerKey = (req.headers.get('x-automation-key') ?? '').trim();
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  return headerKey === configured || bearerKey === configured;
}

export async function POST(req: NextRequest) {
  const hasKey = Boolean((process.env.AUTOMATION_API_KEY ?? '').trim());
  if (!hasKey) {
    return NextResponse.json({ error: 'AUTOMATION_API_KEY is not configured.' }, { status: 503 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized scheduler request.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as SchedulerBody;
  const parsedRunAt = body.runAt ? new Date(body.runAt) : new Date();
  const now = Number.isNaN(parsedRunAt.getTime()) ? new Date() : parsedRunAt;

  const result = await ensureWeeklyPlaybookTasks({
    userId: body.userId ?? null,
    now,
    force: body.force === true,
  });

  return NextResponse.json({
    ok: true,
    source: 'automation-scheduler',
    created: result.created,
    skipped: result.skipped,
    weekStart: result.weekStart,
    weekEnd: result.weekEnd,
    runAt: now.toISOString(),
  });
}
