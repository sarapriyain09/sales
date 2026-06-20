import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryAll, queryOne, runStatement, withTransaction } from '@/lib/db-client';
import {
  OUTREACH_VERTICALS,
  type OutreachChannel,
  normalizeVertical,
  renderOutreachTemplate,
} from '@/lib/outreach-templates';
import { generateChatCompletion } from '@/lib/openai';

type TemplateAction = 'regenerate' | 'save_vertical' | 'save_all_verticals';

interface TemplateBody {
  action?: TemplateAction;
  channel?: OutreachChannel;
  vertical?: string;
  leadId?: number;
  userInput?: string;
  subject?: string;
  message?: string;
}

function isChannel(v: string): v is OutreachChannel {
  return v === 'email' || v === 'sms';
}

function isAction(v: string): v is TemplateAction {
  return v === 'regenerate' || v === 'save_vertical' || v === 'save_all_verticals';
}

function parseEmailOutput(text: string) {
  const subjectMatch = text.match(/SUBJECT:\s*([\s\S]*?)\nMESSAGE:/i);
  const messageMatch = text.match(/MESSAGE:\s*([\s\S]*)$/i);
  const subject = (subjectMatch?.[1] ?? '').trim();
  const message = (messageMatch?.[1] ?? '').trim();
  return { subject, message };
}

async function getTemplate(channel: OutreachChannel, vertical: string) {
  return queryOne<{ channel: OutreachChannel; vertical: string; subject: string | null; message: string }>(`
    SELECT channel, vertical, subject, message
    FROM outreach_templates
    WHERE channel = ? AND vertical = ?
  `, [channel, vertical]);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const channelRaw = String(searchParams.get('channel') ?? 'email');
  const verticalRaw = searchParams.get('vertical');
  const leadIdRaw = searchParams.get('leadId');

  if (channelRaw !== 'all' && !isChannel(channelRaw)) {
    return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
  }

  if (!verticalRaw) {
    if (channelRaw === 'all') {
      const templates = await queryAll(`
        SELECT channel, vertical, subject, message, updated_at
        FROM outreach_templates
        ORDER BY channel ASC, vertical ASC
      `);
      return NextResponse.json({ ok: true, templates });
    }

    const templates = await queryAll(`
      SELECT channel, vertical, subject, message, updated_at
      FROM outreach_templates
      WHERE channel = ?
      ORDER BY vertical ASC
    `, [channelRaw]);
    return NextResponse.json({ ok: true, templates });
  }

  if (channelRaw === 'all') {
    return NextResponse.json({ error: 'channel=all requires no vertical parameter.' }, { status: 400 });
  }

  const vertical = normalizeVertical(verticalRaw);
  const template = await getTemplate(channelRaw, vertical);
  if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });

  if (!leadIdRaw) {
    return NextResponse.json({ ok: true, template });
  }

  const leadId = Number(leadIdRaw);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return NextResponse.json({ error: 'Invalid leadId.' }, { status: 400 });
  }

  const lead = await queryOne<{ id: number; company_name: string; location: string | null; sic_label: string | null; notes: string | null }>(`
    SELECT id, company_name, location, sic_label, notes
    FROM leads
    WHERE id = ?
  `, [leadId]);

  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const preview = renderOutreachTemplate(template, lead);
  return NextResponse.json({ ok: true, template, preview, lead });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as TemplateBody;
  const actionRaw = String(body.action ?? '');
  const channelRaw = String(body.channel ?? '');

  if (!isAction(actionRaw)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }
  if (!isChannel(channelRaw)) {
    return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
  }

  const vertical = normalizeVertical(body.vertical);

  if (actionRaw === 'save_vertical') {
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }
    if (channelRaw === 'email' && !body.subject?.trim()) {
      return NextResponse.json({ error: 'subject is required for email.' }, { status: 400 });
    }

    await runStatement(`
      INSERT INTO outreach_templates (channel, vertical, subject, message, updated_at)
      VALUES (@channel, @vertical, @subject, @message, datetime('now'))
      ON CONFLICT(channel, vertical)
      DO UPDATE SET subject = excluded.subject, message = excluded.message, updated_at = datetime('now')
    `, {
      channel: channelRaw,
      vertical,
      subject: channelRaw === 'email' ? body.subject!.trim() : null,
      message: body.message.trim(),
    });

    return NextResponse.json({ ok: true, action: actionRaw, vertical, channel: channelRaw });
  }

  if (actionRaw === 'save_all_verticals') {
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }
    if (channelRaw === 'email' && !body.subject?.trim()) {
      return NextResponse.json({ error: 'subject is required for email.' }, { status: 400 });
    }

    await withTransaction(async () => {
      for (const v of OUTREACH_VERTICALS) {
        await runStatement(`
          INSERT INTO outreach_templates (channel, vertical, subject, message, updated_at)
          VALUES (@channel, @vertical, @subject, @message, datetime('now'))
          ON CONFLICT(channel, vertical)
          DO UPDATE SET subject = excluded.subject, message = excluded.message, updated_at = datetime('now')
        `, {
          channel: channelRaw,
          vertical: v,
          subject: channelRaw === 'email' ? body.subject!.trim() : null,
          message: body.message!.trim(),
        });
      }
    });

    return NextResponse.json({ ok: true, action: actionRaw, channel: channelRaw, updated: OUTREACH_VERTICALS.length });
  }

  const stored = await getTemplate(channelRaw, vertical);
  if (!stored) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  const guidance = (body.userInput ?? '').trim();
  if (!guidance) {
    return NextResponse.json({ error: 'userInput is required to regenerate.' }, { status: 400 });
  }

  const systemPrompt = [
    'You generate B2B outreach templates for UK sales teams.',
    'Keep language professional and concise.',
    'Preserve placeholders like {{company_name}}, {{location}}, {{sic_label}}, {{notes}}.',
    'Do not invent company-specific facts.',
  ].join(' ');

  const userPrompt = channelRaw === 'email'
    ? [
        `Vertical: ${vertical}`,
        'Regenerate this EMAIL template according to user guidance.',
        `Current subject: ${stored.subject ?? ''}`,
        `Current message:\n${stored.message}`,
        `User guidance: ${guidance}`,
        'Return exactly in this format:',
        'SUBJECT: <subject text>',
        'MESSAGE: <message text>',
      ].join('\n\n')
    : [
        `Vertical: ${vertical}`,
        'Regenerate this SMS template according to user guidance.',
        `Current message:\n${stored.message}`,
        `User guidance: ${guidance}`,
        'Return exactly in this format:',
        'MESSAGE: <message text>',
      ].join('\n\n');

  try {
    const aiText = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.5, maxTokens: 700 }
    );

    if (channelRaw === 'email') {
      const parsed = parseEmailOutput(aiText);
      if (!parsed.subject || !parsed.message) {
        return NextResponse.json({ error: 'Could not parse regenerated email template.' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, action: actionRaw, channel: channelRaw, vertical, template: { subject: parsed.subject, message: parsed.message } });
    }

    const smsMessage = (aiText.match(/MESSAGE:\s*([\s\S]*)$/i)?.[1] ?? aiText).trim();
    if (!smsMessage) {
      return NextResponse.json({ error: 'Could not parse regenerated SMS template.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, action: actionRaw, channel: channelRaw, vertical, template: { subject: null, message: smsMessage } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Regeneration failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
