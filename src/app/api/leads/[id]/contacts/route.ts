import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement } from '@/lib/db-client';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const result = await runStatement(`
    INSERT INTO contacts (lead_id, name, role, email, phone, linkedin, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, body.name.trim(), body.role ?? null, body.email ?? null, body.phone ?? null, body.linkedin ?? null, body.is_primary ? 1 : 0]);

  const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(contact, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contact_id');
  if (!contactId) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
  await runStatement('DELETE FROM contacts WHERE id = ? AND lead_id = ?', [contactId, (await params).id]);
  return NextResponse.json({ ok: true });
}
