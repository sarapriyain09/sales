'use client';
import { useEffect, useState } from 'react';

type Quote = {
  id: number;
  quote_number: string;
  company_name?: string | null;
  contact_name?: string | null;
  opportunity_name?: string | null;
  status: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  total_amount?: number;
  total?: number;
  email?: string | null;
};

export default function SalesQuotationsPage() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Quote[]>([]);
  const [sendingId, setSendingId] = useState<number | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const res = await fetch(`/api/sales/quotations?${params.toString()}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
  }, [status]);

  async function sendQuoteByEmail(quote: Quote) {
    const to = quote.email || prompt('Recipient email');
    if (!to) return;

    setSendingId(quote.id);

    const res = await fetch('/api/sales/quotations/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: quote.id,
        to,
        subject: `Quotation ${quote.quote_number}`,
        message: `Please find quotation ${quote.quote_number} for your review.`,
      }),
    });

    setSendingId(null);

    if (res.ok) {
      await load();
      alert('Quote sent and email history saved.');
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to send quote email');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Quotations</h1>
        <p className="text-sm text-slate-500">Draft, send, accept/reject quotation lifecycle.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-3 py-2 text-left">Quote #</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Opportunity</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Issue</th>
              <th className="px-3 py-2 text-left">Expiry</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-slate-500">No quotations yet.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/70">
                <td className="px-3 py-2 text-blue-400">{row.quote_number}</td>
                <td className="px-3 py-2 text-slate-200">{row.company_name || '-'}</td>
                <td className="px-3 py-2 text-slate-400">{row.opportunity_name || '-'}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 capitalize">{row.status}</span></td>
                <td className="px-3 py-2 text-slate-500">{row.issue_date ? row.issue_date.slice(0, 10) : '-'}</td>
                <td className="px-3 py-2 text-slate-500">{row.expiry_date ? row.expiry_date.slice(0, 10) : '-'}</td>
                <td className="px-3 py-2 text-right text-slate-100">GBP {Number(row.total_amount ?? row.total ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => sendQuoteByEmail(row)}
                    disabled={sendingId === row.id}
                    className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-600 disabled:opacity-50"
                  >
                    {sendingId === row.id ? 'Sending...' : 'Send by Email'}
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
