import { NextRequest, NextResponse } from 'next/server';
import { runStatement } from '@/lib/db-client';

// Twilio POSTs here when a recording is ready.
// We save the recording URL as a note on the lead.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');

  // Twilio sends form-encoded body
  const form = await req.formData();
  const recordingUrl  = form.get('RecordingUrl')  as string | null;
  const recordingSid  = form.get('RecordingSid')  as string | null;
  const duration      = form.get('RecordingDuration') as string | null;

  if (leadId && recordingUrl) {
    // Twilio recording URLs need .mp3 appended to download directly
    const mp3Url = `${recordingUrl}.mp3`;
    const mins = duration ? Math.floor(Number(duration) / 60) : 0;
    const secs = duration ? Number(duration) % 60 : 0;
    const durationStr = duration ? ` (${mins}:${secs.toString().padStart(2, '0')})` : '';

    await runStatement(`
      INSERT INTO notes (lead_id, user_id, content, created_at)
      VALUES (@lead_id, NULL, @body, datetime('now'))
    `, {
      lead_id: leadId,
      body: `🎙 Call recording${durationStr}: ${mp3Url}\nSID: ${recordingSid ?? 'unknown'}`,
    });
  }

  // Twilio expects a 200 response
  return new NextResponse('', { status: 200 });
}
