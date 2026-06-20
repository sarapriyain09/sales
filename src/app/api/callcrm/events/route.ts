import { NextRequest, NextResponse } from 'next/server';
import { queryOne, runStatement } from '@/lib/db-client';

export const dynamic = 'force-dynamic';

type IncomingAction = string | Record<string, unknown>;

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

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function normalizeActions(raw: unknown): IncomingAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => typeof item === 'string' || (item && typeof item === 'object')) as IncomingAction[];
}

export async function POST(req: NextRequest) {
  if ((process.env.CRM_SYNC_ENABLED ?? '').toLowerCase() !== 'true') {
    return NextResponse.json({ error: 'crm_sync_disabled' }, { status: 503 });
  }

  if (!tokenValid(req)) {
    return NextResponse.json({ error: 'invalid_webhook_token' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const leadIdCandidate =
    toNumberOrNull(body.leadId) ??
    toNumberOrNull((body.call as Record<string, unknown> | undefined)?.leadId) ??
    toNumberOrNull((body.context as Record<string, unknown> | undefined)?.leadId);

  const leadExists = leadIdCandidate
    ? await queryOne('SELECT 1 AS ok FROM leads WHERE id = ?', [leadIdCandidate])
    : null;
  const leadId = leadExists ? leadIdCandidate : null;

  const summary =
    toStringOrNull(body.summary) ??
    toStringOrNull((body.call as Record<string, unknown> | undefined)?.summary) ??
    toStringOrNull((body.ai as Record<string, unknown> | undefined)?.summary);

  const callId =
    toStringOrNull(body.callId) ??
    toStringOrNull((body.call as Record<string, unknown> | undefined)?.id);

  const eventId =
    toStringOrNull(body.eventId) ??
    toStringOrNull(body.id) ??
    toStringOrNull((body.event as Record<string, unknown> | undefined)?.id);

  const actions = normalizeActions(
    body.actions ??
    (body.ai as Record<string, unknown> | undefined)?.actions ??
    (body.agent as Record<string, unknown> | undefined)?.actions,
  );

  if (summary && leadId) {
    await runStatement(`
      INSERT INTO notes (lead_id, user_id, content, created_at)
      VALUES (@lead_id, NULL, @body, datetime('now'))
    `, {
      lead_id: leadId,
      body: `🤖 AI call summary:\n${summary}`,
    });
  }

  const approvalMode = (process.env.AGENT_APPROVAL_MODE ?? 'review').toLowerCase();
  const status = approvalMode === 'auto' ? 'approved' : 'pending_review';

  const insertActionSql = `
    INSERT INTO agent_actions (
      event_id, lead_id, call_id, summary, action_type, action_title, payload_json, status, source, created_at
    ) VALUES (
      @event_id, @lead_id, @call_id, @summary, @action_type, @action_title, @payload_json, @status, 'callcrm', datetime('now')
    )
  `;

  let inserted = 0;
  for (const action of actions) {
    if (typeof action === 'string') {
      await runStatement(insertActionSql, {
        event_id: eventId,
        lead_id: leadId,
        call_id: callId,
        summary,
        action_type: 'suggested_action',
        action_title: action.slice(0, 240),
        payload_json: JSON.stringify({ raw: action }),
        status,
      } as unknown as Record<string, string | number | boolean | null>);
      inserted += 1;
      continue;
    }

    const actionType =
      toStringOrNull(action.type) ??
      toStringOrNull(action.action) ??
      'suggested_action';

    const actionTitle =
      toStringOrNull(action.title) ??
      toStringOrNull(action.description) ??
      JSON.stringify(action).slice(0, 240);

    await runStatement(insertActionSql, {
      event_id: eventId,
      lead_id: leadId,
      call_id: callId,
      summary,
      action_type: actionType,
      action_title: actionTitle,
      payload_json: JSON.stringify(action),
      status,
    } as unknown as Record<string, string | number | boolean | null>);
    inserted += 1;
  }

  return NextResponse.json({
    ok: true,
    leadId,
    summarySaved: Boolean(summary && leadId),
    actionsInserted: inserted,
    approvalMode,
  });
}
