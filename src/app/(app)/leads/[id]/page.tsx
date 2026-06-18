'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Lead, Contact, Note, Task, Quote } from '@/lib/types';
import { PIPELINE_STAGES, LEAD_SOURCES, LEAD_VERTICALS } from '@/lib/types';
import {
  computeEngScore,
  engGradeColor, engGradeBorderColor, engGradeAction,
  type EngSector, type LinkedInHiring, type DecisionMakerRole,
  type GrowthSignal, type LinkedInEngagement,
} from '@/lib/eng-scorer';

interface LeadDetail { lead: Lead; contacts: Contact[]; notes: Note[]; tasks: Task[]; quotes: Quote[]; }

// ─── Engineering Score helpers ───────────────────────────────────────────────
function ScoreSection({
  title, maxPts, earned, hint, children,
}: { title: string; maxPts: number; earned: number; hint: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <span className={`text-sm font-bold ${earned > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
          {earned}/{maxPts} pts
        </span>
      </div>
      <p className="text-[11px] text-slate-500 italic">{hint}</p>
      {children}
    </div>
  );
}

function RadioGroup({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; pts: number }>;
}) {
  return (
    <div className="space-y-1.5">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
            value === opt.value
              ? 'bg-blue-900/50 border border-blue-700 text-blue-200'
              : 'bg-slate-800 border border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
          }`}>
          <span>{opt.label}</span>
          <span className={`text-xs font-semibold ml-2 shrink-0 ${opt.pts > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
            +{opt.pts}
          </span>
        </button>
      ))}
    </div>
  );
}

function ScoreTab({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [employeeCount,  setEmployeeCount]  = useState<number | null>(lead.employee_count ?? null);
  const [linkedinUrl,    setLinkedinUrl]    = useState<string>(lead.linkedin_url ?? '');
  const [engSector,      setEngSector]      = useState<EngSector>((lead.eng_sector ?? '') as EngSector);
  const [linkedinHiring, setLinkedinHiring] = useState<LinkedInHiring>((lead.linkedin_hiring ?? 'none') as LinkedInHiring);
  const [decisionMaker,  setDecisionMaker]  = useState<DecisionMakerRole>((lead.decision_maker_role ?? 'none') as DecisionMakerRole);
  const [growthSignal,   setGrowthSignal]   = useState<GrowthSignal>((lead.growth_signal ?? 'none') as GrowthSignal);
  const [engagement,     setEngagement]     = useState<LinkedInEngagement>((lead.linkedin_engagement ?? 'none') as LinkedInEngagement);
  const [nextFollowup,   setNextFollowup]   = useState<string>(lead.next_followup_date ?? '');
  const [oppValue,       setOppValue]       = useState<string>(lead.opportunity_value != null ? String(lead.opportunity_value) : '');
  const [interestLevel,  setInterestLevel]  = useState<string>(lead.interest_level ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const result = computeEngScore({
    employee_count:      employeeCount,
    eng_sector:          engSector,
    linkedin_hiring:     linkedinHiring,
    decision_maker_role: decisionMaker,
    growth_signal:       growthSignal,
    linkedin_engagement: engagement,
  });

  const liCompany = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(lead.company_name)}`;
  const liPeople  = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Engineering Manager ' + lead.company_name)}`;

  async function save() {
    setSaving(true);
    await fetch(`/api/leads/${lead.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_count:      employeeCount,
        linkedin_url:        linkedinUrl  || null,
        eng_sector:          engSector    || null,
        linkedin_hiring:     linkedinHiring,
        decision_maker_role: decisionMaker,
        growth_signal:       growthSignal,
        linkedin_engagement: engagement,
        eng_score:           result.total,
        eng_grade:           result.grade,
        next_followup_date:  nextFollowup || null,
        opportunity_value:   oppValue ? Number(oppValue) : null,
        interest_level:      interestLevel || null,
        lead_score:          result.total,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  const gc  = engGradeColor(result.grade);
  const gbc = engGradeBorderColor(result.grade);
  const ga  = engGradeAction(result.grade);

  return (
    <div className="space-y-4">
      {/* Research links */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Research — open these before scoring</h3>
        <div className="flex flex-wrap gap-2">
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noreferrer"
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors">
              🌐 Company Website
            </a>
          )}
          <a href={liCompany} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 hover:text-blue-300 rounded-lg transition-colors">
            LinkedIn Company Page →
          </a>
          <a href={liPeople} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 hover:text-blue-300 rounded-lg transition-colors">
            LinkedIn: Find Engineering Manager →
          </a>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 w-36 shrink-0">Company LinkedIn URL</span>
          <input type="url" placeholder="https://www.linkedin.com/company/…" value={linkedinUrl}
            onChange={e => setLinkedinUrl(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          {linkedinUrl && (
            <a href={linkedinUrl} target="_blank" rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 shrink-0">Open →</a>
          )}
        </div>
      </div>

      {/* Live score card */}
      <div className={`bg-slate-900 border ${gbc} rounded-xl p-5 flex items-center justify-between gap-4`}>
        <div>
          <div className={`text-5xl font-bold ${gc}`}>
            {result.total}<span className="text-xl text-slate-500 ml-1">/100</span>
          </div>
          <div className={`text-sm font-semibold mt-1 ${gc}`}>
            Grade {result.grade}
            <span className="text-xs text-slate-400 font-normal ml-2">— {ga}</span>
          </div>
        </div>
        <div className="text-right space-y-1 text-xs text-slate-500 shrink-0">
          <div>Size <span className="text-slate-300 font-medium">{result.breakdown.size}/20</span></div>
          <div>Sector <span className="text-slate-300 font-medium">{result.breakdown.sector}/20</span></div>
          <div>Hiring <span className="text-slate-300 font-medium">{result.breakdown.hiring}/20</span></div>
          <div>Decision Maker <span className="text-slate-300 font-medium">{result.breakdown.decision_maker}/15</span></div>
          <div>Growth <span className="text-slate-300 font-medium">{result.breakdown.growth}/15</span></div>
          <div>Engagement <span className="text-slate-300 font-medium">{result.breakdown.engagement}/10</span></div>
        </div>
      </div>

      {/* 1. Company Size */}
      <ScoreSection title="1. Company Size" maxPts={20} earned={result.breakdown.size}
        hint="Check LinkedIn company page or About page on their website. SMEs (10–250) outsource most often.">
        <div className="flex items-center gap-3 flex-wrap">
          <input type="number" min="1" max="99999" placeholder="e.g. 45"
            value={employeeCount ?? ''}
            onChange={e => setEmployeeCount(e.target.value ? Number(e.target.value) : null)}
            className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-slate-500">employees</span>
          <span className="text-xs text-emerald-400 font-medium">
            {!employeeCount ? '' :
              employeeCount < 10   ? 'Below threshold → 0 pts' :
              employeeCount <= 50  ? '10–50 → 20 pts ✓' :
              employeeCount <= 250 ? '51–250 → 15 pts ✓' :
              employeeCount <= 1000? '251–1000 → 10 pts' : '>1000 → 5 pts'}
          </span>
        </div>
      </ScoreSection>

      {/* 2. Sector */}
      <ScoreSection title="2. Manufacturing Sector" maxPts={20} earned={result.breakdown.sector}
        hint="Check Companies House SIC code and the company website / LinkedIn description.">
        <RadioGroup value={engSector} onChange={v => setEngSector(v as EngSector)} options={[
          { value: 'machinery_automation', label: 'Machinery / Automation',        pts: 20 },
          { value: 'special_purpose',      label: 'Special Purpose Machines',      pts: 20 },
          { value: 'automotive',           label: 'Automotive Supplier',           pts: 18 },
          { value: 'aerospace',            label: 'Aerospace Supplier',            pts: 18 },
          { value: 'industrial_equipment', label: 'Industrial Equipment',          pts: 18 },
          { value: 'fabrication',          label: 'Sheet Metal / Fabrication',     pts: 15 },
          { value: 'electronics',          label: 'Electronics Manufacturing',     pts: 12 },
          { value: 'other',                label: 'Other Manufacturing',           pts: 10 },
        ]} />
      </ScoreSection>

      {/* 3. LinkedIn Activity */}
      <ScoreSection title="3. LinkedIn Engineering Activity" maxPts={20} earned={result.breakdown.hiring}
        hint="Open their LinkedIn company page → check the Jobs tab and recent posts for engineering activity.">
        <RadioGroup value={linkedinHiring} onChange={v => setLinkedinHiring(v as LinkedInHiring)} options={[
          { value: 'design_engineer',     label: 'Actively hiring Design Engineers',      pts: 20 },
          { value: 'mechanical_engineer', label: 'Actively hiring Mechanical Engineers',  pts: 15 },
          { value: 'new_product_post',    label: 'Posting New Product Launches',          pts: 15 },
          { value: 'team_active',         label: 'Engineering Team Posting / Active',     pts: 10 },
          { value: 'none',               label: 'No Engineering Activity visible',       pts:  0 },
        ]} />
      </ScoreSection>

      {/* 4. Decision Maker */}
      <ScoreSection title="4. Decision Maker Found" maxPts={15} earned={result.breakdown.decision_maker}
        hint="Use the LinkedIn search link above. Search for the company name + Engineering Manager / Technical Director.">
        <RadioGroup value={decisionMaker} onChange={v => setDecisionMaker(v as DecisionMakerRole)} options={[
          { value: 'eng_manager',    label: 'Engineering Manager found',  pts: 15 },
          { value: 'design_manager', label: 'Design Manager found',       pts: 15 },
          { value: 'tech_director',  label: 'Technical Director found',   pts: 12 },
          { value: 'md',            label: 'Managing Director found',    pts: 10 },
          { value: 'none',          label: 'No Decision Maker found',    pts:  0 },
        ]} />
      </ScoreSection>

      {/* 5. Growth */}
      <ScoreSection title="5. Growth Indicators" maxPts={15} earned={result.breakdown.growth}
        hint="Check website News/Press page, LinkedIn posts, and Google for recent announcements about this company.">
        <RadioGroup value={growthSignal} onChange={v => setGrowthSignal(v as GrowthSignal)} options={[
          { value: 'new_factory',  label: 'New Factory / New Site',                    pts: 15 },
          { value: 'new_product',  label: 'New Product Launch',                        pts: 15 },
          { value: 'contract_win', label: 'Recent Contract Win announced',             pts: 10 },
          { value: 'expansion',    label: 'Business Expansion (headcount/investment)', pts: 10 },
          { value: 'none',        label: 'No Growth Evidence found',                 pts:  0 },
        ]} />
      </ScoreSection>

      {/* 6. Engagement */}
      <ScoreSection title="6. LinkedIn Engagement" maxPts={10} earned={result.breakdown.engagement}
        hint="Update this after you send the LinkedIn connection request or message to the decision maker.">
        <RadioGroup value={engagement} onChange={v => setEngagement(v as LinkedInEngagement)} options={[
          { value: 'meeting',  label: 'Meeting / Discovery Call Booked',        pts: 10 },
          { value: 'replied',  label: 'Replied to LinkedIn message',            pts: 10 },
          { value: 'accepted', label: 'Accepted LinkedIn connection request',   pts: 10 },
          { value: 'none',    label: 'No response / Not yet contacted',        pts:  0 },
        ]} />
      </ScoreSection>

      {/* CRM fields */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">CRM Fields</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Next Follow-up Date</label>
            <input type="date" value={nextFollowup} onChange={e => setNextFollowup(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Opportunity Value (£)</label>
            <input type="number" min="0" placeholder="e.g. 5000" value={oppValue}
              onChange={e => setOppValue(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs text-slate-500">Interest Level</label>
            <select value={interestLevel} onChange={e => setInterestLevel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              <option value="">— Not set —</option>
              <option value="high">High — Actively looking for engineering support</option>
              <option value="medium">Medium — Open to conversation</option>
              <option value="low">Low — Not interested yet</option>
              <option value="unknown">Unknown — Not yet contacted</option>
            </select>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors">
        {saving ? 'Saving…' : saved ? '✓ Saved — Score & Lead Updated' : 'Save Score & Update Lead'}
      </button>
    </div>
  );
}

function DirectorsCard({ companyNumber, companyName }: { companyNumber: string; companyName: string }) {
  const [officers, setOfficers] = useState<{ name: string; officer_role: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (officers !== null) return;
    setLoading(true);
    const res = await fetch(`/api/ch/officers?company_number=${companyNumber}`);
    if (res.ok) { const d = await res.json(); setOfficers(d.items ?? []); }
    setLoading(false);
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Directors</h3>
        {!officers && (
          <button onClick={load} disabled={loading}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            {loading ? 'Loading…' : 'Load from Companies House'}
          </button>
        )}
      </div>
      {officers && officers.length === 0 && (
        <p className="text-xs text-slate-600">No active directors found</p>
      )}
      {officers && officers.map((o, i) => {
        const liUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(o.name + ' ' + companyName)}`;
        return (
          <div key={i} className="flex items-center justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-slate-200">{o.name}</span>
              <span className="ml-2 text-xs text-slate-500">{o.officer_role}</span>
            </div>
            <a href={liUrl} target="_blank" rel="noreferrer"
              className="flex-shrink-0 text-xs px-2 py-1 bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 hover:text-blue-300 rounded transition-colors font-medium">
              Search LinkedIn →
            </a>
          </div>
        );
      })}
    </div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  lead:'bg-slate-800 text-slate-300', contacted:'bg-blue-900 text-blue-300',
  meeting_scheduled:'bg-violet-900 text-violet-300', requirements:'bg-amber-900 text-amber-300',
  proposal_sent:'bg-orange-900 text-orange-300', negotiation:'bg-rose-900 text-rose-300',
  won:'bg-emerald-900 text-emerald-300', lost:'bg-red-900 text-red-300',
};

const VERTICAL_BADGE: Record<string, string> = {
  crm:          'bg-amber-900 text-amber-300',
  ai_automation:'bg-fuchsia-900 text-fuchsia-300',
  iot:          'bg-cyan-900 text-cyan-300',
  engineering:  'bg-blue-900 text-blue-300',
  automation:   'bg-fuchsia-900 text-fuchsia-300',
  software:     'bg-emerald-900 text-emerald-300',
  digital:      'bg-violet-900 text-violet-300',
  general:      'bg-slate-800 text-slate-400',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<LeadDetail | null>(null);
  const [tab, setTab] = useState<'overview'|'contacts'|'notes'|'tasks'|'quotes'|'score'>('overview');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newContact, setNewContact] = useState({ name:'', role:'', email:'', phone:'', linkedin:'' });
  const [addingContact, setAddingContact] = useState(false);
  const [newTask, setNewTask] = useState({ title:'', due_date:'' });

  const load = useCallback(async () => {
    const res = await fetch(`/api/leads/${id}`);
    if (!res.ok) { router.push('/leads'); return; }
    setData(await res.json());
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function updateStage(stage: string) {
    await fetch(`/api/leads/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ stage }) });
    load();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    await fetch(`/api/leads/${id}/notes`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: noteText }) });
    setNoteText('');
    setSavingNote(false);
    load();
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContact.name.trim()) return;
    setAddingContact(true);
    await fetch(`/api/leads/${id}/contacts`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newContact) });
    setNewContact({ name:'', role:'', email:'', phone:'', linkedin:'' });
    setAddingContact(false);
    load();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...newTask, lead_id: id }) });
    setNewTask({ title:'', due_date:'' });
    load();
  }

  async function toggleTask(taskId: number, done: number) {
    await fetch(`/api/tasks/${taskId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ done: done ? 0 : 1 }) });
    load();
  }

  async function disqualifyLead() {
    if (!confirm('Mark this lead as disqualified (Lost)? You can reopen it later by changing the stage.')) return;
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'lost', status: 'rejected' }),
    });
    load();
  }

  async function deleteLead() {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    await fetch(`/api/leads/${id}`, { method:'DELETE' });
    router.push('/leads');
  }

  if (!data) return <div className="p-12 text-center text-slate-500 animate-pulse">Loading…</div>;
  const { lead, contacts, notes, tasks, quotes } = data;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/leads" className="hover:text-slate-300">Leads</Link>
            <span>/</span>
            <span>{lead.company_name}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{lead.company_name}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[lead.stage] ?? 'bg-slate-800 text-slate-400'}`}>
              {PIPELINE_STAGES.find(s => s.key === lead.stage)?.label ?? lead.stage}
            </span>
            {(() => {
              const v = LEAD_VERTICALS.find(v => v.key === (lead.vertical ?? 'general'));
              return (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${VERTICAL_BADGE[lead.vertical ?? 'general'] ?? VERTICAL_BADGE['general']}`}>
                  {v?.label ?? 'General'}
                </span>
              );
            })()}
            {lead.location && <span className="text-xs text-slate-400">{lead.location}</span>}
            {lead.incorporated && <span className="text-xs text-slate-500">Est. {lead.incorporated}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/quotes/new?lead_id=${lead.id}&customer=${encodeURIComponent(lead.company_name)}`}
            className="px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
            + Quote
          </Link>
          {lead.stage !== 'lost' && lead.status !== 'rejected' && (
            <button onClick={disqualifyLead} className="px-3 py-2 bg-slate-800 hover:bg-orange-900 text-slate-400 hover:text-orange-300 text-sm rounded-lg transition-colors">
              ✕ Disqualify
            </button>
          )}
          <button onClick={deleteLead} className="px-3 py-2 bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-300 text-sm rounded-lg transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex gap-1 flex-wrap">
          {PIPELINE_STAGES.map((s, i) => (
            <button key={s.key} onClick={() => updateStage(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                lead.stage === s.key ? `${STAGE_COLORS[s.key]} ring-1 ring-current` : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}>
              {i > 0 && <span className="mr-1 opacity-40">→</span>}{s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="flex gap-0.5">
          {(['overview','contacts','notes','tasks','quotes','score'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {t === 'score' ? 'Eng Score' : t}
              {t === 'notes'    && notes.length    > 0 && <span className="ml-1.5 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{notes.length}</span>}
              {t === 'contacts' && contacts.length > 0 && <span className="ml-1.5 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{contacts.length}</span>}
              {t === 'tasks'    && tasks.filter(t=>!t.done).length > 0 && <span className="ml-1.5 text-xs bg-amber-800 text-amber-300 px-1.5 py-0.5 rounded">{tasks.filter(t=>!t.done).length}</span>}
              {t === 'quotes'   && quotes.length   > 0 && <span className="ml-1.5 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{quotes.length}</span>}
              {t === 'score' && lead.eng_grade && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded font-semibold ${
                  lead.eng_grade === 'A' ? 'bg-red-900 text-red-300' :
                  lead.eng_grade === 'B' ? 'bg-amber-900 text-amber-300' :
                  lead.eng_grade === 'C' ? 'bg-blue-900 text-blue-300' : 'bg-slate-700 text-slate-400'
                }`}>{lead.eng_grade}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Company Info</h3>
            {[
              ['Company No.',  lead.company_number],
              ['SIC Code',     lead.sic_code ? `${lead.sic_code} — ${lead.sic_label ?? ''}` : null],
              ['Website',      lead.website],
              ['Phone',        lead.phone],
              ['Email',        lead.email],
              ['Location',     lead.location],
              ['Postcode',     lead.postcode],
              ['Incorporated', lead.incorporated],
              ['Value (£)',    lead.opportunity_value != null ? String(lead.opportunity_value) : null],
              ['Nature of Job',lead.interest_level],
              ['Source',       lead.source?.replace('_',' ')],
            ].map(([k,v]) => v ? (
              <div key={k as string} className="flex gap-2">
                <span className="text-xs text-slate-500 w-28 flex-shrink-0 pt-0.5">{k}</span>
                <span className="text-sm text-slate-200 break-all">
                  {k === 'Website' ? <a href={v as string} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">{v}</a> : v}
                </span>
              </div>
            ) : null)}
            {/* Vertical editor */}
            <div className="flex gap-2 pt-1">
              <span className="text-xs text-slate-500 w-28 flex-shrink-0 pt-1.5">Vertical</span>
              <select
                value={lead.vertical ?? 'general'}
                onChange={async e => {
                  await fetch(`/api/leads/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ vertical: e.target.value }) });
                  load();
                }}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {LEAD_VERTICALS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </div>
            {lead.notes && (
              <div className="pt-2 border-t border-slate-800/70">
                <div className="text-xs text-slate-500 mb-1">Detail of Work</div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap">{lead.notes}</div>
              </div>
            )}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Lead Score</h3>
            <div className={`text-5xl font-bold ${lead.lead_score >= 70 ? 'text-red-400' : lead.lead_score >= 50 ? 'text-amber-400' : 'text-slate-400'}`}>
              {lead.lead_score}
            </div>
            <div className="text-xs text-slate-500">
              {lead.lead_score >= 70 ? '🔴 HOT — Priority contact' : lead.lead_score >= 50 ? '🟡 WARM — Follow up soon' : lead.lead_score >= 30 ? '🔵 COOL — Monitor' : '⚫ COLD'}
            </div>
            {lead.company_number && (
              <a href={`https://find-and-update.company-information.service.gov.uk/company/${lead.company_number}`}
                target="_blank" rel="noreferrer"
                className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300">
                View on Companies House →
              </a>
            )}
          </div>
        </div>
        {lead.company_number && <DirectorsCard companyNumber={lead.company_number} companyName={lead.company_name} />}
        </>
      )}

      {tab === 'contacts' && (
        <div className="space-y-4">
          {contacts.map(c => (
            <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium text-slate-100">{c.name} {c.is_primary ? <span className="ml-1 text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">Primary</span> : null}</div>
                {c.role  && <div className="text-xs text-slate-400">{c.role}</div>}
                {c.email && <div className="text-xs text-slate-400"><a href={`mailto:${c.email}`} className="text-blue-400 hover:text-blue-300">{c.email}</a></div>}
                {c.phone && <div className="text-xs text-slate-400">{c.phone}</div>}
                {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">LinkedIn →</a>}
              </div>
              <button onClick={async () => { await fetch(`/api/leads/${id}/contacts?contact_id=${c.id}`, {method:'DELETE'}); load(); }}
                className="text-slate-600 hover:text-red-400 text-sm transition-colors">✕</button>
            </div>
          ))}
          <form onSubmit={addContact} className="bg-slate-900 border border-slate-700 border-dashed rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-medium text-slate-400">Add Contact</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { ph:'Name *',    key:'name'     },
                { ph:'Role',      key:'role'     },
                { ph:'Email',     key:'email'    },
                { ph:'Phone',     key:'phone'    },
                { ph:'LinkedIn URL', key:'linkedin', full:true },
              ].map(f => (
                <input key={f.key} type="text" placeholder={f.ph}
                  value={(newContact as Record<string,string>)[f.key]}
                  onChange={e => setNewContact(p => ({...p, [f.key]:e.target.value}))}
                  className={`bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 ${f.full ? 'col-span-2' : ''}`}
                />
              ))}
            </div>
            <button type="submit" disabled={addingContact || !newContact.name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors">
              Add Contact
            </button>
          </form>
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          <form onSubmit={addNote} className="flex gap-3">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button type="submit" disabled={savingNote || !noteText.trim()}
              className="px-4 py-2 h-fit bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors self-start">
              Save
            </button>
          </form>
          {notes.length === 0 && <p className="text-slate-600 text-sm text-center py-6">No notes yet.</p>}
          {notes.map(n => (
            <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-2">{n.user_name ?? 'System'} · {n.created_at.slice(0,16).replace('T',' ')}</div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="space-y-3">
          <form onSubmit={addTask} className="flex gap-3">
            <input type="text" placeholder="Task title…" value={newTask.title} onChange={e => setNewTask(p=>({...p,title:e.target.value}))}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            <input type="date" value={newTask.due_date} onChange={e => setNewTask(p=>({...p,due_date:e.target.value}))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
            <button type="submit" disabled={!newTask.title.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors">
              Add
            </button>
          </form>
          {tasks.length === 0 && <p className="text-slate-600 text-sm text-center py-6">No tasks yet.</p>}
          {tasks.map(t => (
            <div key={t.id} className={`flex items-center gap-3 bg-slate-900 border rounded-xl px-4 py-3 ${t.done ? 'border-slate-800 opacity-50' : 'border-slate-700'}`}>
              <button onClick={() => toggleTask(t.id, Number(t.done))}
                className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${t.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-600 hover:border-emerald-500'}`}>
                {t.done ? '✓' : ''}
              </button>
              <span className={`flex-1 text-sm ${t.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.title}</span>
              {t.due_at && <span className="text-xs text-slate-500">{t.due_at}</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'score' && (
        <ScoreTab lead={lead} onSaved={load} />
      )}

      {tab === 'quotes' && (
        <div className="space-y-3">
          <Link href={`/quotes/new?lead_id=${lead.id}&customer=${encodeURIComponent(lead.company_name)}`}
            className="inline-block px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
            + New Quote
          </Link>
          {quotes.length === 0 && <p className="text-slate-600 text-sm text-center py-6">No quotes yet.</p>}
          {quotes.map(q => (
            <Link key={q.id} href={`/quotes/${q.id}`}
              className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 hover:bg-slate-800 transition-colors">
              <div>
                <div className="font-medium text-slate-200">{q.quote_number}</div>
                <div className="text-xs text-slate-500">{q.created_at.slice(0,10)} · {q.status}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-slate-100">£{q.total.toLocaleString()}</div>
                <div className="text-xs text-slate-500">inc. VAT</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
