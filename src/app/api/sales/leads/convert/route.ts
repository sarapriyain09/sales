import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement, withTransaction } from '@/lib/db-client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as {
    lead_id?: number;
    create_opportunity?: boolean;
    opportunity_name?: string;
    estimated_value?: number;
    probability?: number;
    expected_close_date?: string | null;
  };

  const leadId = Number(body.lead_id);
  if (!Number.isFinite(leadId)) return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });

  try {
    const result = await withTransaction(async () => {
      const lead = await queryOne('SELECT * FROM leads WHERE id = ?', [leadId]) as {
        id: number;
        company_id: number | null;
        company_name: string;
        website: string | null;
        phone: string | null;
        email: string | null;
        industry: string | null;
        notes: string | null;
        contact_name: string | null;
        assigned_to: number | null;
      } | undefined;

      if (!lead) {
        throw new Error('Lead not found');
      }

      let companyId = lead.company_id;
      if (!companyId) {
        const existingCompany = await queryOne('SELECT id FROM companies WHERE name = ? LIMIT 1', [lead.company_name]) as { id: number } | undefined;
        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          const newCompany = await runStatement(`
            INSERT INTO companies (name, website, industry, source, status, notes, updated_at)
            VALUES (?, ?, ?, 'lead_conversion', 'prospect', ?, datetime('now'))
          `, [lead.company_name, lead.website, lead.industry, lead.notes]);
          companyId = Number(newCompany.lastInsertId);
        }
        await runStatement('UPDATE leads SET company_id = ?, updated_at = datetime(\'now\') WHERE id = ?', [companyId, leadId]);
      }

      const existingContact = await queryOne('SELECT id FROM contacts WHERE lead_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1', [leadId]) as { id: number } | undefined;
      const contactId = existingContact?.id ?? Number(
        (await runStatement(`
          INSERT INTO contacts (lead_id, name, role, email, phone, company, status, lead_score, is_primary)
          VALUES (?, ?, 'Decision Maker', ?, ?, ?, 'Qualified', 70, 1)
        `, [
          leadId,
          lead.contact_name || lead.company_name,
          lead.email,
          lead.phone,
          lead.company_name,
        ])).lastInsertId,
      );

      let opportunityId: number | null = null;
      if (body.create_opportunity !== false) {
        const pipeline = await queryOne('SELECT id FROM pipelines ORDER BY sort_order ASC, id ASC LIMIT 1') as { id: number } | undefined;
        const stage = pipeline
          ? await queryOne('SELECT id, default_probability FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC LIMIT 1', [pipeline.id]) as { id: number; default_probability: number } | undefined
          : undefined;

        const oppResult = await runStatement(`
          INSERT INTO opportunities (
            opportunity_name, company_id, contact_id, lead_id, pipeline_id, stage_id,
            estimated_value, probability, expected_close_date, assigned_user, status, notes, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, datetime('now')
          )
        `, [
          (body.opportunity_name ?? `${lead.company_name} Opportunity`).trim(),
          companyId,
          contactId,
          leadId,
          pipeline?.id ?? null,
          stage?.id ?? null,
          Number.isFinite(body.estimated_value) ? Number(body.estimated_value) : 0,
          Number.isFinite(body.probability) ? Number(body.probability) : (stage?.default_probability ?? 20),
          body.expected_close_date ?? null,
          lead.assigned_to ?? (session.user as { id?: number | string } | undefined)?.id ?? null,
          lead.notes,
        ]);
        opportunityId = Number(oppResult.lastInsertId);
      }

      await runStatement(`
        UPDATE leads
        SET status = 'qualified',
            stage = 'requirements',
            updated_at = datetime('now')
        WHERE id = ?
      `, [leadId]);

      await runStatement(`
        INSERT INTO activities (lead_id, contact_id, activity_type, date, notes)
        VALUES (?, ?, 'lead_converted', datetime('now'), ?)
      `, [leadId, contactId, 'Lead converted to contact/company/opportunity']);

      return { leadId, companyId, contactId, opportunityId };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Conversion failed' }, { status: 400 });
  }
}
