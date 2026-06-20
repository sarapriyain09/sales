import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne } from '@/lib/db-client';
import { generateChatCompletion } from '@/lib/openai';

type BdTask = 'email_sequence' | 'linkedin_post' | 'proposal_draft';

interface BdRequestBody {
  task?: BdTask;
  leadId?: number;
  campaignId?: number;
  prompt?: string;
}

function isTask(value: string): value is BdTask {
  return value === 'email_sequence' || value === 'linkedin_post' || value === 'proposal_draft';
}

async function buildLeadContext(leadId?: number) {
  if (!leadId) return null;

  const lead = await queryOne(`
    SELECT l.*, c.name as linked_company_name, c.industry as company_industry
    FROM leads l
    LEFT JOIN companies c ON c.id = l.company_id
    WHERE l.id = ?
  `, [leadId]) as Record<string, unknown> | undefined;

  if (!lead) return null;

  const contacts = await queryAll(`
    SELECT id, name, job_title, email, linkedin_url, status, lead_score
    FROM contacts
    WHERE lead_id = ?
    ORDER BY lead_score DESC, is_primary DESC
    LIMIT 5
  `, [leadId]);

  const activity = await queryAll(`
    SELECT activity_type, date, notes
    FROM activities
    WHERE lead_id = ?
    ORDER BY date DESC
    LIMIT 10
  `, [leadId]);

  return { lead, contacts, activity };
}

async function buildCampaignContext(campaignId?: number) {
  if (!campaignId) return null;

  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) return null;

  const campaignContacts = await queryAll(`
    SELECT id, name, company, job_title, industry, country, status, lead_score
    FROM contacts
    WHERE campaign_id = ?
    ORDER BY lead_score DESC
    LIMIT 20
  `, [campaignId]);

  return { campaign, campaignContacts };
}

function buildPrompt(task: BdTask, userPrompt: string, leadContext: unknown, campaignContext: unknown): string {
  const context = JSON.stringify({ leadContext, campaignContext }, null, 2);

  if (task === 'email_sequence') {
    return [
      'Generate a practical B2B outbound email sequence for UK engineering/manufacturing prospects.',
      'Return exactly in this format:',
      'EMAIL_1_SUBJECT:',
      'EMAIL_1_BODY:',
      'EMAIL_2_SUBJECT:',
      'EMAIL_2_BODY:',
      'EMAIL_3_SUBJECT:',
      'EMAIL_3_BODY:',
      'Constraints: concise, credible, no fake claims, one clear CTA per email.',
      userPrompt ? `User guidance: ${userPrompt}` : 'User guidance: none',
      'Context JSON:',
      context,
    ].join('\n');
  }

  if (task === 'linkedin_post') {
    return [
      'Generate 3 LinkedIn post drafts for Splendid Technology focused on UK manufacturing/engineering decision makers.',
      'Each post should include: Hook, 3-5 body lines, CTA, and 5 hashtags.',
      'Tone: practical, technical, not hype.',
      userPrompt ? `User guidance: ${userPrompt}` : 'User guidance: none',
      'Context JSON:',
      context,
    ].join('\n');
  }

  return [
    'Generate a proposal draft for an interested lead.',
    'Output format:',
    '1) Executive Summary',
    '2) Scope of Work',
    '3) Timeline',
    '4) Cost Estimate (range)',
    '5) Assumptions',
    '6) Next Steps',
    'Keep language business-ready and concise.',
    userPrompt ? `User guidance: ${userPrompt}` : 'User guidance: none',
    'Context JSON:',
    context,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as BdRequestBody;
  const taskRaw = (body.task ?? 'email_sequence').toString();
  if (!isTask(taskRaw)) {
    return NextResponse.json({ error: 'Invalid task' }, { status: 400 });
  }

  const leadContext = await buildLeadContext(body.leadId);
  const campaignContext = await buildCampaignContext(body.campaignId);

  if (body.leadId && !leadContext) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }
  if (body.campaignId && !campaignContext) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const systemPrompt = [
    'You are an AI Business Development Assistant for Splendid Technology.',
    'You produce practical, credible B2B outputs for UK manufacturing and engineering audiences.',
    'Do not invent facts, prices, or certifications that are not provided.',
  ].join(' ');

  const prompt = buildPrompt(taskRaw, (body.prompt ?? '').trim(), leadContext, campaignContext);

  try {
    const output = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      { temperature: taskRaw === 'linkedin_post' ? 0.6 : 0.35, maxTokens: 1400 }
    );

    return NextResponse.json({
      task: taskRaw,
      output,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      context_used: {
        lead: Boolean(leadContext),
        campaign: Boolean(campaignContext),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
