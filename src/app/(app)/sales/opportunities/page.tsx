'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

type Stage = { id: number; name: string; sort_order: number; is_closed: number; is_won: number; default_probability: number };
type Opportunity = {
  id: number;
  opportunity_name: string;
  stage_id: number | null;
  stage_name?: string;
  company_name?: string | null;
  contact_name?: string | null;
  estimated_value: number;
  probability: number;
  expected_close_date?: string | null;
  status: string;
};

function money(value: number) {
  return `GBP ${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

function stageColor(stage: Stage) {
  if (stage.is_won) return 'border-emerald-500';
  if (stage.is_closed) return 'border-red-500';
  return 'border-blue-500';
}

export default function OpportunitiesPage() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newValue, setNewValue] = useState('0');
  const [newProbability, setNewProbability] = useState('20');
  const [newCloseDate, setNewCloseDate] = useState('');

  const [followUpOpportunityId, setFollowUpOpportunityId] = useState<number | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpType, setFollowUpType] = useState('Call');
  const [followUpComment, setFollowUpComment] = useState('');

  async function loadPipelineAndStages() {
    const pipelinesRes = await fetch('/api/sales/pipelines');
    const pipelines = await pipelinesRes.json() as Array<{ id: number }>;
    const selectedPipelineId = pipelines[0]?.id ?? null;
    setPipelineId(selectedPipelineId);

    if (selectedPipelineId) {
      const stagesRes = await fetch(`/api/sales/pipelines/${selectedPipelineId}/stages`);
      const stagesData = await stagesRes.json();
      setStages(Array.isArray(stagesData) ? stagesData : []);
    }
  }

  async function loadOpportunities() {
    const res = await fetch('/api/sales/opportunities');
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadPipelineAndStages().then(loadOpportunities);
  }, []);

  const grouped = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      items: items.filter((item) => item.stage_id === stage.id),
    }));
  }, [stages, items]);

  async function onDragEnd(event: DragEndEvent) {
    const activeId = Number(event.active.id);
    const overId = event.over?.id;
    if (!overId) return;

    const targetStageId = Number(String(overId).replace('stage-', ''));
    if (!Number.isFinite(activeId) || !Number.isFinite(targetStageId)) return;

    setItems((prev) => prev.map((item) => (item.id === activeId ? { ...item, stage_id: targetStageId } : item)));

    await fetch(`/api/sales/opportunities/${activeId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: targetStageId }),
    });

    await loadOpportunities();
  }

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const firstStageId = stages[0]?.id ?? null;

    const res = await fetch('/api/sales/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opportunity_name: newName,
        company_id: newCompanyId ? Number(newCompanyId) : null,
        pipeline_id: pipelineId,
        stage_id: firstStageId,
        estimated_value: Number(newValue || 0),
        probability: Number(newProbability || 0),
        expected_close_date: newCloseDate || null,
      }),
    });

    if (res.ok) {
      setNewName('');
      setNewCompanyId('');
      setNewValue('0');
      setNewProbability('20');
      setNewCloseDate('');
      await loadOpportunities();
    }
  }

  async function addFollowUp() {
    if (!followUpOpportunityId || !followUpDate) return;

    const target = items.find((item) => item.id === followUpOpportunityId);
    await fetch('/api/sales/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opportunity_id: followUpOpportunityId,
        follow_up_date: followUpDate,
        follow_up_type: followUpType,
        comments: followUpComment,
      }),
    });

    setFollowUpOpportunityId(null);
    setFollowUpDate('');
    setFollowUpType('Call');
    setFollowUpComment('');

    if (target) {
      alert(`Follow-up added for ${target.opportunity_name}`);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Opportunities</h1>
        <p className="text-sm text-slate-500">Configurable pipeline with drag-and-drop Kanban.</p>
      </div>

      <form onSubmit={createOpportunity} className="bg-slate-900 border border-slate-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Opportunity name" className="md:col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" required />
        <input value={newCompanyId} onChange={(e) => setNewCompanyId(e.target.value)} placeholder="Company ID" className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
        <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Estimated value" type="number" className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
        <input value={newProbability} onChange={(e) => setNewProbability(e.target.value)} placeholder="Probability %" type="number" className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
        <div className="flex gap-2">
          <input value={newCloseDate} onChange={(e) => setNewCloseDate(e.target.value)} type="date" className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
          <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500">Add</button>
        </div>
      </form>

      {loading && <div className="text-sm text-slate-500">Loading opportunities...</div>}

      {!loading && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="overflow-x-auto pb-3">
            <div className="flex gap-3 min-w-[1000px]">
              {grouped.map(({ stage, items: stageItems }) => (
                <div
                  key={stage.id}
                  id={`stage-${stage.id}`}
                  className={`w-64 flex-shrink-0 bg-slate-900 border-t-2 ${stageColor(stage)} rounded-xl p-3`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-semibold text-slate-200">{stage.name}</div>
                    <div className="text-xs text-slate-400">{stageItems.length}</div>
                  </div>

                  <div className="space-y-2 min-h-[120px]" id={`stage-${stage.id}`}>
                    {stageItems.map((item) => (
                      <div
                        key={item.id}
                        id={String(item.id)}
                        className="bg-slate-800 border border-slate-700 rounded-lg p-2 cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData('text/plain', String(item.id));
                        }}
                        onDragOver={(ev) => ev.preventDefault()}
                        onDrop={async (ev) => {
                          ev.preventDefault();
                          const draggedId = Number(ev.dataTransfer.getData('text/plain'));
                          if (!Number.isFinite(draggedId)) return;
                          await fetch(`/api/sales/opportunities/${draggedId}/stage`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ stage_id: stage.id }),
                          });
                          await loadOpportunities();
                        }}
                      >
                        <div className="text-sm text-slate-100 font-medium">{item.opportunity_name}</div>
                        <div className="text-xs text-slate-400">{item.company_name ?? 'No company'}</div>
                        <div className="text-xs text-slate-500 mt-1">{money(Number(item.estimated_value || 0))} • {item.probability}%</div>
                        <button
                          onClick={() => setFollowUpOpportunityId(item.id)}
                          className="mt-2 px-2 py-1 rounded bg-slate-700 text-xs text-slate-200 hover:bg-slate-600"
                        >
                          Add Follow-up
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DndContext>
      )}

      {followUpOpportunityId && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-300">New follow-up</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
            <select value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200">
              <option value="Call">Call</option>
              <option value="Meeting">Meeting</option>
              <option value="Email">Email</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
            <input value={followUpComment} onChange={(e) => setFollowUpComment(e.target.value)} placeholder="Comments" className="md:col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200" />
          </div>
          <div className="flex gap-2">
            <button onClick={addFollowUp} className="px-3 py-2 rounded bg-emerald-700 text-white text-sm hover:bg-emerald-600">Save follow-up</button>
            <button onClick={() => setFollowUpOpportunityId(null)} className="px-3 py-2 rounded bg-slate-800 text-slate-300 text-sm hover:bg-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
