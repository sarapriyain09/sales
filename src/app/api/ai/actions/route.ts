import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, runStatement } from '@/lib/db-client';

type ActionPage = 'prospects' | 'pipeline' | 'leads' | 'tasks';
type ActionScope = 'single' | 'selected' | 'all' | 'open' | 'done';
type ActionName =
  | 'mark_contacted'
  | 'convert_to_lead'
  | 'move_vertical'
  | 'move_stage'
  | 'delete_leads'
  | 'mark_tasks_done'
  | 'mark_tasks_open'
  | 'delete_tasks';

interface ActionBody {
  page?: ActionPage;
  action?: ActionName;
  scope?: ActionScope;
  ids?: number[];
  leadId?: number;
  taskId?: number;
  value?: string;
}

function isActionPage(v: string): v is ActionPage {
  return ['prospects', 'pipeline', 'leads', 'tasks'].includes(v);
}

function isActionName(v: string): v is ActionName {
  return [
    'mark_contacted',
    'convert_to_lead',
    'move_vertical',
    'move_stage',
    'delete_leads',
    'mark_tasks_done',
    'mark_tasks_open',
    'delete_tasks',
  ].includes(v);
}

function cleanIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return ids.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0);
}

function sqlIn(ids: number[]) {
  return ids.map(() => '?').join(',');
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ActionBody;
  const page = String(body.page ?? '');
  const action = String(body.action ?? '');
  const scope = String(body.scope ?? 'single');

  if (!isActionPage(page)) {
    return NextResponse.json({ error: 'Invalid page.' }, { status: 400 });
  }
  if (!isActionName(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const ids = cleanIds(body.ids);

  let targetLeadIds: number[] = [];
  let targetTaskIds: number[] = [];

  if (page === 'tasks') {
    if (scope === 'single' && body.taskId) {
      targetTaskIds = [Number(body.taskId)].filter(n => Number.isFinite(n) && n > 0);
    } else if (scope === 'selected') {
      targetTaskIds = ids;
    } else if (scope === 'open') {
      targetTaskIds = (await queryAll(`SELECT id FROM tasks WHERE done = 0`) as Array<{ id: number }>).map(r => r.id);
    } else if (scope === 'done') {
      targetTaskIds = (await queryAll(`SELECT id FROM tasks WHERE done = 1`) as Array<{ id: number }>).map(r => r.id);
    } else if (scope === 'all') {
      targetTaskIds = (await queryAll(`SELECT id FROM tasks`) as Array<{ id: number }>).map(r => r.id);
    }
  } else {
    if (scope === 'single' && body.leadId) {
      targetLeadIds = [Number(body.leadId)].filter(n => Number.isFinite(n) && n > 0);
    } else if (scope === 'selected') {
      targetLeadIds = ids;
    } else if (scope === 'all') {
      const where = page === 'prospects' ? `WHERE stage = 'prospect'` : '';
      targetLeadIds = (await queryAll(`SELECT id FROM leads ${where}`) as Array<{ id: number }>).map(r => r.id);
    }
  }

  if ((page === 'tasks' && targetTaskIds.length === 0) || (page !== 'tasks' && targetLeadIds.length === 0)) {
    return NextResponse.json({ error: 'No target records for this action/scope.' }, { status: 400 });
  }

  if (page !== 'tasks') {
    const clause = sqlIn(targetLeadIds);
    if (action === 'mark_contacted') {
      await runStatement(`UPDATE leads SET contacted_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${clause})`, targetLeadIds);
      return NextResponse.json({ ok: true, action, count: targetLeadIds.length });
    }

    if (action === 'convert_to_lead') {
      await runStatement(`UPDATE leads SET stage = 'lead', status = 'new', updated_at = datetime('now') WHERE id IN (${clause})`, targetLeadIds);
      return NextResponse.json({ ok: true, action, count: targetLeadIds.length });
    }

    if (action === 'move_vertical') {
      const vertical = String(body.value ?? '').trim();
      if (!['crm', 'digital', 'software', 'ai_automation', 'engineering', 'iot'].includes(vertical)) {
        return NextResponse.json({ error: 'Invalid vertical.' }, { status: 400 });
      }
      await runStatement(`UPDATE leads SET vertical = ?, updated_at = datetime('now') WHERE id IN (${clause})`, [vertical, ...targetLeadIds]);
      return NextResponse.json({ ok: true, action, value: vertical, count: targetLeadIds.length });
    }

    if (action === 'move_stage') {
      const stage = String(body.value ?? '').trim();
      if (!['prospect', 'lead', 'contacted', 'meeting_scheduled', 'requirements', 'proposal_sent', 'negotiation', 'won', 'lost'].includes(stage)) {
        return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
      }
      await runStatement(`UPDATE leads SET stage = ?, updated_at = datetime('now') WHERE id IN (${clause})`, [stage, ...targetLeadIds]);
      return NextResponse.json({ ok: true, action, value: stage, count: targetLeadIds.length });
    }

    if (action === 'delete_leads') {
      await runStatement(`DELETE FROM leads WHERE id IN (${clause})`, targetLeadIds);
      return NextResponse.json({ ok: true, action, count: targetLeadIds.length });
    }
  }

  if (page === 'tasks') {
    const clause = sqlIn(targetTaskIds);
    if (action === 'mark_tasks_done') {
      await runStatement(`UPDATE tasks SET done = 1 WHERE id IN (${clause})`, targetTaskIds);
      return NextResponse.json({ ok: true, action, count: targetTaskIds.length });
    }
    if (action === 'mark_tasks_open') {
      await runStatement(`UPDATE tasks SET done = 0 WHERE id IN (${clause})`, targetTaskIds);
      return NextResponse.json({ ok: true, action, count: targetTaskIds.length });
    }
    if (action === 'delete_tasks') {
      await runStatement(`DELETE FROM tasks WHERE id IN (${clause})`, targetTaskIds);
      return NextResponse.json({ ok: true, action, count: targetTaskIds.length });
    }
  }

  return NextResponse.json({ error: 'Unsupported action for page.' }, { status: 400 });
}
