import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const company = searchParams.get('company');
  const opportunityId = searchParams.get('opportunity_id');

  const db = getDb();

  let sql = `
    SELECT q.*, c.name AS company_name, ct.name AS contact_name, o.opportunity_name
    FROM quotes q
    LEFT JOIN companies c ON c.id = q.company_id
    LEFT JOIN contacts ct ON ct.id = q.contact_id
    LEFT JOIN opportunities o ON o.id = q.opportunity_id
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (status) {
    sql += ' AND q.status = ?';
    params.push(status);
  }
  if (company) {
    sql += ' AND c.name LIKE ?';
    params.push(`%${company}%`);
  }
  if (opportunityId) {
    sql += ' AND q.opportunity_id = ?';
    params.push(Number(opportunityId));
  }

  sql += ' ORDER BY q.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as {
    lead_id?: number | null;
    company_id?: number | null;
    contact_id?: number | null;
    opportunity_id?: number | null;
    status?: string;
    customer?: string;
    address?: string | null;
    email?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    terms?: string | null;
    notes?: string | null;
    items?: Array<{
      product?: string;
      description?: string;
      quantity?: number;
      unit_price?: number;
      discount?: number;
      tax?: number;
    }>;
  };

  const db = getDb();
  const items = Array.isArray(body.items) ? body.items : [];

  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);
    const discount = Number(item.discount ?? 0);
    return sum + Math.max(0, quantity * unitPrice - discount);
  }, 0);

  const vatAmount = items.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);
    const discount = Number(item.discount ?? 0);
    const lineBase = Math.max(0, quantity * unitPrice - discount);
    return sum + (lineBase * (Number(item.tax ?? 0) / 100));
  }, 0);

  const total = subtotal + vatAmount;
  const count = (db.prepare('SELECT COUNT(*) as c FROM quotes').get() as { c: number }).c;
  const quoteNumber = `Q-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count + 1).padStart(3, '0')}`;

  const result = db.prepare(`
    INSERT INTO quotes (
      lead_id, company_id, contact_id, opportunity_id, quote_number, status, customer, address, email,
      issue_date, expiry_date, subtotal, vat_amount, total, total_amount, terms, notes, updated_at
    ) VALUES (
      @lead_id, @company_id, @contact_id, @opportunity_id, @quote_number, @status, @customer, @address, @email,
      @issue_date, @expiry_date, @subtotal, @vat_amount, @total, @total_amount, @terms, @notes, datetime('now')
    )
  `).run({
    lead_id: body.lead_id ?? null,
    company_id: body.company_id ?? null,
    contact_id: body.contact_id ?? null,
    opportunity_id: body.opportunity_id ?? null,
    quote_number: quoteNumber,
    status: (body.status ?? 'draft').toLowerCase(),
    customer: body.customer ?? 'Customer',
    address: body.address ?? null,
    email: body.email ?? null,
    issue_date: body.issue_date ?? new Date().toISOString(),
    expiry_date: body.expiry_date ?? null,
    subtotal,
    vat_amount: vatAmount,
    total,
    total_amount: total,
    terms: body.terms ?? '30 days',
    notes: body.notes ?? null,
  });

  const quoteId = Number(result.lastInsertRowid);
  const insertItem = db.prepare(`
    INSERT INTO quote_items (quote_id, product, description, quantity, unit_price, discount, tax, total, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);
    const discount = Number(item.discount ?? 0);
    const tax = Number(item.tax ?? 0);
    const lineBase = Math.max(0, quantity * unitPrice - discount);
    const lineTotal = lineBase + (lineBase * tax / 100);

    insertItem.run(
      quoteId,
      item.product ?? null,
      item.description ?? item.product ?? 'Item',
      quantity,
      unitPrice,
      discount,
      tax,
      lineTotal,
      lineTotal,
    );
  }

  const created = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
  return NextResponse.json(created, { status: 201 });
}
