'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PIPELINE_STAGES, LEAD_SOURCES, LEAD_VERTICALS } from '@/lib/types';

export default function NewLeadPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    lead_name: '',
    company_name: '',
    contact_person: '',
    website: '',
    phone: '',
    email: '',
    industry: '',
    location: '',
    postcode: '',
    stage: 'lead',
    source: 'manual',
    lead_score: '0',
    opportunity_value: '',
    created_date: today,
    target_date: '',
    create_opportunity: true,
    nature_of_job: '',
    status: 'new',
    vertical: 'crm',
    detail_of_work: '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        lead_score: Number(form.lead_score),
        opportunity_value: form.opportunity_value ? Number(form.opportunity_value) : null,
        created_at: form.created_date ? `${form.created_date}T00:00:00` : null,
        next_followup_date: form.target_date || null,
        interest_level: form.nature_of_job || null,
        notes: form.detail_of_work || null,
      }),
    });
    if (res.ok) {
      const lead = await res.json();
      if (form.create_opportunity) {
        const oppResponse = await fetch('/api/sales/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            opportunity_name: form.lead_name?.trim() || `${form.company_name} Opportunity`,
            lead_id: lead.id,
            estimated_value: form.opportunity_value ? Number(form.opportunity_value) : 0,
            expected_close_date: form.target_date || null,
            notes: form.detail_of_work || null,
            status: 'open',
          }),
        });

        if (oppResponse.ok) {
          router.push('/sales/opportunities');
          return;
        }
      }

      router.push(`/leads/${lead.id}`);
    } else {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <Link href="/sales/leads" className="hover:text-slate-300">Sales Leads</Link>
          <span>/</span>
          <span>New Lead</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Add Generic Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Lead Name</label>
            <input type="text" value={form.lead_name} onChange={e => set('lead_name', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Company Name *</label>
            <input type="text" required value={form.company_name} onChange={e => set('company_name', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Contact Person</label>
            <input type="text" value={form.contact_person} onChange={e => set('contact_person', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Industry</label>
            <input type="text" value={form.industry} onChange={e => set('industry', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Website</label>
            <input type="url" value={form.website} onChange={e => set('website', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Phone</label>
            <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Location</label>
            <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Postcode</label>
            <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Vertical *</label>
            <select value={form.vertical} onChange={e => set('vertical', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              {LEAD_VERTICALS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Lead Score (0–100)</label>
            <input type="number" min="0" max="100" value={form.lead_score} onChange={e => set('lead_score', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Estimated Revenue (£)</label>
            <input type="number" min="0" value={form.opportunity_value} onChange={e => set('opportunity_value', e.target.value)}
              placeholder="e.g. 1500"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Created Date</label>
            <input type="date" value={form.created_date} onChange={e => set('created_date', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Target Date</label>
            <input type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-slate-400">Nature of Job</label>
            <input type="text" value={form.nature_of_job} onChange={e => set('nature_of_job', e.target.value)}
              placeholder="e.g. Mobile app fix, API integration, Website redesign"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.create_opportunity}
            onChange={(e) => setForm((p) => ({ ...p, create_opportunity: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
          />
          Create Opportunity (OPP) after saving this lead
        </label>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Detail of Work</label>
          <textarea value={form.detail_of_work} onChange={e => set('detail_of_work', e.target.value)} rows={4}
            placeholder="Describe scope, deliverables, timeline, and special requirements"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving || !form.company_name.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Create Lead'}
          </button>
          <Link href="/sales/leads" className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
