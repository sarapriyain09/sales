import { NextRequest, NextResponse } from 'next/server';
import { queryOne, runStatement } from '@/lib/db-client';
import { searchExistingCompanies } from '@/lib/companies-house';
import { scoreLead } from '@/lib/lead-scorer';
import { getSicDescription } from '@/lib/sic-codes';

interface LinkedinCampaignBody {
  targetCount?: number;
  campaignName?: string;
  locations?: string[];
  userId?: number | null;
}

const DEFAULT_TARGET_COUNT = 150;
const DEFAULT_LOCATIONS = [
  'London',
  'Birmingham',
  'Manchester',
  'Leeds',
  'Glasgow',
  'Bristol',
  'Sheffield',
  'Nottingham',
  'Leicester',
  'Newcastle',
];

// Mix of UK engineering + automation focused SIC codes.
const LINKEDIN_CAMPAIGN_SIC_CODES = [
  '71121', // engineering design activities
  '71129', // other engineering activities
  '28290', // special-purpose machinery
  '28990', // other special-purpose machinery
  '33120', // repair of machinery
  '33190', // repair of other equipment
  '62012', // software development
  '62020', // IT consultancy
  '62090', // other IT services
  '70229', // management consultancy
];

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

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeLinkedinSearchUrl(companyName: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${companyName} founder OR director OR head of engineering`)}`;
}

async function ensureTask(leadId: number, title: string, dueDate: string): Promise<boolean> {
  const existing = await queryOne('SELECT id FROM tasks WHERE lead_id = ? AND title = ?', [leadId, title]) as { id: number } | undefined;
  if (existing) return false;

  await runStatement('INSERT INTO tasks (lead_id, title, due_date) VALUES (?, ?, ?)', [leadId, title, dueDate]);
  return true;
}

