'use client';
import { useEffect, useState } from 'react';

type ForecastItem = {
  id: number;
  opportunity_name: string;
  company_name?: string | null;
  stage_name?: string | null;
  estimated_value: number;
  probability: number;
  forecast_value: number;
  expected_close_date?: string | null;
  status: string;
};

type ForecastResponse = {
  currentPipelineValue: number;
  weightedPipeline: number;
  closedRevenue: number;
  winRate: number;
  items: ForecastItem[];
};

function money(value: number) {
  return `GBP ${Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

export default function ForecastsPage() {
  const [data, setData] = useState<ForecastResponse | null>(null);

  useEffect(() => {
    fetch('/api/sales/forecasts').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div className="text-sm text-slate-500">Loading forecasts...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Forecasts</h1>
        <p className="text-sm text-slate-500">Forecast = Opportunity Value x Probability</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Current pipeline value</div>
          <div className="text-xl font-bold text-slate-100 mt-1">{money(data.currentPipelineValue)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Weighted pipeline</div>
          <div className="text-xl font-bold text-cyan-400 mt-1">{money(data.weightedPipeline)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Closed revenue</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{money(data.closedRevenue)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Win rate</div>
          <div className="text-xl font-bold text-violet-400 mt-1">{data.winRate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-800">
              <th className="px-3 py-2 text-left">Opportunity</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Stage</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Probability</th>
              <th className="px-3 py-2 text-right">Forecast</th>
              <th className="px-3 py-2 text-left">Close date</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-slate-500">No opportunity forecasts available.</td></tr>
            )}
            {data.items.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/70">
                <td className="px-3 py-2 text-slate-100">{row.opportunity_name}</td>
                <td className="px-3 py-2 text-slate-300">{row.company_name || '-'}</td>
                <td className="px-3 py-2 text-slate-400">{row.stage_name || '-'}</td>
                <td className="px-3 py-2 text-right text-slate-300">{money(row.estimated_value)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{row.probability}%</td>
                <td className="px-3 py-2 text-right text-cyan-400">{money(row.forecast_value)}</td>
                <td className="px-3 py-2 text-slate-500">{row.expected_close_date ? row.expected_close_date.slice(0, 10) : '-'}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 capitalize">{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
