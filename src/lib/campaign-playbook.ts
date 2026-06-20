import { queryOne, runStatement, withTransaction } from '@/lib/db-client';

export const CRM_DAILY_ACTIVITIES: string[] = [
  '5 LinkedIn connections',
  '2 Follow-up messages',
  '1 Upwork proposal',
  '15 min CRM improvement',
  'Respond to LinkedIn/Upwork messages',
];

export const CRM_WEEKLY_ACTIVITIES: string[] = [
  'Publish 1 LinkedIn post',
  'Publish 1 YouTube video',
  'Apply to 5 Upwork projects',
  '1 CRM demo or feedback session',
  'Review product roadmap',
  'Publish 1 blog article',
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysIso(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildWeeklyTaskPlan(startDate: string = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${startDate}T00:00:00`);

  const plan: Array<{ title: string; due_date: string; category: 'daily' | 'weekly' }> = [];

  for (let day = 0; day < 7; day += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const dueDate = toIsoDate(date);

    for (const activity of CRM_DAILY_ACTIVITIES) {
      plan.push({
        title: `[CRM 90-Day] ${activity}`,
        due_date: dueDate,
        category: 'daily',
      });
    }
  }

  for (let i = 0; i < CRM_WEEKLY_ACTIVITIES.length; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    plan.push({
      title: `[CRM 90-Day] ${CRM_WEEKLY_ACTIVITIES[i]}`,
      due_date: toIsoDate(date),
      category: 'weekly',
    });
  }

  return plan;
}

export function getMondayIsoDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function ensureWeeklyPlaybookTasks(
  options: { userId?: number | null; now?: Date; force?: boolean } = {}
) {
  const now = options.now ?? new Date();
  const userId = options.userId ?? null;
  const weekStart = getMondayIsoDate(now);
  const force = options.force ?? false;

  const existingRun = await queryOne(
    'SELECT id FROM campaign_playbook_runs WHERE week_start = ?',
    [weekStart]
  ) as { id: number } | undefined;

  if (existingRun && !force) {
    return { created: 0, weekStart, weekEnd: addDaysIso(weekStart, 6), skipped: true };
  }

  if (existingRun && force) {
    await runStatement('DELETE FROM campaign_playbook_runs WHERE id = ?', [existingRun.id]);
  }

  const plan = buildWeeklyTaskPlan(weekStart);

  await withTransaction(async () => {
    for (const item of plan) {
      await runStatement(`
    INSERT INTO tasks (lead_id, user_id, title, due_date)
    VALUES (?, ?, ?, ?)
  `, [null, userId, item.title, item.due_date]);
    }
    await runStatement(`
    INSERT INTO campaign_playbook_runs (week_start, created_at)
    VALUES (?, datetime('now'))
  `, [weekStart]);
  });

  return {
    created: plan.length,
    weekStart,
    weekEnd: addDaysIso(weekStart, 6),
    skipped: false,
  };
}
