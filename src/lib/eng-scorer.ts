// Engineering Services Lead Scoring — 100-point system
// Scores UK manufacturing companies for Velynxia Engineering Services (CAD/CAE/FEA/CFD)

export type EngSector =
  | 'machinery_automation'
  | 'special_purpose'
  | 'automotive'
  | 'aerospace'
  | 'industrial_equipment'
  | 'fabrication'
  | 'electronics'
  | 'other'
  | '';

export type LinkedInHiring =
  | 'design_engineer'
  | 'mechanical_engineer'
  | 'new_product_post'
  | 'team_active'
  | 'none';

export type DecisionMakerRole =
  | 'eng_manager'
  | 'design_manager'
  | 'tech_director'
  | 'md'
  | 'none';

export type GrowthSignal =
  | 'new_factory'
  | 'new_product'
  | 'contract_win'
  | 'expansion'
  | 'none';

export type LinkedInEngagement =
  | 'meeting'
  | 'replied'
  | 'accepted'
  | 'none';

export type EngGrade = 'A' | 'B' | 'C' | 'D';

export interface EngScoreInput {
  employee_count:      number | null;
  eng_sector:          EngSector | null;
  linkedin_hiring:     LinkedInHiring | null;
  decision_maker_role: DecisionMakerRole | null;
  growth_signal:       GrowthSignal | null;
  linkedin_engagement: LinkedInEngagement | null;
}

export interface EngScoreBreakdown {
  size:           number; // max 20
  sector:         number; // max 20
  hiring:         number; // max 20
  decision_maker: number; // max 15
  growth:         number; // max 15
  engagement:     number; // max 10
}

export interface EngScoreResult {
  total:     number;
  grade:     EngGrade;
  breakdown: EngScoreBreakdown;
}

function sizeScore(count: number | null): number {
  if (!count) return 0;
  if (count >= 10  && count <= 50)   return 20;
  if (count >= 51  && count <= 250)  return 15;
  if (count >= 251 && count <= 1000) return 10;
  return 5;
}

const SECTOR_SCORES: Record<string, number> = {
  machinery_automation: 20,
  special_purpose:      20,
  automotive:           18,
  aerospace:            18,
  industrial_equipment: 18,
  fabrication:          15,
  electronics:          12,
  other:                10,
};

const HIRING_SCORES: Record<string, number> = {
  design_engineer:     20,
  mechanical_engineer: 15,
  new_product_post:    15,
  team_active:         10,
  none:                0,
};

const DECISION_MAKER_SCORES: Record<string, number> = {
  eng_manager:    15,
  design_manager: 15,
  tech_director:  12,
  md:             10,
  none:           0,
};

const GROWTH_SCORES: Record<string, number> = {
  new_factory:  15,
  new_product:  15,
  contract_win: 10,
  expansion:    10,
  none:         0,
};

const ENGAGEMENT_SCORES: Record<string, number> = {
  meeting:  10,
  replied:  10,
  accepted: 10,
  none:     0,
};

export function computeEngScore(input: EngScoreInput): EngScoreResult {
  const size       = sizeScore(input.employee_count);
  const sector     = SECTOR_SCORES[input.eng_sector      ?? '']     ?? 0;
  const hiring     = HIRING_SCORES[input.linkedin_hiring  ?? 'none'] ?? 0;
  const decision   = DECISION_MAKER_SCORES[input.decision_maker_role ?? 'none'] ?? 0;
  const growth     = GROWTH_SCORES[input.growth_signal    ?? 'none'] ?? 0;
  const engagement = ENGAGEMENT_SCORES[input.linkedin_engagement ?? 'none'] ?? 0;

  const total = size + sector + hiring + decision + growth + engagement;
  const grade: EngGrade =
    total >= 80 ? 'A' :
    total >= 60 ? 'B' :
    total >= 40 ? 'C' : 'D';

  return {
    total,
    grade,
    breakdown: { size, sector, hiring, decision_maker: decision, growth, engagement },
  };
}

export function engGradeColor(grade: EngGrade): string {
  if (grade === 'A') return 'text-red-400';
  if (grade === 'B') return 'text-amber-400';
  if (grade === 'C') return 'text-blue-400';
  return 'text-slate-500';
}

export function engGradeBorderColor(grade: EngGrade): string {
  if (grade === 'A') return 'border-red-800';
  if (grade === 'B') return 'border-amber-800';
  if (grade === 'C') return 'border-blue-800';
  return 'border-slate-800';
}

export function engGradeAction(grade: EngGrade): string {
  if (grade === 'A') return 'Call Immediately';
  if (grade === 'B') return 'LinkedIn + Email';
  if (grade === 'C') return 'Nurture';
  return 'Low Priority';
}