export async function POST(req: NextRequest) {
  const hasKey = Boolean((process.env.AUTOMATION_API_KEY ?? '').trim());
  if (!hasKey) {
    return NextResponse.json({ error: 'AUTOMATION_API_KEY is not configured.' }, { status: 503 });
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized scheduler request.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as LinkedinCampaignBody;

  const targetCount = Math.max(1, Math.min(500, Number(body.targetCount ?? DEFAULT_TARGET_COUNT)));
  const locations = body.locations && body.locations.length > 0 ? body.locations : DEFAULT_LOCATIONS;
  const campaignName = (body.campaignName ?? 'UK Automation + Engineering LinkedIn Campaign').trim();

  const existingCampaign = await queryOne(`
    SELECT id
    FROM campaigns
    WHERE campaign_name = ?
    ORDER BY id DESC
    LIMIT 1
  `, [campaignName]) as { id: number } | undefined;

  const campaignId = existingCampaign?.id ?? Number((await runStatement(`
    INSERT INTO campaigns (
      campaign_name,
      target_industry,
      start_date,
      end_date,
      duration_days,
      focus_service,
      services_json,
      objective,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, date('now'), date('now', '+90 day'), 90, ?, ?, ?, 'active', datetime('now'), datetime('now'))
  `, [
    campaignName,
    'Automation, Engineering',
    'CRM + AI Automation Services',
    JSON.stringify(['crm', 'ai_automation', 'engineering']),
    'Acquire and nurture 150 UK prospects via LinkedIn campaign flow',
  ])).lastInsertId);

  // Ensure baseline campaign content exists once.
  const hasContent = await queryOne('SELECT id FROM content_posts WHERE campaign_id = ? LIMIT 1', [campaignId]) as { id: number } | undefined;
  if (!hasContent) {
    await runStatement(`
      INSERT INTO content_posts (title, post_content, platform, content_type, status, campaign_id, created_at, updated_at)
      VALUES (?, ?, 'linkedin', 'connection_request', 'draft', ?, datetime('now'), datetime('now'))
    `, [
      'LinkedIn Connection Request Template',
      'Hi {{first_name}}, I work with UK automation and engineering firms to improve lead handling and follow-up using CRM + AI workflows. Open to connect?',
      campaignId,
    ]);

    await runStatement(`
      INSERT INTO content_posts (title, post_content, platform, content_type, status, campaign_id, created_at, updated_at)
      VALUES (?, ?, 'linkedin', 'follow_up', 'draft', ?, datetime('now'), datetime('now'))
    `, [
      'LinkedIn Follow-up Template',
      'Thanks for connecting {{first_name}}. If useful, I can share a quick 3-step playbook we use to reduce missed follow-ups and increase booked meetings for engineering/automation teams.',
      campaignId,
    ]);
  }

  const collected = new Map<string, {
    company_name: string;
    company_number: string;
    sic_codes: string[];
    date_of_creation: string;
    location: string | null;
    postcode: string | null;
  }>();

  let startIndex = 0;
  while (collected.size < targetCount && startIndex < 1200) {
    const result = await searchExistingCompanies({
      sicCodes: LINKEDIN_CAMPAIGN_SIC_CODES,
      locations,
      size: 100,
      startIndex,
      companyStatus: 'active',
    });

    for (const company of result.items ?? []) {
      if (!company.company_number || collected.has(company.company_number)) continue;
      collected.set(company.company_number, {
        company_name: company.company_name,
        company_number: company.company_number,
        sic_codes: company.sic_codes ?? [],
        date_of_creation: company.date_of_creation,
        location: company.registered_office_address?.locality ?? null,
        postcode: company.registered_office_address?.postal_code ?? null,
      });
      if (collected.size >= targetCount) break;
    }

    if ((result.items ?? []).length === 0) break;
    startIndex += 100;
  }

  let leadsCreated = 0;
  let leadsExisting = 0;
  let tasksCreated = 0;

  for (const company of collected.values()) {
    const existingLead = await queryOne('SELECT id FROM leads WHERE company_number = ?', [company.company_number]) as { id: number } | undefined;

    let leadId: number;
    if (existingLead) {
      leadId = existingLead.id;
      leadsExisting += 1;
    } else {
      const primarySic = company.sic_codes[0] ?? null;
      const score = scoreLead({
        company_name: company.company_name,
        company_number: company.company_number,
        company_status: 'active',
        company_type: 'ltd',
        date_of_creation: company.date_of_creation,
        sic_codes: company.sic_codes,
        registered_office_address: {
          locality: company.location ?? undefined,
          postal_code: company.postcode ?? undefined,
        },
      }, 'unknown').total;

      const insertedLead = await runStatement(`
        INSERT INTO leads (
          company_name,
          company_number,
          sic_code,
          sic_label,
          source,
          lead_score,
          status,
          stage,
          location,
          postcode,
          incorporated,
          notes,
          vertical,
          linkedin_url,
          created_at
        ) VALUES (?, ?, ?, ?, 'companies_house', ?, 'new', 'lead', ?, ?, ?, ?, 'engineering', ?, datetime('now'))
      `, [
        company.company_name,
        company.company_number,
        primarySic,
        primarySic ? getSicDescription(primarySic) : null,
        score,
        company.location,
        company.postcode,
        company.date_of_creation,
        'Auto-added for LinkedIn outreach campaign (automation + engineering UK target list).',
        makeLinkedinSearchUrl(company.company_name),
      ]);

      leadId = Number(insertedLead.lastInsertId);
      leadsCreated += 1;
    }

    // Build a consistent outreach workflow in CRM; LinkedIn send itself stays manual.
    if (await ensureTask(leadId, '[LinkedIn Campaign] Find decision maker profile and personalize note', isoDatePlusDays(0))) {
      tasksCreated += 1;
    }
    if (await ensureTask(leadId, '[LinkedIn Campaign] Send connection request from personal profile', isoDatePlusDays(1))) {
      tasksCreated += 1;
    }
    if (await ensureTask(leadId, '[LinkedIn Campaign] Send campaign message after connect', isoDatePlusDays(3))) {
      tasksCreated += 1;
    }
    if (await ensureTask(leadId, '[LinkedIn Campaign] Follow up if no reply', isoDatePlusDays(7))) {
      tasksCreated += 1;
    }

    await runStatement(`
      INSERT INTO activities (lead_id, campaign_id, activity_type, date, notes, metadata_json, created_at)
      VALUES (?, ?, 'linkedin_campaign_queued', datetime('now'), ?, ?, datetime('now'))
    `, [
      leadId,
      campaignId,
      'Lead queued into LinkedIn campaign workflow.',
      JSON.stringify({ campaign: campaignName }),
    ]);
  }

  return NextResponse.json({
    ok: true,
    source: 'automation-linkedin-campaign',
    campaignId,
    campaignName,
    targeted: targetCount,
    sourcedCompanies: collected.size,
    leadsCreated,
    leadsExisting,
    tasksCreated,
    note: 'LinkedIn connection requests/messages must be sent manually from your personal profile. CRM now tracks all follow-up steps.',
  });
}
