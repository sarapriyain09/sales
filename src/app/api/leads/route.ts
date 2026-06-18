import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';
import { seedUsers } from '@/lib/auth-utils';
import type { Lead, LeadStage, LeadStatus, LeadSource } from '@/lib/types';

// Ensure DB is seeded
seedUsers().catch(console.error);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const stage  = searchParams.get('stage');
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const assignedTo = searchParams.get('assigned_to');
  const vertical   = searchParams.get('vertical');
  const source     = searchParams.get('source');

  let sql = 'SELECT l.*, u.name as assigned_name, cu.name as created_by_name FROM leads l LEFT JOIN users u ON l.assigned_to = u.id LEFT JOIN users cu ON l.created_by = cu.id WHERE 1=1';
  const params: (string | number)[] = [];

  if (stage)      { sql += ' AND l.stage = ?';       params.push(stage);      }
  if (status)     { sql += ' AND l.status = ?';      params.push(status);     }
  if (assignedTo) { sql += ' AND l.assigned_to = ?'; params.push(assignedTo); }
  if (vertical)   { sql += ' AND l.vertical = ?';    params.push(vertical);   }
  if (source)     { sql += ' AND l.source = ?';      params.push(source);     }
  if (search) { sql += ' AND (l.company_name LIKE ? OR l.location LIKE ? OR l.email LIKE ?)'; const q = `%${search}%`; params.push(q, q, q); }

  sql += ' ORDER BY l.lead_score DESC, l.created_at DESC';
  const leads = db.prepare(sql).all(...params);
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const db = getDb();
  const body = await req.json() as Partial<Lead>;

  // Deduplicate by company_number if provided
  if (body.company_number) {
    const existing = db.prepare('SELECT id FROM leads WHERE company_number = ?').get(body.company_number);
    if (existing) return NextResponse.json({ error: 'Already exists', lead: existing }, { status: 409 });
  }

  const stmt = db.prepare(`
    INSERT INTO leads
      (lead_name, contact_person, industry,
       company_name, company_number, sic_code, sic_label, website, phone, email,
       source, lead_score, status, stage, location, postcode, incorporated, notes, assigned_to, created_by, vertical,
       created_at, next_followup_date,
       opportunity_value, interest_level,
       contact_name, linkedin_url,
       eng_score, eng_grade, eng_sector, employee_count,
       linkedin_hiring, decision_maker_role, growth_signal, linkedin_engagement)
    VALUES
      (@lead_name, @contact_person, @industry,
       @company_name, @company_number, @sic_code, @sic_label, @website, @phone, @email,
       @source, @lead_score, @status, @stage, @location, @postcode, @incorporated, @notes, @assigned_to, @created_by, @vertical,
       COALESCE(@created_at, datetime('now')), @next_followup_date,
       @opportunity_value, @interest_level,
       @contact_name, @linkedin_url,
       @eng_score, @eng_grade, @eng_sector, @employee_count,
       @linkedin_hiring, @decision_maker_role, @growth_signal, @linkedin_engagement)
  `);

  const result = stmt.run({
    lead_name:           body.lead_name           ?? null,
    contact_person:      body.contact_person      ?? body.contact_name ?? null,
    industry:            body.industry            ?? body.sic_label ?? null,
    company_name:        body.company_name        ?? 'Unknown',
    company_number:      body.company_number      ?? null,
    sic_code:            body.sic_code            ?? null,
    sic_label:           body.sic_label           ?? null,
    website:             body.website             ?? null,
    phone:               body.phone               ?? null,
    email:               body.email               ?? null,
    source:              body.source              ?? 'companies_house',
    lead_score:          body.lead_score          ?? 0,
    status:              body.status              ?? 'new',
    stage:               body.stage               ?? 'lead',
    location:            body.location            ?? null,
    postcode:            body.postcode            ?? null,
    incorporated:        body.incorporated        ?? null,
    notes:               body.notes               ?? null,
    assigned_to:         body.assigned_to         ?? (session.user as any)?.id ?? null,
    created_by:          (session.user as any)?.id ?? null,
    vertical:            body.vertical            ?? 'crm',
    created_at:          body.created_at          ?? null,
    next_followup_date:  body.next_followup_date  ?? null,
    opportunity_value:   body.opportunity_value   ?? null,
    interest_level:      body.interest_level      ?? null,
    contact_name:        body.contact_name        ?? null,
    linkedin_url:        body.linkedin_url        ?? null,
    eng_score:           body.eng_score           ?? null,
    eng_grade:           body.eng_grade           ?? null,
    eng_sector:          body.eng_sector          ?? null,
    employee_count:      body.employee_count      ?? null,
    linkedin_hiring:     body.linkedin_hiring     ?? null,
    decision_maker_role: body.decision_maker_role ?? null,
    growth_signal:       body.growth_signal       ?? null,
    linkedin_engagement: body.linkedin_engagement ?? null,
  });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(lead, { status: 201 });
}
