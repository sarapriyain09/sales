import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Contact } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const campaignId = searchParams.get('campaign_id');
  const industry = searchParams.get('industry');
  const country = searchParams.get('country');
  const search = searchParams.get('search');

  let sql = `
    SELECT c.*, l.company_name, cp.campaign_name
    FROM contacts c
    LEFT JOIN leads l ON c.lead_id = l.id
    LEFT JOIN campaigns cp ON c.campaign_id = cp.id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (campaignId) {
    sql += ' AND c.campaign_id = ?';
    params.push(Number(campaignId));
  }
  if (industry) {
    sql += ' AND c.industry = ?';
    params.push(industry);
  }
  if (country) {
    sql += ' AND c.country = ?';
    params.push(country);
  }
  if (search) {
    sql += ' AND (c.name LIKE ? OR c.email LIKE ? OR l.company_name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY c.created_at DESC';

  const contacts = await queryAll(sql, params);
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as Partial<Contact>;

  if (!body.lead_id || !body.name?.trim()) {
    return NextResponse.json({ error: 'lead_id and name are required' }, { status: 400 });
  }

  const result = await runStatement(`
    INSERT INTO contacts
      (lead_id, name, role, email, phone, linkedin, company, job_title, linkedin_url, industry, country, status, lead_score, campaign_id, is_primary)
    VALUES
      (@lead_id, @name, @role, @email, @phone, @linkedin, @company, @job_title, @linkedin_url, @industry, @country, @status, @lead_score, @campaign_id, @is_primary)
  `, {
    lead_id: body.lead_id,
    name: body.name.trim(),
    role: body.role ?? body.job_title ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    linkedin: body.linkedin ?? body.linkedin_url ?? null,
    company: body.company ?? null,
    job_title: body.job_title ?? null,
    linkedin_url: body.linkedin_url ?? body.linkedin ?? null,
    industry: body.industry ?? null,
    country: body.country ?? null,
    status: body.status ?? 'Pending',
    lead_score: body.lead_score ?? 0,
    campaign_id: body.campaign_id ?? null,
    is_primary: body.is_primary ? 1 : 0,
  } as unknown as Record<string, string | number | boolean | null>);

  const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(contact, { status: 201 });
}
