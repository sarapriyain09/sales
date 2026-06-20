import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { Quote, QuoteDetail } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const quote = await queryOne('SELECT q.*, l.company_name FROM quotes q LEFT JOIN leads l ON q.lead_id = l.id WHERE q.id = ?', [id]) as (QuoteDetail & { company_name?: string }) | undefined;
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  quote.items = await queryAll('SELECT * FROM quote_items WHERE quote_id = ?', [id]) as QuoteDetail['items'];
  return NextResponse.json(quote);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as Partial<Quote> & { items?: QuoteDetail['items'] };

  if (body.items !== undefined) {
    await runStatement('DELETE FROM quote_items WHERE quote_id = ?', [id]);
    const subtotal = body.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const vatRate  = body.vat_rate ?? 20;
    body.subtotal   = subtotal;
    body.vat_amount = subtotal * vatRate / 100;
    body.total      = subtotal + body.vat_amount;
    for (const item of body.items) await runStatement('INSERT INTO quote_items (quote_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)', [id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price]);
    delete (body as Record<string, unknown>).items;
  }

  const fields = Object.keys(body).filter(k => !['id','items'].includes(k));
  if (fields.length > 0) {
    const setClause = fields.map(f => `${f} = @${f}`).join(', ');
    await runStatement(`UPDATE quotes SET ${setClause}, updated_at = datetime('now') WHERE id = @id`, { ...body, id } as unknown as Record<string, string | number | boolean | null>);
  }

  const quote = await queryOne('SELECT * FROM quotes WHERE id = ?', [id]) as QuoteDetail;
  quote.items = await queryAll('SELECT * FROM quote_items WHERE quote_id = ?', [id]) as QuoteDetail['items'];
  return NextResponse.json(quote);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  await runStatement('DELETE FROM quotes WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
