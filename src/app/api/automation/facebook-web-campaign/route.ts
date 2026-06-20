import { NextRequest, NextResponse } from 'next/server';
import { queryOne, runStatement } from '@/lib/db-client';

interface FacebookWebCampaignBody {
  campaignName?: string;
  durationDays?: number;
  weekdaysOnly?: boolean;
}

const DEFAULT_CAMPAIGN_NAME = 'UK Web Growth Facebook Organic Campaign';
const DEFAULT_DURATION_DAYS = 90;

const TOPICS = [
  'website speed and conversion',
  'ecommerce checkout improvements',
  'hosting uptime and performance',
  'mobile-first UX for lead generation',
  'SEO-friendly web development',
  'security updates and trust signals',
  'landing page optimization',
];

const CTAS = [
  'Comment "audit" and we will share a quick website checklist.',
  'Send a message for a free homepage review.',
  'Reply with your website link and we will share 3 practical fixes.',
  'DM us for a conversion-focused web roadmap.',
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

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function buildPost(dayIndex: number): { title: string; content: string } {
  const topic = TOPICS[dayIndex % TOPICS.length];
  const cta = CTAS[dayIndex % CTAS.length];

  const title = `Facebook Daily Post - Day ${dayIndex + 1}`;
  const content = [
    `Daily Web Growth Tip (${dayIndex + 1})`,
    '',
    `Today we are focused on ${topic} for UK businesses.`,
    'Small weekly improvements in web performance, UX, and trust signals can significantly improve lead quality over 90 days.',
    '',
    cta,
    '',
    '#WebDevelopment #Ecommerce #WebHosting #DigitalGrowth #UKBusiness',
  ].join('\n');

  return { title, content };
}

async function ensureTask(title: string, dueDate: string): Promise<boolean> {
  const existing = await queryOne('SELECT id FROM tasks WHERE lead_id IS NULL AND title = ? AND due_date = ?', [title, dueDate]) as { id: number } | undefined;
  if (existing) return false;

  await runStatement('INSERT INTO tasks (lead_id, title, due_date) VALUES (NULL, ?, ?)', [title, dueDate]);
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

  const body = (await req.json().catch(() => ({}))) as FacebookWebCampaignBody;

  const campaignName = (body.campaignName ?? DEFAULT_CAMPAIGN_NAME).trim();
  const durationDays = Math.max(7, Math.min(180, Number(body.durationDays ?? DEFAULT_DURATION_DAYS)));
  const weekdaysOnly = body.weekdaysOnly !== false;

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
    ) VALUES (?, ?, date('now'), date('now', '+90 day'), ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
  `, [
    campaignName,
    'UK businesses needing better web conversion',
    durationDays,
    'Web Development + Ecommerce + Hosting',
    JSON.stringify(['web_development', 'ecommerce', 'hosting']),
    'Run a 90-day organic Facebook content campaign for web services',
  ])).lastInsertId);

  let postsCreated = 0;
  let postsExisting = 0;
  let tasksCreated = 0;

  for (let i = 0; i < durationDays; i++) {
    const scheduled = addDays(new Date(), i);
    if (weekdaysOnly && !isWeekday(scheduled)) continue;

    const scheduledFor = `${toIsoDate(scheduled)}T09:00:00.000Z`;
    const dueDate = toIsoDate(scheduled);
    const { title, content } = buildPost(i);

    const existingPost = await queryOne(`
      SELECT id FROM content_posts
      WHERE campaign_id = ?
        AND platform = 'facebook'
        AND title = ?
        AND scheduled_for = ?
      LIMIT 1
    `, [campaignId, title, scheduledFor]) as { id: number } | undefined;

    if (existingPost) {
      postsExisting += 1;
    } else {
      await runStatement(`
        INSERT INTO content_posts (
          title,
          post_content,
          platform,
          content_type,
          status,
          campaign_id,
          scheduled_for,
          created_at,
          updated_at
        ) VALUES (?, ?, 'facebook', 'post', 'scheduled', ?, ?, datetime('now'), datetime('now'))
      `, [title, content, campaignId, scheduledFor]);
      postsCreated += 1;
    }

    if (await ensureTask('[Facebook Web Campaign] Publish scheduled post', dueDate)) {
      tasksCreated += 1;
    }
    if (await ensureTask('[Facebook Web Campaign] Reply to comments and DMs', dueDate)) {
      tasksCreated += 1;
    }
  }

  await runStatement(`
    INSERT INTO activities (campaign_id, activity_type, date, notes, metadata_json, created_at)
    VALUES (?, 'facebook_campaign_queued', datetime('now'), ?, ?, datetime('now'))
  `, [
    campaignId,
    'Facebook-only web campaign queue generated.',
    JSON.stringify({ durationDays, weekdaysOnly, campaignName }),
  ]);

  return NextResponse.json({
    ok: true,
    source: 'automation-facebook-web-campaign',
    campaignId,
    campaignName,
    durationDays,
    weekdaysOnly,
    postsCreated,
    postsExisting,
    tasksCreated,
    note: 'Facebook posting remains organic/manual unless API publishing credentials are configured. CRM queue and tracking are ready.',
  });
}
