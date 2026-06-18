'use client';
import { useEffect, useState } from 'react';

type Pipeline = { id: number; name: string; description: string | null; sort_order: number };
type Stage = { id: number; name: string; sort_order: number; is_closed: number; is_won: number; default_probability: number };

export default function SalesPipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [newPipelineName, setNewPipelineName] = useState('');

  async function loadPipelines() {
    const res = await fetch('/api/sales/pipelines');
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setPipelines(list);
    if (!selectedPipelineId && list.length > 0) {
      setSelectedPipelineId(list[0].id);
    }
  }

  async function loadStages(pipelineId: number) {
    const res = await fetch(`/api/sales/pipelines/${pipelineId}/stages`);
    const data = await res.json();
    setStages(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPipelines();
  }, []);

  useEffect(() => {
    if (selectedPipelineId) {
      loadStages(selectedPipelineId);
    }
  }, [selectedPipelineId]);

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    const res = await fetch('/api/sales/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPipelineName }),
    });

    if (res.ok) {
      setNewPipelineName('');
      await loadPipelines();
    }
  }

  function updateStage(idx: number, field: keyof Stage, value: string | number | boolean) {
    setStages((prev) => prev.map((stage, i) => (i === idx ? { ...stage, [field]: value } : stage)));
  }

  function addStage() {
    setStages((prev) => ([
      ...prev,
      {
        id: Date.now(),
        name: 'New Stage',
        sort_order: prev.length + 1,
        is_closed: 0,
        is_won: 0,
        default_probability: 0,
      },
    ]));
  }

  async function saveStages() {
    if (!selectedPipelineId) return;

    const payload = stages.map((stage, index) => ({
      name: stage.name,
      sort_order: index + 1,
      is_closed: Number(stage.is_closed),
      is_won: Number(stage.is_won),
      default_probability: Number(stage.default_probability),
    }));

    const res = await fetch(`/api/sales/pipelines/${selectedPipelineId}/stages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: payload }),
    });

    if (res.ok) {
      await loadStages(selectedPipelineId);
      alert('Stages saved');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Pipeline Settings</h1>
        <p className="text-sm text-slate-500">Configure pipeline and stages from settings.</p>
      </div>

      <form onSubmit={createPipeline} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex gap-2">
        <input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} placeholder="New pipeline name" className="flex-1 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
        <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500">Create</button>
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex gap-2 flex-wrap">
        {pipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            onClick={() => setSelectedPipelineId(pipeline.id)}
            className={`px-3 py-2 rounded text-sm ${selectedPipelineId === pipeline.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {pipeline.name}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500">
              <th className="px-3 py-2 text-left">Stage</th>
              <th className="px-3 py-2 text-left">Sort</th>
              <th className="px-3 py-2 text-left">Probability %</th>
              <th className="px-3 py-2 text-left">Closed</th>
              <th className="px-3 py-2 text-left">Won</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, idx) => (
              <tr key={`${stage.id}-${idx}`} className="border-b border-slate-800/70">
                <td className="px-3 py-2">
                  <input value={stage.name} onChange={(e) => updateStage(idx, 'name', e.target.value)} className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200" />
                </td>
                <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  <input type="number" value={stage.default_probability} onChange={(e) => updateStage(idx, 'default_probability', Number(e.target.value))} className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200" />
                </td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={Boolean(stage.is_closed)} onChange={(e) => updateStage(idx, 'is_closed', e.target.checked ? 1 : 0)} />
                </td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={Boolean(stage.is_won)} onChange={(e) => updateStage(idx, 'is_won', e.target.checked ? 1 : 0)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button onClick={addStage} className="px-3 py-2 rounded bg-slate-800 text-slate-200 text-sm hover:bg-slate-700">Add Stage</button>
        <button onClick={saveStages} className="px-3 py-2 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-600">Save Stages</button>
      </div>
    </div>
  );
}
