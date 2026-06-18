import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

interface ImportBody {
  clientName?: string;
  company?: string;
  projectTitle?: string;
  projectUrl?: string;
  budget?: string;
  proposalDate?: string;
  proposalStatus?: string;
  vertical?: string;
  notes?: string;
  followupDate?: string;
  createOpportunity?: boolean;
}

const ALLOWED_STATUSES = ['upwork_prospect', 'proposal_sent', 'interview', 'opportunity', 'won', 'lost'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ImportBody;
  const projectTitle = (body.projectTitle ?? '').trim();
  const projectUrl = (body.projectUrl ?? '').trim();
  if (!projectTitle || !projectUrl) {
    return NextResponse.json({ error: 'projectTitle and projectUrl are required.' }, { status: 400 });
  }

  const proposalStatus = (body.proposalStatus ?? 'proposal_sent').trim();
  if (!ALLOWED_STATUSES.includes(proposalStatus)) {
    return NextResponse.json({ error: 'Invalid proposalStatus.' }, { status: 400 });
  }

  const db = getDb();

  const existing = db.prepare('SELECT id FROM leads WHERE upwork_project_url = ?').get(projectUrl) as { id: number } | undefined;
  if (existing) {
    return NextResponse.json({ error: 'Already imported', lead: existing }, { status: 409 });
  }

  const companyName = (body.company ?? body.clientName ?? projectTitle).trim();
  const vertical = (body.vertical ?? 'software').trim();
  const leadNotes = [
    body.notes?.trim(),
    `Upwork proposal status: ${proposalStatus}`,
    body.budget?.trim() ? `Budget: ${body.budget!.trim()}` : null,
  ].filter(Boolean).join(' | ');

  const insert = db.prepare(`
    INSERT INTO leads
      (company_name, source, lead_score, status, stage, notes, vertical, created_by,
       upwork_client_name, upwork_company, upwork_project_title, upwork_project_url,
       upwork_budget, upwork_proposal_date, upwork_proposal_status, updated_at)
    VALUES
      (@company_name, 'upwork', 55, 'new', 'prospect', @notes, @vertical, @created_by,
       @upwork_client_name, @upwork_company, @upwork_project_title, @upwork_project_url,
       @upwork_budget, @upwork_proposal_date, @upwork_proposal_status, datetime('now'))
  `);

  const result = insert.run({
    company_name: companyName,
    notes: leadNotes || null,
    vertical,
    created_by: (session.user as any)?.id ?? null,
    upwork_client_name: (body.clientName ?? '').trim() || null,
    upwork_company: (body.company ?? '').trim() || null,
    upwork_project_title: projectTitle,
    upwork_project_url: projectUrl,
    upwork_budget: (body.budget ?? '').trim() || null,
    upwork_proposal_date: (body.proposalDate ?? '').trim() || null,
    upwork_proposal_status: proposalStatus,
  });

  const leadId = Number(result.lastInsertRowid);

  const followupDate = (body.followupDate ?? '').trim() || null;
  db.prepare(`
    INSERT INTO tasks (lead_id, title, due_date, done, created_at)
    VALUES (?, ?, ?, 0, datetime('now'))
  `).run(leadId, 'Upwork follow-up', followupDate);

  const shouldCreateOpportunity = body.createOpportunity === true;
  if (shouldCreateOpportunity) {
    const statusLower = proposalStatus.toLowerCase();
    const oppStatus = statusLower === 'won' ? 'won' : statusLower === 'lost' ? 'lost' : 'open';

    // Best-effort numeric extraction from budget text like "$500" or "$500-$1000".
    const numericBudget = Number(((body.budget ?? '').match(/[0-9]+(?:\.[0-9]+)?/g) ?? [])[0] ?? 0);

    const defaultPipeline = db.prepare('SELECT id FROM pipelines ORDER BY sort_order ASC, id ASC LIMIT 1').get() as { id: number } | undefined;
    const defaultStage = defaultPipeline
      ? db.prepare('SELECT id, default_probability FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(defaultPipeline.id) as { id: number; default_probability: number } | undefined
      : undefined;

    db.prepare(`
      INSERT INTO opportunities (
        opportunity_name, lead_id, pipeline_id, stage_id,
        estimated_value, probability, expected_close_date, status, notes, won_at, updated_at
      ) VALUES (
        @opportunity_name, @lead_id, @pipeline_id, @stage_id,
        @estimated_value, @probability, @expected_close_date, @status, @notes,
        CASE WHEN @status = 'won' THEN datetime('now') ELSE NULL END,
        datetime('now')
      )
    `).run({
      opportunity_name: projectTitle,
      lead_id: leadId,
      pipeline_id: defaultPipeline?.id ?? null,
      stage_id: defaultStage?.id ?? null,
      estimated_value: Number.isFinite(numericBudget) ? numericBudget : 0,
      probability: defaultStage?.default_probability ?? 0,
      expected_close_date: followupDate,
      status: oppStatus,
      notes: leadNotes || null,
    });
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  return NextResponse.json({ ok: true, lead, opportunityCreated: shouldCreateOpportunity }, { status: 201 });
}
