import { queryAll, queryOne, runStatement } from '@/lib/db-client';

// ── Environment ──────────────────────────────────────────────────────────────
export const LI_CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID     ?? '';
export const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? '';
export const LI_REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI  ?? '';
export const LI_SCOPES        = ['r_ads', 'r_ads_reporting'];

// ── OAuth helpers ────────────────────────────────────────────────────────────
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     LI_CLIENT_ID,
    redirect_uri:  LI_REDIRECT_URI,
    state,
    scope:         LI_SCOPES.join(' '),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  expires_in:   number;
  scope:        string;
}> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  LI_REDIRECT_URI,
      client_id:     LI_CLIENT_ID,
      client_secret: LI_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description ?? `LinkedIn token error ${res.status}`);
  }
  return res.json();
}

// ── Token storage ────────────────────────────────────────────────────────────
export async function saveToken(userId: number, token: { access_token: string; expires_in: number; scope: string }) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  // one token per user — replace
  await runStatement('DELETE FROM linkedin_tokens WHERE user_id = ?', [userId]);
  await runStatement(`
    INSERT INTO linkedin_tokens (user_id, access_token, expires_at, scope)
    VALUES (?, ?, ?, ?)
  `, [userId, token.access_token, expiresAt, token.scope]);
}

export async function getToken(userId: number): Promise<{ access_token: string; expires_at: string } | null> {
  const row = await queryOne<{ access_token: string; expires_at: string }>('SELECT access_token, expires_at FROM linkedin_tokens WHERE user_id = ?', [userId]);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null; // expired
  return row;
}

export async function deleteToken(userId: number) {
  await runStatement('DELETE FROM linkedin_tokens WHERE user_id = ?', [userId]);
}

export async function hasToken(userId: number): Promise<boolean> {
  const row = await queryOne<{ expires_at: string }>('SELECT expires_at FROM linkedin_tokens WHERE user_id = ?', [userId]);
  if (!row) return false;
  return new Date(row.expires_at) > new Date();
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function liGet(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`https://api.linkedin.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `LinkedIn API error ${res.status}: ${path}`);
  }
  return res.json();
}

// ── Ad Accounts ───────────────────────────────────────────────────────────────
export interface AdAccount {
  id:    string;
  name:  string;
  type:  string;
  status: string;
}

export async function listAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const data = await liGet(
    '/v2/adAccountsV2?q=search&search.type.values[0]=BUSINESS&search.status.values[0]=ACTIVE&count=50',
    accessToken,
  ) as { elements?: Array<{ id: string; name: string; type: string; status: string }> };
  return (data.elements ?? []).map(a => ({
    id:     String(a.id),
    name:   a.name,
    type:   a.type,
    status: a.status,
  }));
}

// ── Lead Gen Forms ────────────────────────────────────────────────────────────
export interface LeadGenForm {
  id:     string;
  name:   string;
  status: string;
}

export async function listLeadGenForms(accessToken: string, accountId: string): Promise<LeadGenForm[]> {
  const urn = encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`);
  const data = await liGet(
    `/v2/leadGenerationForms?q=account&account=${urn}&count=50`,
    accessToken,
  ) as { elements?: Array<{ id: string; name?: string; localizedName?: string; status: string }> };
  return (data.elements ?? []).map(f => ({
    id:     String(f.id),
    name:   f.localizedName ?? f.name ?? f.id,
    status: f.status,
  }));
}

// ── Form Responses ────────────────────────────────────────────────────────────
export interface FormResponseAnswer {
  questionId:    string;
  questionType:  string;
  localizedQuestion?: string;
  answer:        { text?: string; localizedText?: string };
}

export interface FormResponse {
  id:              string;
  submittedAt:     number; // unix ms
  formId:          string;
  formName:        string;
  firstName?:      string;
  lastName?:       string;
  email?:          string;
  phone?:          string;
  company?:        string;
  jobTitle?:       string;
  answers:         FormResponseAnswer[];
}

export async function listFormResponses(
  accessToken: string,
  accountId:   string,
): Promise<FormResponse[]> {
  const urn = encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`);
  const data = await liGet(
    `/v2/leadGenerationFormResponses?q=owner&owner=${urn}&count=100` +
    `&fields=id,submittedAt,localizedFormName,formResponse,workEmail,localizedFirstName,localizedLastName,localizedCompanyName,localizedJobTitle,localizedPhoneNumber`,
    accessToken,
  ) as {
    elements?: Array<{
      id:                   string;
      submittedAt:          number;
      localizedFormName?:   string;
      workEmail?:           string;
      localizedFirstName?:  string;
      localizedLastName?:   string;
      localizedCompanyName?: string;
      localizedJobTitle?:   string;
      localizedPhoneNumber?: string;
      formResponse?: {
        leadGenerationForm?: string;
        answers?: FormResponseAnswer[];
      };
    }>;
  };

  return (data.elements ?? []).map(r => {
    const formUrn = r.formResponse?.leadGenerationForm ?? '';
    const formId  = formUrn.split(':').pop() ?? '';
    return {
      id:          r.id,
      submittedAt: r.submittedAt,
      formId,
      formName:    r.localizedFormName ?? '',
      firstName:   r.localizedFirstName,
      lastName:    r.localizedLastName,
      email:       r.workEmail,
      phone:       r.localizedPhoneNumber,
      company:     r.localizedCompanyName,
      jobTitle:    r.localizedJobTitle,
      answers:     r.formResponse?.answers ?? [],
    };
  });
}

// ── Already-imported tracking ─────────────────────────────────────────────────
export async function getImportedIds(): Promise<Set<string>> {
  const rows = await queryAll('SELECT form_response_id FROM linkedin_imported') as { form_response_id: string }[];
  return new Set(rows.map(r => r.form_response_id));
}

export async function markImported(formResponseId: string, leadId: number) {
  await runStatement(
    'INSERT OR IGNORE INTO linkedin_imported (form_response_id, lead_id) VALUES (?, ?)',
    [formResponseId, leadId],
  );
}
