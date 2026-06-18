'use client';

import { useEffect, useState } from 'react';

const STATUSES = [
  { key: 'upwork_prospect', label: 'Upwork Prospect' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'interview', label: 'Interview' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
] as const;

const VERTICALS = [
  { key: 'crm', label: 'CRM' },
  { key: 'digital', label: 'Digital' },
  { key: 'software', label: 'Software' },
  { key: 'ai_automation', label: 'AI Automation' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'iot', label: 'IoT' },
];

interface UpworkLead {
  id: number;
  company_name: string;
  vertical: string | null;
  upwork_client_name: string | null;
  upwork_company: string | null;
  upwork_project_title: string | null;
  upwork_project_url: string | null;
  upwork_budget: string | null;
  upwork_proposal_date: string | null;
  upwork_proposal_status: string | null;
}

export default function UpworkPage() {
  const [form, setForm] = useState({
    clientName: '',
    company: '',
    projectTitle: '',
    projectUrl: '',
    budget: '',
    proposalDate: new Date().toISOString().slice(0, 10),
    proposalStatus: 'proposal_sent',
    vertical: 'software',
    notes: '',
    followupDate: '',
    createOpportunity: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<UpworkLead[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [statusCounts, setStatusCounts] = useState<Array<{ status: string; count: number }>>([]);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/upwork/leads');
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setSummary(data.summary ?? null);
      setStatusCounts(Array.isArray(data.statusCounts) ? data.statusCounts : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(k: string, v: string | boolean) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/upwork/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Import failed.');
      } else {
        setSuccess(data.opportunityCreated ? 'Upwork lead imported, follow-up task created, and opportunity created.' : 'Upwork lead imported and follow-up task created.');
        setForm(prev => ({ ...prev, clientName: '', company: '', projectTitle: '', projectUrl: '', budget: '', notes: '' }));
        await load();
      }
    } catch {
      setError('Import failed.');
    }
    setSaving(false);
  }

  const statusMap = Object.fromEntries(statusCounts.map(x => [x.status, x.count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Upwork Leads</h1>
        <p className="text-sm text-slate-500">Import selected Upwork projects, track proposal stages, and automate follow-ups.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Total</div><div className="text-2xl text-slate-100 font-bold">{summary?.total ?? 0}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Proposal Sent</div><div className="text-2xl text-blue-300 font-bold">{summary?.proposalSent ?? 0}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Interviews</div><div className="text-2xl text-cyan-300 font-bold">{summary?.interviews ?? 0}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Won</div><div className="text-2xl text-emerald-300 font-bold">{summary?.won ?? 0}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Proposal→Interview</div><div className="text-2xl text-amber-300 font-bold">{summary?.proposalToInterviewRate ?? 0}%</div></div>
      </div>

      <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Import Upwork Project</h2>
        {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{error}</div>}
        {success && <div className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-800 rounded-lg px-3 py-2">{success}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input required value={form.projectTitle} onChange={e => setField('projectTitle', e.target.value)} placeholder="Project title" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <input required type="url" value={form.projectUrl} onChange={e => setField('projectUrl', e.target.value)} placeholder="Upwork job URL" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <input value={form.clientName} onChange={e => setField('clientName', e.target.value)} placeholder="Client name" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <input value={form.company} onChange={e => setField('company', e.target.value)} placeholder="Company" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <input value={form.budget} onChange={e => setField('budget', e.target.value)} placeholder="Budget (e.g. $2,000-$5,000)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <select value={form.vertical} onChange={e => setField('vertical', e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
            {VERTICALS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
          <input type="date" value={form.proposalDate} onChange={e => setField('proposalDate', e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <select value={form.proposalStatus} onChange={e => setField('proposalStatus', e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input type="date" value={form.followupDate} onChange={e => setField('followupDate', e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
          <input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Notes" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.createOpportunity}
            onChange={e => setField('createOpportunity', e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
          />
          Create linked opportunity on import
        </label>

        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm rounded-lg font-semibold">
          {saving ? 'Importing...' : 'Import from Upwork'}
        </button>
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-300 font-semibold">Upwork Pipeline Tracking</div>
        <div className="px-4 py-2 text-xs text-slate-500 flex gap-3 flex-wrap border-b border-slate-800">
          {STATUSES.map(s => <span key={s.key}>{s.label}: <span className="text-slate-300">{statusMap[s.key] ?? 0}</span></span>)}
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No Upwork leads yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Budget</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Vertical</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <a href={l.upwork_project_url ?? '#'} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-medium">
                      {l.upwork_project_title ?? l.company_name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{l.upwork_client_name || l.upwork_company || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{l.upwork_budget || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{(l.upwork_proposal_status || 'proposal_sent').replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-slate-400">{l.vertical || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
