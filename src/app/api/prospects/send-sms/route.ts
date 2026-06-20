import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { runStatement } from '@/lib/db-client';
import twilio from 'twilio';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Twilio credentials not set in .env.local' },
      { status: 503 },
    );
  }

  const body = await req.json() as {
    leadId: number;
    to: string;
    message: string;
  };

  if (!body.leadId || !body.to || !body.message) {
    return NextResponse.json({ error: 'leadId, to and message are required' }, { status: 400 });
  }

  // Normalise UK number to E.164 (+44...)
  let to = body.to.trim().replace(/\s+/g, '');
  if (to.startsWith('0')) to = '+44' + to.slice(1);
  if (!to.startsWith('+')) to = '+44' + to;

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: TWILIO_FROM_NUMBER,
      to,
      body: body.message,
    });

    await runStatement(`
      UPDATE leads
      SET sms_sent_at   = datetime('now'),
          sms_message   = @msg,
          contacted_at  = COALESCE(contacted_at, datetime('now')),
          updated_at    = datetime('now')
      WHERE id = @id
    `, { id: body.leadId, msg: body.message });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[send-sms]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send SMS' },
      { status: 500 },
    );
  }
}
