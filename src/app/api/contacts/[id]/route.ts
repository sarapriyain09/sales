import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement } from '@/lib/db-client';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const fields = Object.keys(body).filter((key) => key !== 'id');
  if (fields.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const setClause = fields.map((field) => `${field} = @${field}`).join(', ');

  await runStatement(`UPDATE contacts SET ${setClause} WHERE id = @id`, { ...body, id } as unknown as Record<string, string | number | boolean | null>);

  const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}
