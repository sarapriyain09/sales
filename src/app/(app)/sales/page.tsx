'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type DashboardData = {
  leadsByStatus: Array<{ status: string; count: number }>;
  opportunitiesByStage: Array<{ stage: string; count: number }>;
  pipelineValue: number;
  weightedPipeline: number;
  closedRevenue: number;
  winRate: number;
  monthlySales: Array<{ month: string; won_value: number }>;
  upcomingFollowUps: Array<{ id: number; follow_up_date: string; follow_up_type: string; company_name?: string | null; opportunity_name?: string | null }>;
  recentActivities: Array<{ id: number; activity_type: string; date: string; company_name?: string | null; notes?: string | null }>;
};

function money(value: number) {
  return `GBP ${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

export default function SalesDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/sales/dashboard').then(r => r.json()).then(setData);
  }, []);

  const leadTotal = useMemo(() => (data?.leadsByStatus ?? []).reduce((sum, row) => sum + Number(row.count), 0), [data]);

  if (!data) {
    return <div className="text-sm text-slate-500">Loading sales dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Sales Dashboard</h1>
          <p className="text-sm text-slate-400">Lead to close visibility for your full sales workflow.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/sales/leads" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500">Leads</Link>
          <Link href="/sales/opportunities" className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700">Opportunities</Link>
          <Link href="/sales/quotations" className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700">Quotations</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Current pipeline value</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{money(data.pipelineValue)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Weighted pipeline</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{money(data.weightedPipeline)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Closed revenue</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{money(data.closedRevenue)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Win rate</div>
          <div className="text-2xl font-bold text-violet-400 mt-1">{data.winRate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Leads by status ({leadTotal})</h2>
          <div className="space-y-2">
            {data.leadsByStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between text-sm border-b border-slate-800 pb-2">
                <span className="text-slate-400 capitalize">{row.status}</span>
                <span className="text-slate-100 font-medium">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Opportunities by stage</h2>
          <div className="space-y-2">
            {data.opportunitiesByStage.map((row) => (
              <div key={row.stage} className="flex items-center justify-between text-sm border-b border-slate-800 pb-2">
                <span className="text-slate-400">{row.stage}</span>
                <span className="text-slate-100 font-medium">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Monthly sales</h2>
          <div className="space-y-2">
            {data.monthlySales.map((row) => (
              <div key={row.month} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{row.month}</span>
                <span className="text-emerald-300">{money(Number(row.won_value || 0))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Upcoming follow-ups</h2>
          <div className="space-y-2">
            {data.upcomingFollowUps.length === 0 && <div className="text-sm text-slate-500">No follow-ups scheduled.</div>}
            {data.upcomingFollowUps.map((row) => (
              <div key={row.id} className="text-sm border-b border-slate-800 pb-2">
                <div className="text-slate-200">{row.company_name ?? row.opportunity_name ?? 'Follow-up'}</div>
                <div className="text-xs text-slate-500">{row.follow_up_type} on {row.follow_up_date.slice(0, 10)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Recent activities</h2>
        <div className="space-y-2">
          {data.recentActivities.length === 0 && <div className="text-sm text-slate-500">No activities yet.</div>}
          {data.recentActivities.map((row) => (
            <div key={row.id} className="text-sm border-b border-slate-800 pb-2">
              <div className="text-slate-200">{row.company_name ?? 'Lead'} • {row.activity_type}</div>
              <div className="text-xs text-slate-500">{row.date.slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
