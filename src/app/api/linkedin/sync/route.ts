import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getToken, listFormResponses, getImportedIds, markImported } from '@/lib/linkedin';
import { queryOne, runStatement } from '@/lib/db-client';

/**
 * GET  /api/linkedin/sync?accountId=123  — preview unimported leads
 * POST /api/linkedin/sync?accountId=123  — import unimported leads into CRM
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const accountId = new URL(req.url).searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const userId = (session.user as any).id as number;
  const tok    = await getToken(userId);
  if (!tok) return NextResponse.json({ error: 'Not connected to LinkedIn' }, { status: 403 });

  try {
    const responses  = await listFormResponses(tok.access_token, accountId);
    const imported   = await getImportedIds();
    const newLeads   = responses.filter(r => !imported.has(r.id));
    return NextResponse.json({ total: responses.length, new: newLeads.length, leads: newLeads });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const accountId = new URL(req.url).searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const userId = (session.user as any).id as number;
  const tok    = await getToken(userId);
  if (!tok) return NextResponse.json({ error: 'Not connected to LinkedIn' }, { status: 403 });

  try {
    const responses = await listFormResponses(tok.access_token, accountId);
    const imported  = await getImportedIds();
    const newOnes   = responses.filter(r => !imported.has(r.id));

    let created = 0;
    let skipped = 0;

    for (const r of newOnes) {
      const companyName = r.company?.trim() || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Unknown (LinkedIn)';
      const contactName = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();

      // Insert lead
      const notes = [
        r.jobTitle ? `Job title: ${r.jobTitle}` : null,
        r.formName ? `LinkedIn form: ${r.formName}` : null,
        `Submitted: ${new Date(r.submittedAt).toLocaleString('en-GB')}`,
      ].filter(Boolean).join('\n');

      const result = await runStatement(`
        INSERT INTO leads
          (company_name, email, phone, source, lead_score, status, stage, notes, assigned_to, created_by)
        VALUES
          (@company_name, @email, @phone, 'linkedin', 50, 'new', 'lead', @notes, @assigned_to, @created_by)
      `, {
        company_name: companyName,
        email:        r.email ?? null,
        phone:        r.phone ?? null,
        notes,
        assigned_to:  userId,
        created_by:   userId,
      } as unknown as Record<string, string | number | boolean | null>);

      const leadId = Number(result.lastInsertId);

      // Insert contact if we have a name
      if (contactName) {
        await runStatement(`
          INSERT INTO contacts (lead_id, name, role, email, phone, is_primary)
          VALUES (?, ?, ?, ?, ?, 1)
        `, [leadId, contactName, r.jobTitle ?? null, r.email ?? null, r.phone ?? null]);
      }

      await markImported(r.id, leadId);
      created++;
    }

    skipped = responses.length - newOnes.length;
    return NextResponse.json({ created, skipped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
