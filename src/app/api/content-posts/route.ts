import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement } from '@/lib/db-client';
import type { ContentPost } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const status = searchParams.get('status');
  const campaignId = searchParams.get('campaign_id');

  let sql = `
    SELECT cp.*, c.campaign_name
    FROM content_posts cp
    LEFT JOIN campaigns c ON cp.campaign_id = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (platform) {
    sql += ' AND cp.platform = ?';
    params.push(platform);
  }
  if (status) {
    sql += ' AND cp.status = ?';
    params.push(status);
  }
  if (campaignId) {
    sql += ' AND cp.campaign_id = ?';
    params.push(Number(campaignId));
  }

  sql += ' ORDER BY cp.scheduled_for IS NULL ASC, cp.scheduled_for ASC, cp.created_at DESC';

  const posts = await queryAll(sql, params);
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as Partial<ContentPost>;

  if (!body.title?.trim() || !body.post_content?.trim() || !body.platform?.trim()) {
    return NextResponse.json({ error: 'title, post_content and platform are required' }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string | number } | undefined)?.id ?? 0) || null;

  const result = await runStatement(`
    INSERT INTO content_posts
      (title, post_content, platform, content_type, status, campaign_id, scheduled_for, published_at, created_by, updated_at)
    VALUES
      (@title, @post_content, @platform, @content_type, @status, @campaign_id, @scheduled_for, @published_at, @created_by, datetime('now'))
  `, {
    title: body.title.trim(),
    post_content: body.post_content.trim(),
    platform: body.platform.trim(),
    content_type: body.content_type ?? 'post',
    status: body.status ?? 'draft',
    campaign_id: body.campaign_id ?? null,
    scheduled_for: body.scheduled_for ?? null,
    published_at: body.published_at ?? null,
    created_by: userId,
  } as unknown as Record<string, string | number | boolean | null>);

  const post = await queryOne('SELECT * FROM content_posts WHERE id = ?', [Number(result.lastInsertId)]);
  return NextResponse.json(post, { status: 201 });
}
