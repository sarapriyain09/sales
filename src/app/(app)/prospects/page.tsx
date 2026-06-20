'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Lead } from '@/lib/types';
import { LEAD_VERTICALS } from '@/lib/types';

const VERTICAL_COLORS: Record<string, string> = {
  crm:          'border-b-2 border-amber-400 text-amber-400',
  ai_automation:'border-b-2 border-fuchsia-400 text-fuchsia-400',
  iot:          'border-b-2 border-cyan-400 text-cyan-400',
  engineering:  'border-b-2 border-blue-400 text-blue-400',
  digital:      'border-b-2 border-violet-400 text-violet-400',
  software:     'border-b-2 border-emerald-400 text-emerald-400',
  all:          'border-b-2 border-white text-white',
};

function scoreColor(score: number) {
  if (score >= 70) return 'bg-red-900 text-red-200';
  if (score >= 50) return 'bg-amber-900 text-amber-200';
  if (score >= 30) return 'bg-blue-900 text-blue-200';
  return 'bg-slate-800 text-slate-400';
}

function buildSMS(prospect: Lead): string {
  const reasons = (prospect.notes ?? '').split(' · ').filter(Boolean);
  const hasNoWebsite = reasons.some(r => r.toLowerCase().includes('no website'));
  if (hasNoWebsite) {
    return `Hi, I'm from Velynxia. We build professional websites from £50. Can we book a quick chat? splendidtechnology.co.uk`;
  }
  return `Hi, I spotted issues with your website costing you customers. Can we book an appointment to fix them? Velynxia - splendidtechnology.co.uk`;
}

