'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type SalesLead = {
  id: number;
  lead_name?: string | null;
  company_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  industry?: string | null;
  status: string;
  assigned_to?: number | null;
  assigned_user_name?: string | null;
  created_at: string;
  notes?: string | null;
};

export default function SalesLeadsPage() {
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [company, setCompany] = useState('');
  const [rows, setRows] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (owner) params.set('owner', owner);
    const response = await fetch(`/api/sales/leads?${params.toString()}`);
    const data = await response.json();
    const filtered = Array.isArray(data)
      ? data.filter((item) => !company || (item.company_name ?? '').toLowerCase().includes(company.toLowerCase()))
      : [];
    setRows(filtered);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [status, owner]);

  async function convertLead(id: number) {
    setConvertingId(id);
    const response = await fetch('/api/sales/leads/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id, create_opportunity: true }),
    });

    if (response.ok) {
      await load();
    }

    setConvertingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Sales Leads</h1>
          <p className="text-sm text-slate-500">Lead → Qualified → Opportunity conversion queue.</p>
        </div>
        <Link
          href="/leads/new"
          className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
        >
          + Add Lead
        </Link>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200">
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="disqualified">Disqualified</option>
        </select>

        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner ID"
          className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200"
        />

        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company filter"
          className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200"
        />

        <button onClick={load} className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500">Apply</button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-3 py-2 text-left">Lead</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Owner</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={8}>Loading leads...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={8}>No leads found.</td></tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/70">
                <td className="px-3 py-2 text-slate-300">{row.lead_name || `Lead #${row.id}`}</td>
                <td className="px-3 py-2 text-slate-200">{row.company_name}</td>
                <td className="px-3 py-2 text-slate-400">{row.contact_person || '-'}</td>
                <td className="px-3 py-2 text-slate-400 capitalize">{row.source || '-'}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 capitalize">{row.status}</span>
                </td>
                <td className="px-3 py-2 text-slate-400">{row.assigned_user_name || row.assigned_to || '-'}</td>
                <td className="px-3 py-2 text-slate-500">{row.created_at.slice(0, 10)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => convertLead(row.id)}
                    disabled={convertingId === row.id}
                    className="px-2 py-1 rounded bg-emerald-700 text-white text-xs hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {convertingId === row.id ? 'Converting...' : 'Convert Lead'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
