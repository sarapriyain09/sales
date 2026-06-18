import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const owner = searchParams.get('owner');
  const source = searchParams.get('source');
  const industry = searchParams.get('industry');

  const db = getDb();
  let sql = `
    SELECT l.*, u.name AS assigned_user_name
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (status) {
    sql += ' AND l.status = ?';
    params.push(status);
  }
  if (owner) {
    sql += ' AND l.assigned_to = ?';
    params.push(Number(owner));
  }
  if (source) {
    sql += ' AND l.source = ?';
    params.push(source);
  }
  if (industry) {
    sql += ' AND COALESCE(l.industry, l.sic_label) LIKE ?';
    params.push(`%${industry}%`);
  }

  sql += ' ORDER BY l.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}
