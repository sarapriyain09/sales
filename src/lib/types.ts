export type UserRole = 'admin' | 'user';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'disqualified' | 'rejected';
export type LeadStage =
  | 'prospect'
  | 'lead'
  | 'contacted'
  | 'discovery'
  | 'proposal'
  | 'meeting_scheduled'
  | 'requirements'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'lost';
export type LeadSource =
  | 'companies_house'
  | 'upwork'
  | 'manual'
  | 'website'
  | 'whatsapp'
  | 'linkedin'
  | 'referral'
  | 'google'
  | 'other';
export type LeadVertical =
  | 'crm'
  | 'ai_automation'
  | 'iot'
  | 'engineering'
  | 'digital'
  | 'software';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Lead {
  id: number;
  lead_name: string | null;
  contact_person: string | null;
  industry: string | null;
  company_id: number | null;
  company_name: string;
  company_number: string | null;
  sic_code: string | null;
  sic_label: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  location: string | null;
  incorporated: string | null;
  postcode: string | null;
  status: LeadStatus;
  stage: LeadStage;
  source: LeadSource;
  score: number;
  lead_score: number;
  assigned_to: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  outreach_email: string | null;
  sms_sent_at: string | null;
  sms_message: string | null;
  created_by: number | null;
  tps_status: 'clean' | 'tps' | 'ctps' | 'tps_and_ctps' | 'unchecked' | null;
  tps_checked_at: string | null;
  vertical: LeadVertical | null;
  // Engineering scoring fields
  contact_name:        string | null;
  employee_count:      number | null;
  linkedin_url:        string | null;
  eng_sector:          string | null;
  linkedin_hiring:     string | null;
  decision_maker_role: string | null;
  growth_signal:       string | null;
  linkedin_engagement: string | null;
  eng_score:           number | null;
  eng_grade:           string | null;
  next_followup_date:  string | null;
  opportunity_value:   number | null;
  interest_level:      string | null;
  // Upwork tracking fields
  upwork_client_name:   string | null;
  upwork_company:       string | null;
  upwork_project_title: string | null;
  upwork_project_url:   string | null;
  upwork_budget:        string | null;
  upwork_proposal_date: string | null;
  upwork_proposal_status: string | null;
}

export interface Company {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  source: string;
  employee_count: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  lead_id: number;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  industry: string | null;
  country: string | null;
  status: string;
  lead_score: number;
  campaign_id: number | null;
  is_primary: boolean | number;
  created_at: string;
}

export interface Campaign {
  id: number;
  campaign_name: string;
  target_industry: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  focus_service: string | null;
  services_json: string | null;
  objective: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  contact_id: number | null;
  lead_id: number | null;
  campaign_id: number | null;
  activity_type: string;
  date: string;
  notes: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface ContentPost {
  id: number;
  title: string;
  post_content: string;
  platform: 'linkedin' | 'facebook' | 'instagram' | 'x' | 'blog' | 'email';
  content_type: 'post' | 'blog' | 'email';
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  campaign_id: number | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  lead_id: number;
  user_id: number;
  body: string;
  content: string | null;
  user_name: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  lead_id: number | null;
  user_id: number;
  title: string;
  due_at: string | null;
  done: boolean | number;
  created_at: string;
}

export interface Quote {
  id: number;
  quote_number: string;
  lead_id: number | null;
  customer: string | null;
  customer_name: string | null;
  address: string | null;
  email: string | null;
  status: QuoteStatus;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  terms: string | null;
  notes: string | null;
  expires_at: string | null;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: number;
  quote_id: number;
  product?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax?: number;
  total?: number;
  vat_rate: number;
}

export type QuoteDetail = Quote & {
  items: QuoteItem[];
};

export interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: number;
  pipeline_id: number;
  name: string;
  sort_order: number;
  is_closed: number;
  is_won: number;
  default_probability: number;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: number;
  opportunity_name: string;
  company_id: number | null;
  contact_id: number | null;
  lead_id: number | null;
  pipeline_id: number | null;
  stage_id: number | null;
  estimated_value: number;
  probability: number;
  expected_close_date: string | null;
  assigned_user: number | null;
  status: 'open' | 'won' | 'lost';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: number;
  lead_id: number | null;
  opportunity_id: number | null;
  contact_id: number | null;
  follow_up_date: string;
  follow_up_type: 'Call' | 'Meeting' | 'Email' | 'WhatsApp' | string;
  reminder_at: string | null;
  assigned_user: number | null;
  comments: string | null;
  status: 'pending' | 'done' | string;
  task_id: number | null;
  created_at: string;
  updated_at: string;
}

export const PIPELINE_STAGES: { key: LeadStage; label: string }[] = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'lead', label: 'Lead' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

export const LEAD_VERTICALS: { key: LeadVertical; label: string; color: string }[] = [
  { key: 'crm',          label: 'CRM',           color: 'amber'   },
  { key: 'ai_automation',label: 'AI Automation', color: 'fuchsia' },
  { key: 'iot',          label: 'IoT',           color: 'cyan'    },
  { key: 'engineering',  label: 'Engineering',  color: 'blue'    },
  { key: 'digital',      label: 'Digital',      color: 'violet'  },
  { key: 'software',     label: 'Software',     color: 'emerald' },
];

export const LEAD_SOURCES: { key: LeadSource; label: string }[] = [
  { key: 'companies_house', label: 'Companies House' },
  { key: 'upwork', label: 'Upwork' },
  { key: 'manual', label: 'Manual' },
  { key: 'website', label: 'Website' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'referral', label: 'Referral' },
  { key: 'google', label: 'Google' },
  { key: 'other', label: 'Other' },
];

export const PRODUCTS: string[] = [
  'Web Design',
  'Web Development',
  'SEO',
  'Social Media Marketing',
  'Email Marketing',
  'Content Writing',
  'Graphic Design',
  'Logo Design',
  'Branding',
  'Consulting',
];