// ─── SMS compose modal ───────────────────────────────────────────────────────
function SmsPanel({ prospect, onClose, onSent }: {
  prospect: Lead;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to,      setTo]      = useState(prospect.phone ?? '');
  const [message, setMessage] = useState(buildSMS(prospect));
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    fetch(`/api/outreach/templates?channel=sms&vertical=${prospect.vertical ?? 'digital'}&leadId=${prospect.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.preview?.message) setMessage(data.preview.message as string);
      })
      .catch(() => {});
  }, [prospect.id, prospect.vertical]);

  const charsLeft = 160 - message.length;

  async function send() {
    if (!to.trim() || !message.trim()) return;
    setSending(true); setError('');
    const res = await fetch('/api/prospects/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: prospect.id, to, message }),
    });
    const data = await res.json();
    if (res.status === 503 && data.error === 'not_configured') {
      setNotConfigured(true); setSending(false); return;
    }
    if (!res.ok) { setError(data.error ?? 'Failed to send'); setSending(false); return; }
    setSent(true);
    setTimeout(() => { onSent(); onClose(); }, 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100">Send SMS</h2>
            <p className="text-xs text-slate-500">{prospect.company_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {notConfigured && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4 space-y-2">
              <div className="text-amber-300 font-semibold text-sm">⚠ Twilio Not Configured</div>
              <p className="text-xs text-slate-400">Add these to <span className="font-mono text-slate-300">.env.local</span> and restart:</p>
              <pre className="text-xs text-slate-300 bg-slate-800 rounded p-3 font-mono leading-relaxed">{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxx\nTWILIO_AUTH_TOKEN=your-auth-token\nTWILIO_FROM_NUMBER=+441234567890`}</pre>
              <p className="text-xs text-slate-500">Sign up at <strong className="text-slate-400">twilio.com</strong> → get a UK number (~£1/month).</p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">To (phone number)</label>
            <input type="tel" value={to} onChange={e => setTo(e.target.value)}
              placeholder="07700 900000"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            <p className="text-[10px] text-slate-600">UK numbers auto-converted to +44 format</p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-slate-400">Message</label>
              <span className={`text-[10px] ${charsLeft < 0 ? 'text-red-400' : charsLeft < 20 ? 'text-amber-400' : 'text-slate-600'}`}>
                {message.length} / 160 chars
              </span>
            </div>
            <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none leading-relaxed" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-600">Sent via Twilio · ~4p per SMS</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
            {sent ? (
              <span className="px-5 py-2 text-sm font-medium text-emerald-400">✓ Sent!</span>
            ) : (
              <button onClick={send} disabled={sending || !to.trim() || charsLeft < 0}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
                {sending ? 'Sending…' : '📱 Send SMS'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildEmail(prospect: Lead): { subject: string; message: string } {
  const name    = prospect.company_name;
  const isAccountant = /account/i.test(prospect.company_name);
  const isNewCompany = prospect.source === 'companies_house';
  const isEngineering = prospect.vertical === 'engineering';

  if (isEngineering) {
    const subject = `Engineering Design & CAD Support – Velynxia Engineering Services`;
    const message =
`Dear ${name},

I hope this message finds you well.

My name is Raja Saravanan, and I reach out on behalf of Velynxia Engineering Services — a UK-based engineering support company specialising in CAD design, CAE analysis, and technical drafting for manufacturers.

We work with manufacturing companies across the Midlands and the UK, providing flexible engineering capacity without the overhead of permanent hires:

  • 2D & 3D CAD Design — SolidWorks, Autodesk Inventor, AutoCAD
  • FEA / Structural Analysis — stress, fatigue, thermal
  • CFD Analysis — fluid flow and thermal simulation
  • Manufacturing & Assembly Drawings
  • Reverse Engineering & Design Modifications
  • Engineering Documentation & Technical Reports

We understand that manufacturers often face peaks in design workload — new product launches, contract wins, or engineering team gaps. That is exactly where we step in.

I would love to connect and learn more about your current engineering challenges — no sales pitch, just a straightforward conversation.

Would you be open to a brief 15-minute call this week?

Kind regards,

Raja Saravanan
Founder & Business Development Lead

Velynxia Engineering Services

📞 Mobile: 07723 144910
📧 raja@splendidtechnology.co.uk
🌐 www.splendidtechnology.co.uk

CAD Design | FEA Analysis | CFD | Drafting | Reverse Engineering`;
    return { subject, message };
  }

  if (isNewCompany && !isAccountant) {
    const subject = `Congratulations on Your New Business – Velynxia`;
    const message =
`Dear ${name},

Congratulations on registering your new company! Starting a business is a big step, and we'd love to help you get off to the best possible start.

At Velynxia, we specialise in helping new businesses build a strong digital foundation:

  • Professional websites from £499 — get online and get found
  • Business email (yourname@yourdomain.co.uk) — look professional from day one
  • CRM & customer management tools — stay organised as you grow
  • Hosting, domain registration & ongoing support

We understand that when you're just starting out, budget and time are tight. That's why we offer flexible packages designed specifically for new businesses — no jargon, no lock-in contracts.

Would you be open to a free 15-minute chat to see how we can help?

Kind regards,

Raja Saravanan
Founder & Business Development Lead

Velynxia

📞 Mobile: 07723 144910
📧 raja@splendidtechnology.co.uk
🌐 www.splendidtechnology.co.uk

Websites | Hosting | Business Email | CRM Solutions | Business Process Automation`;
    return { subject, message };
  }

  if (isAccountant) {
    const subject = `Business Collaboration Opportunity – Velynxia`;
    const message =
`Dear ${name},

I hope you are doing well.

My name is Raja Saravanan, and I am the Founder & Business Development Lead at Velynxia.

We work with small and medium-sized businesses, helping them improve their digital presence through professional websites, business email solutions, hosting, CRM systems, and business process automation.

As accountants play a key role in supporting growing businesses, I believe there may be opportunities for us to collaborate and add value to your clients. Many SMEs require assistance with their online presence, customer management, and digital systems, and we aim to provide practical, cost-effective solutions tailored to their needs.

I would welcome the opportunity to learn more about your firm, understand the challenges your clients face, and explore whether there are areas where we could support each other professionally.

Would you be available for a brief call or meeting in the coming weeks?

I look forward to hearing from you.

Kind regards,

Raja Saravanan
Founder & Business Development Lead

Velynxia

📞 Mobile: 07723 144910
📧 raja@splendidtechnology.co.uk
🌐 www.splendidtechnology.co.uk

Websites | Hosting | Business Email | CRM Solutions | Business Process Automation`;
    return { subject, message };
  }

  const reasons = (prospect.notes ?? '').split(' · ').filter(Boolean);
  // Strip internal scoring labels (sector tags, CRM detection, keyword flags) and score numbers
  const INTERNAL_LABEL = /sector \(\+\d+\)|industrial keywords|no crm detected|website looks good/i;
  const issueLines = reasons
    .filter(r => !INTERNAL_LABEL.test(r))
    .map(r => r.replace(/\s*\(\+\d+\)/, '').trim())
    .filter(Boolean)
    .map(r => `  • ${r}`)
    .join('\n');
  const subject = `Your website – quick note from Velynxia`;
  const hasNoWebsite = reasons.some(r => r.toLowerCase().includes('no website'));
  const message = hasNoWebsite
    ? `Hi ${name},\n\nI noticed your business doesn't currently have a website. In today's market, most customers search online before making a call — so not having a website means missing out on new enquiries every day.\n\nAt Velynxia, we build professional, mobile-friendly websites starting from just £499. We'd love to help get you online.\n\nWould you be open to a free 15-minute chat this week?\n\nKind regards,\n\nRaja Saravanan\nFounder & Business Development Lead\n\nVelynxia\n\n📞 Mobile: 07723 144910\n📧 raja@splendidtechnology.co.uk\n🌐 www.splendidtechnology.co.uk\n\nWebsites | Hosting | Business Email | CRM Solutions | Business Process Automation`
    : `Hi ${name},\n\nI came across your website and noticed a few things that could be holding your business back online:\n\n${issueLines || '  • Several improvements available'}\n\nAt Velynxia, we help businesses like yours fix these issues quickly and affordably — with no jargon.\n\nWould you be open to a free 15-minute call this week to see if we can help?\n\nKind regards,\n\nRaja Saravanan\nFounder & Business Development Lead\n\nVelynxia\n\n📞 Mobile: 07723 144910\n📧 raja@splendidtechnology.co.uk\n🌐 www.splendidtechnology.co.uk\n\nWebsites | Hosting | Business Email | CRM Solutions | Business Process Automation`;
  return { subject, message };
}

// ─── Email compose modal ─────────────────────────────────────────────────────
function EmailPanel({ prospect, onClose, onSent }: {
  prospect: Lead;
  onClose: () => void;
  onSent: () => void;
}) {
  const draft = buildEmail(prospect);
  const [to,      setTo]      = useState(prospect.email ?? '');
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scraped,  setScraped]  = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/outreach/templates?channel=email&vertical=${prospect.vertical ?? 'digital'}&leadId=${prospect.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.preview?.subject) setSubject(data.preview.subject as string);
        if (data?.preview?.message) setMessage(data.preview.message as string);
      })
      .catch(() => {});
  }, [prospect.id, prospect.vertical]);

  // Auto-scrape email from website when panel opens and no email known
  useEffect(() => {
    if (prospect.email || !prospect.website) return;
    setScraping(true);
    fetch(`/api/ch/scrape-email?url=${encodeURIComponent(prospect.website)}`)
      .then(r => r.json())
      .then(data => {
        const emails: string[] = data.emails ?? [];
        if (emails.length > 0) {
          setTo(emails[0]);
          setScraped(emails);
        }
      })
      .catch(() => {})
      .finally(() => setScraping(false));
  }, [prospect.website, prospect.email]);

  async function send() {
    if (!to.trim() || !subject.trim() || !message.trim()) return;
    setSending(true); setError('');
    const res = await fetch('/api/prospects/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: prospect.id, to, subject, message }),
    });
    const data = await res.json();
    if (res.status === 503 && data.error === 'not_configured') {
      setNotConfigured(true); setSending(false); return;
    }
    if (!res.ok) { setError(data.error ?? 'Failed to send'); setSending(false); return; }
    setSent(true);
    setTimeout(() => { onSent(); onClose(); }, 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100">Send Outreach Email</h2>
            <p className="text-xs text-slate-500">{prospect.company_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {notConfigured && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4 space-y-2">
              <div className="text-amber-300 font-semibold text-sm">⚠ SMTP Not Configured</div>
              <p className="text-xs text-slate-400">Add these to <span className="font-mono text-slate-300">.env.local</span> and restart the dev server:</p>
              <pre className="text-xs text-slate-300 bg-slate-800 rounded p-3 font-mono leading-relaxed">{`SMTP_USER=you@gmail.com\nSMTP_PASS=your-app-password\nSMTP_FROM_NAME=Velynxia`}</pre>
              <p className="text-xs text-slate-500">For Gmail: myaccount.google.com → Security → 2-Step Verification → App passwords.</p>
            </div>
          )}
          {prospect.notes && prospect.notes !== 'Website looks good' && (
            <div className="flex flex-wrap gap-1">
              {prospect.notes.split(' · ').filter(Boolean).map((r, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">{r}</span>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">To</label>
              {scraping && <span className="text-[10px] text-slate-500 animate-pulse">🔍 Scanning website for email…</span>}
            </div>
            <input type="email" value={to} onChange={e => setTo(e.target.value)}
              placeholder="contact@theirbusiness.co.uk"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            {scraped.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[10px] text-slate-500">Found:</span>
                {scraped.map(e => (
                  <button key={e} onClick={() => setTo(e)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${to === e ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            {scraped.length === 0 && !scraping && !prospect.email && prospect.website && (
              <p className="text-[10px] text-slate-600">No email found on website — enter manually</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Message</label>
            <textarea rows={11} value={message} onChange={e => setMessage(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none font-mono leading-relaxed" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-600">Replies go to info@splendidtechnology.co.uk</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
            {sent ? (
              <span className="px-5 py-2 text-sm font-medium text-emerald-400">✓ Sent!</span>
            ) : (
              <button onClick={send} disabled={sending || !to.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
                {sending ? 'Sending…' : '✉ Send Email'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [prospects,       setProspects]       = useState<Lead[]>([]);
  const [search,          setSearch]          = useState('');
  const [loading,         setLoading]         = useState(true);
  const [convertingId,    setConvertingId]    = useState<number | null>(null);
  const [markingId,       setMarkingId]       = useState<number | null>(null);
  const [emailTarget,     setEmailTarget]     = useState<Lead | null>(null);
  const [smsTarget,       setSmsTarget]       = useState<Lead | null>(null);
  const [filterContacted, setFilterContacted] = useState<'all' | 'contacted' | 'not_contacted'>('all');
  const [vertical,        setVertical]        = useState<string>('all');
  const [createdBy,       setCreatedBy]       = useState('');
  const [users,           setUsers]           = useState<{ id: number; name: string }[]>([]);
  const [selected,        setSelected]        = useState<Set<number>>(new Set());
  const [deletingIds,     setDeletingIds]     = useState<Set<number>>(new Set());
  const [deletingBulk,    setDeletingBulk]    = useState(false);
  const [movingBulk,      setMovingBulk]      = useState(false);
  const [bulkVertical,    setBulkVertical]    = useState<string>('engineering');
  const [callingId,       setCallingId]       = useState<number | null>(null);
  const [callError,       setCallError]       = useState<string>('');

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ stage: 'prospect' });
    if (search)              p.set('search', search);
    if (createdBy)           p.set('assigned_to', createdBy);
    if (vertical !== 'all')  p.set('vertical', vertical);
    const data = await fetch(`/api/leads?${p}`).then(r => r.json());
    setProspects(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search, createdBy, vertical]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => setUsers(Array.isArray(data) ? data : []));
  }, []);

  async function initiateCall(prospect: Lead) {
    if (!prospect.phone) return;
    setCallingId(prospect.id);
    setCallError('');
    try {
      const res = await fetch('/api/prospects/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: prospect.id, to: prospect.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'tps_registered') {
          setCallError(`🚫 TPS Blocked — ${data.message}`);
        } else {
          setCallError(data.error ?? 'Failed to initiate call');
        }
      } else {
        // Brief success flash then refresh notes
        fetchProspects();
      }
    } catch {
      setCallError('Network error');
    } finally {
      setCallingId(null);
    }
  }

  async function markContacted(id: number) {
    setMarkingId(id);
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacted_at: new Date().toISOString() }),
    });
    setMarkingId(null);
    fetchProspects();
  }

  async function deleteOne(id: number) {
    if (!confirm('Delete this prospect?')) return;
    setDeletingIds(prev => new Set(prev).add(id));
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    fetchProspects();
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} selected prospect(s)? This cannot be undone.`)) return;
    setDeletingBulk(true);
    await Promise.all([...selected].map(id => fetch(`/api/leads/${id}`, { method: 'DELETE' })));
    setSelected(new Set());
    setDeletingBulk(false);
    fetchProspects();
  }

  async function moveSelectedVertical() {
    if (selected.size === 0) return;
    const label = LEAD_VERTICALS.find(v => v.key === bulkVertical)?.label ?? bulkVertical;
    if (!confirm(`Move ${selected.size} selected prospect(s) to ${label}?`)) return;
    setMovingBulk(true);
    await Promise.all(
      [...selected].map(id =>
        fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical: bulkVertical }),
        }),
      ),
    );
    setSelected(new Set());
    setMovingBulk(false);
    fetchProspects();
  }

  function toggleSelect(id: number) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  }

  async function convertToLead(id: number) {
    setConvertingId(id);
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'lead', status: 'new' }),
    });
    setConvertingId(null);
    fetchProspects();
  }

  const filtered = prospects.filter(p => {
    if (filterContacted === 'contacted')     return !!p.contacted_at;
    if (filterContacted === 'not_contacted') return !p.contacted_at;
    return true;
  });

  const contactedCount    = prospects.filter(p => !!p.contacted_at).length;
  const notContactedCount = prospects.filter(p => !p.contacted_at).length;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('prospects-selection-changed', { detail: { ids: [...selected] } }));
  }, [selected]);

  return (
    <div className="space-y-5">
      {emailTarget && (
        <EmailPanel prospect={emailTarget} onClose={() => setEmailTarget(null)} onSent={fetchProspects} />
      )}
      {smsTarget && (
        <SmsPanel prospect={smsTarget} onClose={() => setSmsTarget(null)} onSent={fetchProspects} />
      )}

      {/* Call error toast */}
      {callError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-950 border border-red-800 rounded-xl text-sm text-red-200">
          <span>📞 Call failed: {callError}</span>
          <button onClick={() => setCallError('')} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Prospects</h1>
          <p className="text-sm text-slate-500">
            {prospects.length} total · {contactedCount} contacted · {notContactedCount} to contact
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/prospect-finder" className="px-3 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors">
            ⊙ Prospect Finder
          </Link>
          <Link href="/generate" className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors">
            ⚡ Generator
          </Link>
          <Link href="/prospects/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors">
            + New
          </Link>
        </div>
      </div>

      {/* Vertical tabs */}
      <div className="border-b border-slate-800">
        <div className="flex gap-0.5 overflow-x-auto">
          {[{ key: 'all', label: 'All' }, ...LEAD_VERTICALS].map(v => {
            const isActive = vertical === v.key;
            const activeClass = VERTICAL_COLORS[v.key] ?? VERTICAL_COLORS['all'];
            const count = v.key === 'all' ? prospects.length : 0; // loaded from server
            return (
              <button key={v.key} onClick={() => setVertical(v.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? activeClass : 'text-slate-500 hover:text-slate-300'
                }`}>
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-950 border border-red-800 rounded-xl">
          <span className="text-sm text-red-200 font-medium">{selected.size} selected</span>
          <select
            value={bulkVertical}
            onChange={e => setBulkVertical(e.target.value)}
            className="bg-slate-900 border border-red-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          >
            {LEAD_VERTICALS.map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
          <button onClick={moveSelectedVertical} disabled={movingBulk || deletingBulk}
            className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
            {movingBulk ? 'Moving…' : 'Move Vertical'}
          </button>
          <button onClick={deleteSelected} disabled={deletingBulk}
            className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
            {deletingBulk ? 'Deleting…' : `🗑 Delete ${selected.size}`}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-red-400 hover:text-red-200 transition-colors">
            Clear selection
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input type="text" placeholder="Search company, location, email…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        <div className="flex gap-1">
          {(['all', 'not_contacted', 'contacted'] as const).map(f => (
            <button key={f} onClick={() => setFilterContacted(f)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                filterContacted === f ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {f === 'all' ? `All (${prospects.length})` : f === 'contacted' ? `✉ Contacted (${contactedCount})` : `Pending (${notContactedCount})`}
            </button>
          ))}
        </div>
        {users.length > 0 && (
          <select value={createdBy} onChange={e => setCreatedBy(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl py-16 text-center">
          <p className="text-slate-400 font-medium">No prospects yet</p>
          <p className="text-slate-600 text-sm mt-1">Use the Prospect Finder or Generator to find businesses.</p>
          <div className="flex gap-3 justify-center mt-4">
            <Link href="/prospect-finder" className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors">
              ⊙ Prospect Finder
            </Link>
            <Link href="/prospects/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
              + New Prospect
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="accent-blue-500 w-4 h-4 cursor-pointer" />
                  </th>
                  <th className="px-3 py-3 text-center w-14">Score</th>
                  <th className="px-3 py-3 text-left">Company</th>
                  <th className="px-3 py-3 text-left">Contact</th>
                  <th className="px-3 py-3 text-left">Issues Found</th>
                  <th className="px-3 py-3 text-left">Outreach</th>
                  <th className="px-3 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${selected.has(p.id) ? 'bg-slate-800/60' : ''}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="accent-blue-500 w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold ${scoreColor(p.lead_score ?? 0)}`}>
                        {p.lead_score ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/leads/${p.id}`} className="font-medium text-slate-100 hover:text-blue-400 transition-colors text-sm">
                        {p.company_name}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">{p.location ?? '—'}</div>
                      {p.sic_label && <div className="text-xs text-slate-600">{p.sic_label}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {p.phone && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-slate-300">{p.phone}</span>
                          {p.tps_status === 'tps' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-300 font-medium">TPS</span>}
                          {p.tps_status === 'ctps' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900 text-orange-300 font-medium">CTPS</span>}
                          {p.tps_status === 'tps_and_ctps' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-300 font-medium">TPS+CTPS</span>}
                        </div>
                      )}
                      {p.contact_name && (
                        <div className="text-xs text-slate-300 font-medium">{p.contact_name}</div>
                      )}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 block truncate max-w-[160px]">
                          {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}
                      {p.email && (
                        <a href={`mailto:${p.email}`}
                          className="text-xs text-emerald-400 hover:text-emerald-300 block truncate max-w-[160px]">
                          ✉ {p.email}
                        </a>
                      )}
                      {p.linkedin_url && (
                        <a href={p.linkedin_url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 block mt-0.5">
                          in LinkedIn
                        </a>
                      )}
                      {!p.phone && !p.website && !p.email && !p.contact_name && <span className="text-xs text-slate-600">No contact info</span>}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      {p.notes ? (
                        <div className="space-y-0.5">
                          {p.notes.split(' · ').filter(Boolean).slice(0, 3).map((r, i) => (
                            <div key={i} className="text-xs text-slate-400">· {r}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {p.contacted_at ? (
                        <div>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 font-medium">✉ Contacted</span>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {new Date(p.contacted_at).toLocaleDateString('en-GB')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">Not contacted</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <button onClick={() => setEmailTarget(p)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                            p.contacted_at
                              ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                              : 'bg-blue-700 hover:bg-blue-600 text-white'
                          }`}>
                          {p.contacted_at ? '✉ Send Again' : '✉ Send Email'}
                        </button>
                        {p.phone && (
                          <button onClick={() => setSmsTarget(p)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                              p.sms_sent_at
                                ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                : 'bg-violet-700 hover:bg-violet-600 text-white'
                            }`}>
                            {p.sms_sent_at ? '📱 SMS Again' : '📱 Send SMS'}
                          </button>
                        )}
                        {p.phone && (() => {
                          const tpsBlocked = p.tps_status === 'tps' || p.tps_status === 'ctps' || p.tps_status === 'tps_and_ctps';
                          return (
                            <button
                              onClick={() => !tpsBlocked && initiateCall(p)}
                              disabled={callingId === p.id || tpsBlocked}
                              title={tpsBlocked ? `Cannot call — ${p.tps_status === 'tps_and_ctps' ? 'TPS & CTPS' : p.tps_status?.toUpperCase()} registered` : undefined}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                                tpsBlocked
                                  ? 'bg-red-950 text-red-400 cursor-not-allowed'
                                  : 'bg-green-800 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-green-100'
                              }`}>
                              {callingId === p.id ? '📞 Calling…' : tpsBlocked ? '🚫 TPS Blocked' : '📞 Call'}
                            </button>
                          );
                        })()}
                        {!p.contacted_at && (
                          <button onClick={() => markContacted(p.id)} disabled={markingId === p.id}
                            className="text-xs px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:bg-slate-700 disabled:text-slate-500 text-emerald-200 rounded-lg font-medium transition-colors whitespace-nowrap">
                            {markingId === p.id ? 'Marking…' : '✓ Mark Contacted'}
                          </button>
                        )}
                        <button onClick={() => convertToLead(p.id)} disabled={convertingId === p.id}
                          className="text-xs px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-emerald-100 rounded-lg font-medium transition-colors whitespace-nowrap">
                          {convertingId === p.id ? 'Converting…' : '→ Convert to Lead'}
                        </button>
                        <Link href={`/leads/${p.id}`} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                          View details →
                        </Link>
                        <button onClick={() => deleteOne(p.id)} disabled={deletingIds.has(p.id)}
                          className="text-xs px-3 py-1.5 bg-red-900 hover:bg-red-800 disabled:bg-slate-700 disabled:text-slate-500 text-red-200 rounded-lg font-medium transition-colors whitespace-nowrap">
                          {deletingIds.has(p.id) ? 'Deleting…' : '🗑 Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
