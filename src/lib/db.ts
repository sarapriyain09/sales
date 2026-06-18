import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = (process.env.CRM_DB_FILE || 'splendid-crm.db').trim();
const DB_PATH = path.join(DB_DIR, DB_FILE);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      role        TEXT    NOT NULL DEFAULT 'user',
      demo_verified INTEGER NOT NULL DEFAULT 1,
      demo_verify_token TEXT,
      demo_verify_expires TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id      INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      company_name    TEXT    NOT NULL,
      company_number  TEXT,
      sic_code        TEXT,
      sic_label       TEXT,
      website         TEXT,
      phone           TEXT,
      email           TEXT,
      source          TEXT    NOT NULL DEFAULT 'companies_house',
      lead_score      INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'new',
      stage           TEXT    NOT NULL DEFAULT 'lead',
      location        TEXT,
      postcode        TEXT,
      incorporated    TEXT,
      notes           TEXT,
      assigned_to     INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      website         TEXT,
      industry        TEXT,
      country         TEXT,
      source          TEXT    NOT NULL DEFAULT 'manual',
      employee_count  INTEGER,
      status          TEXT    NOT NULL DEFAULT 'prospect',
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, country)
    );

    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

    CREATE TABLE IF NOT EXISTS contacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      role       TEXT,
      email      TEXT,
      phone      TEXT,
      linkedin   TEXT,
      company    TEXT,
      job_title  TEXT,
      linkedin_url TEXT,
      industry   TEXT,
      country    TEXT,
      status     TEXT    NOT NULL DEFAULT 'Pending',
      lead_score INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_name    TEXT    NOT NULL,
      target_industry  TEXT,
      start_date       TEXT,
      end_date         TEXT,
      duration_days    INTEGER,
      focus_service    TEXT,
      services_json    TEXT,
      objective        TEXT,
      status           TEXT    NOT NULL DEFAULT 'draft',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id    INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      activity_type TEXT    NOT NULL,
      date          TEXT    NOT NULL DEFAULT (datetime('now')),
      notes         TEXT,
      metadata_json TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      post_content  TEXT    NOT NULL,
      platform      TEXT    NOT NULL,
      content_type  TEXT    NOT NULL DEFAULT 'post',
      status        TEXT    NOT NULL DEFAULT 'draft',
      campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      scheduled_for TEXT,
      published_at  TEXT,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
    CREATE INDEX IF NOT EXISTS idx_activities_campaign_id ON activities(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
    CREATE INDEX IF NOT EXISTS idx_content_posts_platform ON content_posts(platform);
    CREATE INDEX IF NOT EXISTS idx_content_posts_status ON content_posts(status);

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id),
      content    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id),
      title      TEXT    NOT NULL,
      due_date   TEXT,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
      quote_number TEXT    NOT NULL UNIQUE,
      status       TEXT    NOT NULL DEFAULT 'draft',
      customer     TEXT    NOT NULL,
      address      TEXT,
      email        TEXT,
      issue_date   TEXT    NOT NULL DEFAULT (datetime('now')),
      subtotal     REAL    NOT NULL DEFAULT 0,
      vat_rate     REAL    NOT NULL DEFAULT 20,
      vat_amount   REAL    NOT NULL DEFAULT 0,
      total        REAL    NOT NULL DEFAULT 0,
      total_amount REAL    NOT NULL DEFAULT 0,
      terms        TEXT    DEFAULT '30 days',
      notes        TEXT,
      expiry_date  TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product     TEXT,
      description TEXT    NOT NULL,
      quantity    REAL    NOT NULL DEFAULT 1,
      unit_price  REAL    NOT NULL DEFAULT 0,
      discount    REAL    NOT NULL DEFAULT 0,
      tax         REAL    NOT NULL DEFAULT 0,
      total       REAL    NOT NULL DEFAULT 0,
      amount      REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id     INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name            TEXT    NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 1,
      is_closed       INTEGER NOT NULL DEFAULT 0,
      is_won          INTEGER NOT NULL DEFAULT 0,
      default_probability INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(pipeline_id, name)
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_name    TEXT    NOT NULL,
      company_id          INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      contact_id          INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      lead_id             INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      pipeline_id         INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
      stage_id            INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
      estimated_value     REAL    NOT NULL DEFAULT 0,
      probability         INTEGER NOT NULL DEFAULT 0,
      expected_close_date TEXT,
      assigned_user       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status              TEXT    NOT NULL DEFAULT 'open',
      notes               TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      opportunity_id  INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
      contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      follow_up_date  TEXT    NOT NULL,
      follow_up_type  TEXT    NOT NULL,
      reminder_at     TEXT,
      assigned_user   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comments        TEXT,
      status          TEXT    NOT NULL DEFAULT 'pending',
      task_id         INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id          INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      opportunity_id   INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
      quote_id         INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
      to_email         TEXT    NOT NULL,
      subject          TEXT    NOT NULL,
      body             TEXT    NOT NULL,
      attachments_json TEXT,
      sent_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline_stage ON opportunities(pipeline_id, stage_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_company ON opportunities(company_id);
    CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON follow_ups(follow_up_date);
    CREATE INDEX IF NOT EXISTS idx_email_history_quote ON email_history(quote_id);

    CREATE TABLE IF NOT EXISTS linkedin_tokens (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_token  TEXT    NOT NULL,
      expires_at    TEXT    NOT NULL,
      scope         TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS linkedin_imported (
      form_response_id TEXT PRIMARY KEY,
      lead_id          INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      imported_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id      TEXT,
      lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      call_id       TEXT,
      summary       TEXT,
      action_type   TEXT    NOT NULL,
      action_title  TEXT    NOT NULL,
      payload_json  TEXT,
      status        TEXT    NOT NULL DEFAULT 'pending_review',
      source        TEXT    NOT NULL DEFAULT 'callcrm',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      reviewed_at   TEXT,
      executed_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS demo_registrations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      company        TEXT,
      phone          TEXT,
      verification_sent INTEGER NOT NULL DEFAULT 0,
      source_host    TEXT,
      ip_address     TEXT,
      user_agent     TEXT,
      created_user   INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outreach_templates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel     TEXT    NOT NULL,
      vertical    TEXT    NOT NULL,
      subject     TEXT,
      message     TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(channel, vertical)
    );

    CREATE TABLE IF NOT EXISTS campaign_playbook_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start  TEXT    NOT NULL UNIQUE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS morning_brief_mail_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      brief_date  TEXT    NOT NULL UNIQUE,
      sent_to     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations — safe to run on existing DBs
  const cols = db.prepare(`PRAGMA table_info(leads)`).all() as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('contacted_at')) {
    db.exec(`ALTER TABLE leads ADD COLUMN contacted_at TEXT`);
  }
  if (!colNames.includes('company_id')) {
    db.exec(`ALTER TABLE leads ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`);
  }
  if (!colNames.includes('outreach_email')) {
    db.exec(`ALTER TABLE leads ADD COLUMN outreach_email TEXT`);
  }
  if (!colNames.includes('sms_sent_at')) {
    db.exec(`ALTER TABLE leads ADD COLUMN sms_sent_at TEXT`);
  }
  if (!colNames.includes('sms_message')) {
    db.exec(`ALTER TABLE leads ADD COLUMN sms_message TEXT`);
  }
  if (!colNames.includes('created_by')) {
    db.exec(`ALTER TABLE leads ADD COLUMN created_by INTEGER REFERENCES users(id)`);
  }
  if (!colNames.includes('tps_status')) {
    db.exec(`ALTER TABLE leads ADD COLUMN tps_status TEXT`);
  }
  if (!colNames.includes('tps_checked_at')) {
    db.exec(`ALTER TABLE leads ADD COLUMN tps_checked_at TEXT`);
  }
  if (!colNames.includes('vertical')) {
    db.exec(`ALTER TABLE leads ADD COLUMN vertical TEXT NOT NULL DEFAULT 'general'`);
  }
  // Engineering scoring columns
  if (!colNames.includes('contact_name')) {
    db.exec(`ALTER TABLE leads ADD COLUMN contact_name TEXT`);
  }
  if (!colNames.includes('employee_count')) {
    db.exec(`ALTER TABLE leads ADD COLUMN employee_count INTEGER`);
  }
  if (!colNames.includes('linkedin_url')) {
    db.exec(`ALTER TABLE leads ADD COLUMN linkedin_url TEXT`);
  }
  if (!colNames.includes('eng_sector')) {
    db.exec(`ALTER TABLE leads ADD COLUMN eng_sector TEXT`);
  }
  if (!colNames.includes('linkedin_hiring')) {
    db.exec(`ALTER TABLE leads ADD COLUMN linkedin_hiring TEXT`);
  }
  if (!colNames.includes('decision_maker_role')) {
    db.exec(`ALTER TABLE leads ADD COLUMN decision_maker_role TEXT`);
  }
  if (!colNames.includes('growth_signal')) {
    db.exec(`ALTER TABLE leads ADD COLUMN growth_signal TEXT`);
  }
  if (!colNames.includes('linkedin_engagement')) {
    db.exec(`ALTER TABLE leads ADD COLUMN linkedin_engagement TEXT`);
  }
  if (!colNames.includes('eng_score')) {
    db.exec(`ALTER TABLE leads ADD COLUMN eng_score INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('eng_grade')) {
    db.exec(`ALTER TABLE leads ADD COLUMN eng_grade TEXT DEFAULT 'D'`);
  }
  if (!colNames.includes('next_followup_date')) {
    db.exec(`ALTER TABLE leads ADD COLUMN next_followup_date TEXT`);
  }
  if (!colNames.includes('opportunity_value')) {
    db.exec(`ALTER TABLE leads ADD COLUMN opportunity_value REAL`);
  }
  if (!colNames.includes('interest_level')) {
    db.exec(`ALTER TABLE leads ADD COLUMN interest_level TEXT`);
  }
  if (!colNames.includes('upwork_client_name')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_client_name TEXT`);
  }
  if (!colNames.includes('upwork_company')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_company TEXT`);
  }
  if (!colNames.includes('upwork_project_title')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_project_title TEXT`);
  }
  if (!colNames.includes('upwork_project_url')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_project_url TEXT`);
  }
  if (!colNames.includes('upwork_budget')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_budget TEXT`);
  }
  if (!colNames.includes('upwork_proposal_date')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_proposal_date TEXT`);
  }
  if (!colNames.includes('upwork_proposal_status')) {
    db.exec(`ALTER TABLE leads ADD COLUMN upwork_proposal_status TEXT`);
  }
  if (!colNames.includes('lead_name')) {
    db.exec(`ALTER TABLE leads ADD COLUMN lead_name TEXT`);
  }
  if (!colNames.includes('contact_person')) {
    db.exec(`ALTER TABLE leads ADD COLUMN contact_person TEXT`);
  }
  if (!colNames.includes('industry')) {
    db.exec(`ALTER TABLE leads ADD COLUMN industry TEXT`);
  }

  const opportunityCols = db.prepare(`PRAGMA table_info(opportunities)`).all() as { name: string }[];
  const opportunityColNames = opportunityCols.map(c => c.name);
  if (!opportunityColNames.includes('won_at')) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN won_at TEXT`);
  }

  // ── Vertical normalisation migration ─────────────────────────────────────
  // legacy values → current vertical taxonomy
  db.exec(`UPDATE leads SET vertical = 'iot' WHERE vertical = 'industry_4_0'`);
  db.exec(`UPDATE leads SET vertical = 'ai_automation' WHERE vertical = 'automation'`);
  // companies_house source → engineering (manufacturing prospects)
  db.exec(`UPDATE leads SET vertical = 'engineering' WHERE source = 'companies_house' AND (vertical IS NULL OR vertical IN ('general','engineering'))`);
  // accountant-targeted leads → digital
  db.exec(`UPDATE leads SET vertical = 'digital' WHERE (sic_label LIKE '%account%' OR notes LIKE '%accountant%') AND vertical NOT IN ('engineering','iot','software','digital','crm','ai_automation')`);
  // remaining general (web/website service leads) → digital
  db.exec(`UPDATE leads SET vertical = 'digital' WHERE vertical = 'general' OR vertical IS NULL`);
  // food / restaurant leads → digital (overrides any vertical including engineering)
  db.exec(`UPDATE leads SET vertical = 'digital' WHERE (
    sic_label LIKE '%restaurant%' OR sic_label LIKE '%food%' OR sic_label LIKE '%cater%' OR
    sic_label LIKE '%takeaway%'   OR sic_label LIKE '%cafe%'  OR sic_label LIKE '%pub%'  OR
    notes     LIKE '%restaurant%' OR notes     LIKE '%food%'  OR notes     LIKE '%cater%' OR
    company_name LIKE '%food%'    OR company_name LIKE '%foods%' OR company_name LIKE '%chilled%' OR
    company_name LIKE '%sausage%' OR company_name LIKE '%saladwork%'
  )`);
  // accountant leads → digital
  db.exec(`UPDATE leads SET vertical = 'digital' WHERE (
    company_name LIKE '%account%' OR company_name LIKE '%acca%' OR
    company_name LIKE '%chartered%' OR company_name LIKE '%bookkeep%' OR
    sic_label LIKE '%account%'
  ) AND vertical NOT IN ('iot','software','crm','ai_automation')`);
  // Finder V1 backfill: older V1 prospects were saved as engineering by default.
  // Keep V2/V3 engineering records intact by excluding V2's sector marker.
  db.exec(`UPDATE leads
    SET vertical = 'software'
    WHERE source = 'other'
      AND vertical = 'engineering'
      AND (notes IS NULL OR notes NOT LIKE '%sector (+20)%')`);
  // ─────────────────────────────────────────────────────────────────────────
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const userColNames = userCols.map(c => c.name);
  if (!userColNames.includes('phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  }
  if (!userColNames.includes('demo_verified')) {
    db.exec(`ALTER TABLE users ADD COLUMN demo_verified INTEGER NOT NULL DEFAULT 1`);
  }
  if (!userColNames.includes('demo_verify_token')) {
    db.exec(`ALTER TABLE users ADD COLUMN demo_verify_token TEXT`);
  }
  if (!userColNames.includes('demo_verify_expires')) {
    db.exec(`ALTER TABLE users ADD COLUMN demo_verify_expires TEXT`);
  }

  const demoRegCols = db.prepare(`PRAGMA table_info(demo_registrations)`).all() as { name: string }[];
  const demoRegColNames = demoRegCols.map(c => c.name);
  if (demoRegCols.length > 0 && !demoRegColNames.includes('verification_sent')) {
    db.exec(`ALTER TABLE demo_registrations ADD COLUMN verification_sent INTEGER NOT NULL DEFAULT 0`);
  }

  const contactCols = db.prepare(`PRAGMA table_info(contacts)`).all() as { name: string }[];
  const contactColNames = contactCols.map(c => c.name);
  if (!contactColNames.includes('company')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN company TEXT`);
  }
  if (!contactColNames.includes('job_title')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN job_title TEXT`);
  }
  if (!contactColNames.includes('linkedin_url')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN linkedin_url TEXT`);
  }
  if (!contactColNames.includes('industry')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN industry TEXT`);
  }
  if (!contactColNames.includes('country')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN country TEXT`);
  }
  if (!contactColNames.includes('status')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'`);
  }
  if (!contactColNames.includes('lead_score')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN lead_score INTEGER NOT NULL DEFAULT 0`);
  }
  if (!contactColNames.includes('campaign_id')) {
    db.exec(`ALTER TABLE contacts ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL`);
  }

  const campaignCols = db.prepare(`PRAGMA table_info(campaigns)`).all() as { name: string }[];
  const campaignColNames = campaignCols.map(c => c.name);
  if (campaignCols.length > 0 && !campaignColNames.includes('duration_days')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN duration_days INTEGER`);
  }
  if (campaignCols.length > 0 && !campaignColNames.includes('focus_service')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN focus_service TEXT`);
  }
  if (campaignCols.length > 0 && !campaignColNames.includes('services_json')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN services_json TEXT`);
  }

  const quoteCols = db.prepare(`PRAGMA table_info(quotes)`).all() as { name: string }[];
  const quoteColNames = quoteCols.map(c => c.name);
  if (quoteCols.length > 0 && !quoteColNames.includes('company_id')) {
    db.exec(`ALTER TABLE quotes ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`);
  }
  if (quoteCols.length > 0 && !quoteColNames.includes('contact_id')) {
    db.exec(`ALTER TABLE quotes ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL`);
  }
  if (quoteCols.length > 0 && !quoteColNames.includes('opportunity_id')) {
    db.exec(`ALTER TABLE quotes ADD COLUMN opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL`);
  }
  if (quoteCols.length > 0 && !quoteColNames.includes('issue_date')) {
    db.exec(`ALTER TABLE quotes ADD COLUMN issue_date TEXT`);
    db.exec(`UPDATE quotes SET issue_date = created_at WHERE issue_date IS NULL`);
  }
  if (quoteCols.length > 0 && !quoteColNames.includes('total_amount')) {
    db.exec(`ALTER TABLE quotes ADD COLUMN total_amount REAL NOT NULL DEFAULT 0`);
    db.exec(`UPDATE quotes SET total_amount = total WHERE total_amount = 0`);
  }

  const quoteItemCols = db.prepare(`PRAGMA table_info(quote_items)`).all() as { name: string }[];
  const quoteItemColNames = quoteItemCols.map(c => c.name);
  if (quoteItemCols.length > 0 && !quoteItemColNames.includes('product')) {
    db.exec(`ALTER TABLE quote_items ADD COLUMN product TEXT`);
  }
  if (quoteItemCols.length > 0 && !quoteItemColNames.includes('discount')) {
    db.exec(`ALTER TABLE quote_items ADD COLUMN discount REAL NOT NULL DEFAULT 0`);
  }
  if (quoteItemCols.length > 0 && !quoteItemColNames.includes('tax')) {
    db.exec(`ALTER TABLE quote_items ADD COLUMN tax REAL NOT NULL DEFAULT 0`);
  }
  if (quoteItemCols.length > 0 && !quoteItemColNames.includes('total')) {
    db.exec(`ALTER TABLE quote_items ADD COLUMN total REAL NOT NULL DEFAULT 0`);
    db.exec(`UPDATE quote_items SET total = amount WHERE total = 0`);
  }

  const pipelineCount = (db.prepare(`SELECT COUNT(*) as c FROM pipelines`).get() as { c: number }).c;
  if (pipelineCount === 0) {
    const inserted = db.prepare(`
      INSERT INTO pipelines (name, description, sort_order, updated_at)
      VALUES ('Default Sales Pipeline', 'Default pipeline for Sales workflow', 1, datetime('now'))
    `).run();
    const pipelineId = Number(inserted.lastInsertRowid);
    const stageStmt = db.prepare(`
      INSERT INTO pipeline_stages (pipeline_id, name, sort_order, is_closed, is_won, default_probability, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const defaults: Array<[string, number, number, number, number]> = [
      ['Discovery', 1, 0, 0, 20],
      ['Proposal', 2, 0, 0, 50],
      ['Negotiation', 3, 0, 0, 75],
      ['Won', 4, 1, 1, 100],
      ['Lost', 5, 1, 0, 0],
    ];
    for (const [name, sortOrder, isClosed, isWon, probability] of defaults) {
      stageStmt.run(pipelineId, name, sortOrder, isClosed, isWon, probability);
    }
  }

  // Seed default outreach templates per vertical/channel
  const DEFAULT_VERTICALS = ['crm', 'digital', 'software', 'ai_automation', 'engineering', 'iot'];
  const hasTemplate = db.prepare(`SELECT 1 FROM outreach_templates WHERE channel = ? AND vertical = ?`);
  const insertTemplate = db.prepare(`
    INSERT INTO outreach_templates (channel, vertical, subject, message, updated_at)
    VALUES (@channel, @vertical, @subject, @message, datetime('now'))
  `);

  for (const vertical of DEFAULT_VERTICALS) {
    const existsEmail = hasTemplate.get('email', vertical);
    if (!existsEmail) {
      const subject = vertical === 'engineering'
        ? 'Engineering Support for {{company_name}}'
        : vertical === 'software'
          ? 'Software Delivery Support for {{company_name}}'
          : vertical === 'iot'
            ? 'IoT Solutions for {{company_name}}'
            : vertical === 'ai_automation'
              ? 'AI Automation Ideas for {{company_name}}'
              : vertical === 'crm'
                ? 'CRM Optimisation for {{company_name}}'
                : 'Digital Growth Support for {{company_name}}';
      const message = vertical === 'engineering'
        ? 'Hi {{company_name}},\n\nWe help engineering teams with CAD/CAE capacity and delivery support.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology'
        : vertical === 'software'
          ? 'Hi {{company_name}},\n\nWe support software teams with rapid delivery, integrations, and quality improvements.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology'
          : vertical === 'iot'
            ? 'Hi {{company_name}},\n\nWe help businesses deploy practical IoT solutions, from connected monitoring to dashboard integration.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology'
            : vertical === 'ai_automation'
              ? 'Hi {{company_name}},\n\nWe design AI automation workflows that reduce manual work and speed up operations.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology'
              : vertical === 'crm'
                ? 'Hi {{company_name}},\n\nWe help teams improve CRM setup, follow-up workflows, and conversion visibility.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology'
                : 'Hi {{company_name}},\n\nWe help businesses improve digital presence and lead conversion through practical upgrades.\n\nWould you be open to a short 15-minute call this week?\n\nKind regards,\nRaja\nSplendid Technology';
      insertTemplate.run({ channel: 'email', vertical, subject, message });
    }

    const existsSms = hasTemplate.get('sms', vertical);
    if (!existsSms) {
      const message = vertical === 'engineering'
        ? 'Hi {{company_name}}, we provide flexible engineering CAD/CAE support. Open to a quick 15-min call this week? - Splendid Technology'
        : vertical === 'software'
          ? 'Hi {{company_name}}, we help software teams deliver faster with less rework. Open to a quick 15-min call this week? - Splendid Technology'
          : vertical === 'iot'
            ? 'Hi {{company_name}}, we build IoT solutions for monitoring and operations. Open to a quick 15-min call this week? - Splendid Technology'
            : vertical === 'ai_automation'
              ? 'Hi {{company_name}}, we build AI automation workflows to save time and cost. Open to a quick 15-min call this week? - Splendid Technology'
              : vertical === 'crm'
                ? 'Hi {{company_name}}, we improve CRM workflows and conversion tracking. Open to a quick 15-min call this week? - Splendid Technology'
                : 'Hi {{company_name}}, we help improve digital growth and conversion. Open to a quick 15-min call this week? - Splendid Technology';
      insertTemplate.run({ channel: 'sms', vertical, subject: null, message });
    }
  }
}
