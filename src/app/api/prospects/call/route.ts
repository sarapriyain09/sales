import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { queryOne, runStatement } from '@/lib/db-client';
import { checkTps, isTpsBlocked, tpsStatusLabel } from '@/lib/tps-checker';
import twilio from 'twilio';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_WEBHOOK_BASE_URL, NEXTAUTH_URL } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Twilio credentials not set in .env.local' },
      { status: 503 },
    );
  }

  const body = await req.json() as { leadId: number; to: string };
  if (!body.leadId || !body.to) {
    return NextResponse.json({ error: 'leadId and to are required' }, { status: 400 });
  }

  // Look up the session user's phone number from the DB
  const userId = (session.user as any)?.id;
  const userRow = userId ? await queryOne<{ phone?: string }>('SELECT phone FROM users WHERE id = ?', [userId]) : undefined;
  const callerPhone = userRow?.phone?.trim();

  if (!callerPhone) {
    return NextResponse.json(
      { error: 'No phone number set on your account. Ask an admin to add it in Settings.' },
      { status: 400 },
    );
  }

  // Normalise prospect number to E.164
  let prospectNumber = body.to.trim().replace(/\s+/g, '');
  if (prospectNumber.startsWith('0')) prospectNumber = '+44' + prospectNumber.slice(1);
  if (!prospectNumber.startsWith('+')) prospectNumber = '+44' + prospectNumber;

  // ── TPS / CTPS check ────────────────────────────────────────────────────────
  // Check whether the number is registered with the Telephone Preference Service
  // (TPS) or Corporate TPS (CTPS) before placing an outbound marketing call.

  // Use a cached result if checked within the last 30 days
  const cachedLead = await queryOne<{ tps_status: string | null; tps_checked_at: string | null }>(
    `SELECT tps_status, tps_checked_at FROM leads WHERE id = ?`,
    [body.leadId]
  );

  let tpsStatus = cachedLead?.tps_status ?? null;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cacheStale = !cachedLead?.tps_checked_at || cachedLead.tps_checked_at < thirtyDaysAgo;

  if (!tpsStatus || cacheStale) {
    const result = await checkTps(body.to);
    tpsStatus = result.status;
    // Only cache a real result — don't cache 'unchecked' so that adding
    // a TPS_API_KEY later will trigger a fresh check.
    if (result.checked) {
      await runStatement(
        `UPDATE leads SET tps_status = @tps_status, tps_checked_at = @checked_at WHERE id = @id`,
        { tps_status: result.status, checked_at: result.checkedAt, id: body.leadId }
      );
    }
  }

  if (isTpsBlocked(tpsStatus as any)) {
    return NextResponse.json(
      {
        error: 'tps_registered',
        message: `This number is ${tpsStatusLabel(tpsStatus as any)}. Calling this number for marketing purposes may breach PECR and ICO regulations.`,
      },
      { status: 403 },
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Normalise caller phone to E.164
  let callerE164 = callerPhone.replace(/\s+/g, '');
  if (callerE164.startsWith('0')) callerE164 = '+44' + callerE164.slice(1);
  if (!callerE164.startsWith('+')) callerE164 = '+44' + callerE164;

  // TwiML webhook URL — Twilio hits this when the caller answers to connect to prospect
  // Must be publicly reachable — use TWILIO_WEBHOOK_BASE_URL (public domain), not NEXTAUTH_URL (may be LAN IP)
  const baseUrl = TWILIO_WEBHOOK_BASE_URL ?? NEXTAUTH_URL ?? 'https://crm.splendidtechnology.co.uk';
  const twimlUrl = `${baseUrl}/api/prospects/call/twiml?to=${encodeURIComponent(prospectNumber)}&leadId=${body.leadId}`;

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Call the user's own phone first; when they answer, TwiML dials the prospect
    await client.calls.create({
      from: TWILIO_FROM_NUMBER,
      to: callerE164,
      url: twimlUrl,
    });

    // Log the call as a note on the lead
    await runStatement(`
      INSERT INTO notes (lead_id, user_id, content, created_at)
      VALUES (@lead_id, @user_id, @body, datetime('now'))
    `, {
      lead_id: body.leadId,
      user_id: (session.user as any)?.id ?? null,
      body: `📞 Outbound call initiated to ${body.to}`,
    });

    // Mark as contacted
    await runStatement(`
      UPDATE leads
      SET contacted_at = COALESCE(contacted_at, datetime('now')), updated_at = datetime('now')
      WHERE id = @id
    `, { id: body.leadId });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[call]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to initiate call' },
      { status: 500 },
    );
  }
}
