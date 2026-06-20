import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db-client';

export const dynamic = 'force-dynamic';

function getProvidedToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return (req.headers.get('x-webhook-token') ?? '').trim();
}

function tokenValid(req: NextRequest): boolean {
  const expected = (process.env.CRM_WEBHOOK_TOKEN ?? '').trim();
  if (!expected) return true;
  return getProvidedToken(req) === expected;
}

export async function GET(req: NextRequest) {
  if (!tokenValid(req)) {
    return NextResponse.json({ error: 'invalid_webhook_token' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get('status') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? '50') || 50, 200);

  if (status) {
    const rows = await queryAll(`
      SELECT id, event_id, lead_id, call_id, summary, action_type, action_title, payload_json, status, source, created_at, reviewed_at, executed_at
      FROM agent_actions
      WHERE status = @status
      ORDER BY datetime(created_at) DESC
      LIMIT @limit
    `, { status, limit });
    return NextResponse.json(rows);
  }

  const rows = await queryAll(`
    SELECT id, event_id, lead_id, call_id, summary, action_type, action_title, payload_json, status, source, created_at, reviewed_at, executed_at
    FROM agent_actions
    ORDER BY datetime(created_at) DESC
    LIMIT @limit
  `, { limit });

  return NextResponse.json(rows);
}
