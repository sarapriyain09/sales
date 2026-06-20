'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Quote, QuoteItem } from '@/lib/types';

const STATUS_OPTIONS = ['draft','sent','accepted','rejected','expired'];
const STATUS_COLORS: Record<string, string> = {
  draft:'bg-slate-800 text-slate-300', sent:'bg-blue-900 text-blue-300',
  accepted:'bg-emerald-900 text-emerald-300', rejected:'bg-red-900 text-red-300',
  expired:'bg-orange-900 text-orange-300',
};

interface QuoteDetail extends Quote {
  items: QuoteItem[];
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotes/${id}`);
    if (!res.ok) { router.push('/quotes'); return; }
    setQuote(await res.json());
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(status: string) {
    setUpdatingStatus(true);
    await fetch(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
    setUpdatingStatus(false);
  }

  async function deleteQuote() {
    if (!confirm('Delete this quote?')) return;
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    router.push('/quotes');
  }

  async function downloadPdf() {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    if (!quote) return;

    const doc = new jsPDF();
    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('VELYNXIA', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('splendidtechnology.co.uk', 14, 27);

    // Quote info
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(`Quote ${quote.quote_number}`, 14, 42);
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Customer: ${quote.customer_name ?? ''}`, 14, 50);
    doc.text(`Date: ${quote.created_at.slice(0,10)}`, 14, 57);
    if (quote.expires_at) doc.text(`Expires: ${quote.expires_at.slice(0,10)}`, 14, 64);
    doc.text(`Status: ${quote.status.toUpperCase()}`, 14, 71);

    // Table
    autoTable(doc, {
      startY: 80,
      head: [['Description', 'Qty', 'Unit Price', 'VAT %', 'Line Total']],
      body: (quote.items ?? []).map(it => [
        it.description,
        it.quantity.toString(),
        `£${it.unit_price.toFixed(2)}`,
        `${it.vat_rate}%`,
        `£${(it.quantity * it.unit_price).toFixed(2)}`,
      ]),
      headStyles: { fillColor: [30, 80, 160] },
      alternateRowStyles: { fillColor: [245, 245, 255] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Subtotal: £${quote.subtotal.toFixed(2)}`, 140, finalY);
    doc.text(`VAT: £${quote.vat_amount.toFixed(2)}`, 140, finalY + 7);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: £${quote.total.toFixed(2)}`, 140, finalY + 17);

    if (quote.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Notes:', 14, finalY + 30);
      doc.text(doc.splitTextToSize(quote.notes, 170), 14, finalY + 37);
    }

    doc.save(`${quote.quote_number}.pdf`);
  }

  if (!quote) return <div className="p-12 text-center text-slate-500 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/quotes" className="hover:text-slate-300">Quotes</Link>
            <span>/</span>
            <span>{quote.quote_number}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{quote.quote_number}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[quote.status]}`}>{quote.status}</span>
            <span className="text-sm text-slate-400">{quote.customer_name}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadPdf}
            className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            Download PDF
          </button>
          <button onClick={deleteQuote}
            className="px-3 py-2 bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-300 text-sm rounded-lg transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Status update */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-500 mb-2">Update Status</p>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => updateStatus(s)} disabled={updatingStatus || quote.status === s}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                quote.status === s ? `${STATUS_COLORS[s]} ring-1 ring-current` : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Quote details */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            ['Customer', quote.customer_name],
            ['Date', quote.created_at.slice(0,10)],
            ['Expires', quote.expires_at?.slice(0,10) ?? '—'],
          ].map(([k,v]) => (
            <div key={k}>
              <p className="text-xs text-slate-500 mb-0.5">{k}</p>
              <p className="text-slate-200">{v}</p>
            </div>
          ))}
        </div>
        {quote.lead_id && (
          <Link href={`/leads/${quote.lead_id}`} className="text-xs text-blue-400 hover:text-blue-300">
            View associated lead →
          </Link>
        )}
      </div>

      {/* Line items */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500">
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-right px-4 py-3 font-medium">Qty</th>
              <th className="text-right px-4 py-3 font-medium">Unit</th>
              <th className="text-right px-4 py-3 font-medium">VAT</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(quote.items ?? []).map((item, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-slate-200">{item.description}</td>
                <td className="px-4 py-3 text-right text-slate-400">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-400">£{item.unit_price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-slate-400">{item.vat_rate}%</td>
                <td className="px-4 py-3 text-right text-slate-200">£{(item.quantity * item.unit_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-700">
            <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-slate-500">Subtotal</td><td className="px-4 py-2 text-right text-slate-300">£{quote.subtotal.toFixed(2)}</td></tr>
            <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-slate-500">VAT</td><td className="px-4 py-2 text-right text-slate-300">£{quote.vat_amount.toFixed(2)}</td></tr>
            <tr><td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-slate-100">Total</td><td className="px-4 py-2 text-right text-base font-bold text-slate-100">£{quote.total.toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>

      {quote.notes && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Notes</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
