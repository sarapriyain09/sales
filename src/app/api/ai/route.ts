import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne } from '@/lib/db-client';
import { generateChatCompletion } from '@/lib/openai';

type AiTask = 'crm_qa' | 'lead_summary' | 'follow_up_email' | 'pipeline_insights';

interface AiRequestBody {
  task?: AiTask;
  prompt?: string;
  leadId?: number;
}

function isAiTask(value: string): value is AiTask {
  return ['crm_qa', 'lead_summary', 'follow_up_email', 'pipeline_insights'].includes(value);
}

function truncate(value: string, max = 2500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

async function buildLeadContext(leadId: number) {
  const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [leadId]) as Record<string, unknown> | undefined;
  if (!lead) return null;

  const notes = await queryAll('SELECT content, created_at FROM notes WHERE lead_id = ? ORDER BY datetime(created_at) DESC LIMIT 5', [leadId]) as Array<{ content: string; created_at: string }>;

  const tasks = await queryAll('SELECT title, due_date, done FROM tasks WHERE lead_id = ? ORDER BY done ASC, due_date ASC LIMIT 8', [leadId]) as Array<{ title: string; due_date: string | null; done: number }>;

  const quotes = await queryAll('SELECT quote_number, status, total, created_at FROM quotes WHERE lead_id = ? ORDER BY datetime(created_at) DESC LIMIT 5', [leadId]) as Array<{ quote_number: string; status: string; total: number; created_at: string }>;

  return {
    lead,
    notes,
    tasks,
    quotes,
  };
}

async function buildPipelineContext() {
  const stageCounts = await queryAll('SELECT stage, COUNT(*) as count FROM leads GROUP BY stage ORDER BY count DESC') as Array<{ stage: string; count: number }>;

  const stalledDeals = await queryAll(`
      SELECT id, company_name, stage, lead_score, updated_at, next_followup_date, opportunity_value
      FROM leads
      WHERE stage NOT IN ('won', 'lost')
        AND datetime(updated_at) <= datetime('now', '-30 days')
      ORDER BY datetime(updated_at) ASC
      LIMIT 25
    `) as Array<Record<string, unknown>>;

  const highValueOpen = await queryAll(`
      SELECT id, company_name, stage, opportunity_value, lead_score
      FROM leads
      WHERE stage NOT IN ('won', 'lost')
        AND opportunity_value IS NOT NULL
      ORDER BY opportunity_value DESC
      LIMIT 15
    `) as Array<Record<string, unknown>>;

  return {
    stageCounts,
    stalledDeals,
    highValueOpen,
  };
}

function buildUserPrompt(task: AiTask, body: AiRequestBody, context: unknown): string {
  const contextJson = truncate(JSON.stringify(context, null, 2), 10000);
  const userPrompt = (body.prompt ?? '').trim();

  if (task === 'lead_summary') {
    return [
      'Create a concise lead summary and next actions.',
      'Output format:',
      '1) Snapshot (3 bullets)',
      '2) Risks (3 bullets)',
      '3) Next best actions (5 bullets with clear priority)',
      '',
      'Lead context JSON:',
      contextJson,
    ].join('\n');
  }

  if (task === 'follow_up_email') {
    return [
      'Draft a practical follow-up email for this lead.',
      'Requirements:',
      '- Professional, concise, and personalized.',
      '- Include one clear call to action.',
      '- Keep under 180 words.',
      '- Include subject line and body.',
      '',
      userPrompt ? `Extra guidance from user: ${userPrompt}` : 'No extra guidance provided by user.',
      '',
      'Lead context JSON:',
      contextJson,
    ].join('\n');
  }

  if (task === 'pipeline_insights') {
    return [
      'Analyze this CRM pipeline and provide management-ready insights.',
      'Output format:',
      '1) Top findings',
      '2) Stalled deals to rescue',
      '3) Forecast risk summary',
      '4) 7-day action plan',
      '',
      'Pipeline context JSON:',
      contextJson,
    ].join('\n');
  }

  return [
    'Answer this CRM question using the provided data. If data is insufficient, say exactly what is missing.',
    userPrompt ? `Question: ${userPrompt}` : 'Question: Give me the highest-priority follow-up list for today.',
    '',
    'CRM context JSON:',
    contextJson,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as AiRequestBody;
  const taskRaw = (body.task ?? 'crm_qa').toString();
  if (!isAiTask(taskRaw)) {
    return NextResponse.json({ error: 'Invalid task.' }, { status: 400 });
  }

  const task = taskRaw as AiTask;

  let context: unknown;

  if (task === 'lead_summary' || task === 'follow_up_email') {
    if (!body.leadId || Number.isNaN(Number(body.leadId))) {
      return NextResponse.json({ error: 'leadId is required for this task.' }, { status: 400 });
    }

    const leadContext = await buildLeadContext(Number(body.leadId));
    if (!leadContext) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }
    context = leadContext;
  } else if (task === 'pipeline_insights') {
    context = await buildPipelineContext();
  } else {
    const recentLeads = await queryAll(`
        SELECT id, company_name, stage, status, lead_score, next_followup_date, updated_at
        FROM leads
        ORDER BY lead_score DESC, datetime(updated_at) DESC
        LIMIT 40
      `);

    const pendingTasks = await queryAll(`
        SELECT t.id, t.title, t.due_date, t.done, l.company_name
        FROM tasks t
        LEFT JOIN leads l ON l.id = t.lead_id
        WHERE t.done = 0
        ORDER BY datetime(t.created_at) DESC
        LIMIT 40
      `);

    context = { recentLeads, pendingTasks };
  }

  const systemPrompt = [
    'You are Splendid CRM AI Assistant for a UK B2B sales team.',
    'Be concise, practical, and action-oriented.',
    'Never invent facts. If data is missing, say what is missing.',
    'Prefer bullet points and short sections.',
  ].join(' ');

  const prompt = buildUserPrompt(task, body, context);

  try {
    const response = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      {
        temperature: task === 'follow_up_email' ? 0.5 : 0.2,
      }
    );

    return NextResponse.json({
      task,
      output: response,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
