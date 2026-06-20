import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Quote, QuoteDetail } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const quotes = await queryAll('SELECT q.*, l.company_name FROM quotes q LEFT JOIN leads l ON q.lead_id = l.id ORDER BY q.created_at DESC');
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const body = await req.json() as Partial<Quote> & { items?: QuoteDetail['items'] };

  // Generate quote number: Q-YYYYMM-NNN
  const count = (await queryOne('SELECT COUNT(*) as c FROM quotes') as { c: number }).c;
  const qNum  = `Q-${new Date().toISOString().slice(0,7).replace('-','')}-${String(count + 1).padStart(3,'0')}`;

  const items  = body.items ?? [];
  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const vatRate  = body.vat_rate ?? 20;
  const vatAmt   = subtotal * vatRate / 100;
  const total    = subtotal + vatAmt;

  const result = await runStatement(`
    INSERT INTO quotes (lead_id, quote_number, status, customer, address, email, subtotal, vat_rate, vat_amount, total, terms, notes, expiry_date)
    VALUES (@lead_id, @quote_number, @status, @customer, @address, @email, @subtotal, @vat_rate, @vat_amount, @total, @terms, @notes, @expiry_date)
  `, {
    lead_id:     body.lead_id     ?? null,
    quote_number: qNum,
    status:      body.status      ?? 'draft',
    customer:    body.customer    ?? '',
    address:     body.address     ?? null,
    email:       body.email       ?? null,
    subtotal,
    vat_rate:    vatRate,
    vat_amount:  vatAmt,
    total,
    terms:       body.terms       ?? '30 days',
    notes:       body.notes       ?? null,
    expiry_date: body.expiry_date ?? null,
  });

  const quoteId = Number(result.lastInsertId);
  for (const item of items) {
    await runStatement('INSERT INTO quote_items (quote_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)', [quoteId, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price]);
  }

  const quote = await queryOne('SELECT * FROM quotes WHERE id = ?', [quoteId]) as QuoteDetail;
  quote.items = await queryAll('SELECT * FROM quote_items WHERE quote_id = ?', [quoteId]) as QuoteDetail['items'];
  return NextResponse.json(quote, { status: 201 });
}
