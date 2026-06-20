import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import { getDb } from '@/lib/db';
import { translateSqliteToPostgres } from '@/lib/sql-dialect';

type DbFlavor = 'sqlite' | 'postgres';

type PgExecutor = Pick<Pool, 'query'>;

type SqlParam = string | number | boolean | null;

type SqlParams = SqlParam[] | Record<string, SqlParam>;

type RunResult = {
  rowCount: number;
  lastInsertId?: number | string;
  rows?: Array<Record<string, unknown>>;
};

let _pool: Pool | null = null;

// When a Postgres transaction is active, inner queries must run on the same
// connection. This holds the bound client for the duration of withTransaction.
const txStorage = new AsyncLocalStorage<PoolClient>();

function isNamedParams(params: SqlParams): params is Record<string, SqlParam> {
  return !Array.isArray(params) && typeof params === 'object' && params !== null;
}

function getDbFlavor(): DbFlavor {
  const url = (process.env.DATABASE_URL ?? '').trim().toLowerCase();
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return 'postgres';
  }
  return 'sqlite';
}

function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL mode');
  }

  _pool = new Pool({ connectionString });
  return _pool;
}

// Use the transaction-bound client when inside withTransaction, else the pool.
function getPgExecutor(): PgExecutor {
  return txStorage.getStore() ?? getPool();
}

function convertSqlitePlaceholdersToPg(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function normalizeSqlForPostgres(sql: string): string {
  return translateSqliteToPostgres(sql);
}

// Convert SQLite named params (@name / :name) into ordered Postgres placeholders ($1, $2, ...).
function buildNamedPg(sql: string, params: Record<string, SqlParam>): { text: string; values: SqlParam[] } {
  const values: SqlParam[] = [];
  const seen = new Map<string, number>();
  const text = sql.replace(/[@:]([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, name: string) => {
    if (!seen.has(name)) {
      values.push(name in params ? params[name] : null);
      seen.set(name, values.length);
    }
    return `$${seen.get(name)}`;
  });
  return { text, values };
}

function toPgQuery(sql: string, params: SqlParams): { text: string; values: SqlParam[] } {
  const normalized = normalizeSqlForPostgres(sql);
  if (isNamedParams(params)) {
    return buildNamedPg(normalized, params);
  }
  return { text: convertSqlitePlaceholdersToPg(normalized), values: params };
}

export function isPostgresDb(): boolean {
  return getDbFlavor() === 'postgres';
}

export async function queryAll<T = Record<string, unknown>>(sql: string, params: SqlParams = []): Promise<T[]> {
  if (getDbFlavor() === 'sqlite') {
    const stmt = getDb().prepare(sql);
    return (isNamedParams(params) ? stmt.all(params) : stmt.all(...params)) as T[];
  }

  const { text, values } = toPgQuery(sql, params);
  const res = await getPgExecutor().query(text, values);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: SqlParams = []): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, params);
  return rows[0];
}

export async function runStatement(sql: string, params: SqlParams = []): Promise<RunResult> {
  if (getDbFlavor() === 'sqlite') {
    const stmt = getDb().prepare(sql);
    const result = isNamedParams(params) ? stmt.run(params) : stmt.run(...params);
    return {
      rowCount: result.changes,
      lastInsertId: typeof result.lastInsertRowid === 'bigint' ? Number(result.lastInsertRowid) : result.lastInsertRowid,
    };
  }

  const { text, values } = toPgQuery(sql, params);
  const executor = getPgExecutor();
  const isInsert = /^\s*insert\s/i.test(text);
  const hasReturning = /\breturning\b/i.test(text);

  // Auto-append RETURNING id so callers relying on lastInsertId keep working in Postgres.
  if (isInsert && !hasReturning) {
    try {
      const res = await executor.query(`${text} RETURNING id`, values);
      const firstRow = res.rows[0] as { id?: number | string } | undefined;
      return {
        rowCount: res.rowCount ?? 0,
        rows: res.rows as Array<Record<string, unknown>>,
        lastInsertId: firstRow?.id,
      };
    } catch (err) {
      // 42703 = undefined_column: table has no "id" column (e.g. composite-PK tables).
      if ((err as { code?: string }).code !== '42703') {
        throw err;
      }
    }
  }

  const res = await executor.query(text, values);
  const firstRow = res.rows[0] as { id?: number | string } | undefined;
  return {
    rowCount: res.rowCount ?? 0,
    rows: res.rows as Array<Record<string, unknown>>,
    lastInsertId: firstRow?.id,
  };
}

export async function hasTable(tableName: string): Promise<boolean> {
  if (getDbFlavor() === 'sqlite') {
    const row = await queryOne<{ name?: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName]
    );
    return !!row?.name;
  }

  const row = await queryOne<{ table_name?: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`,
    [tableName]
  );

  return !!row?.table_name;
}

// Run fn inside a database transaction. In Postgres, every db-client call made
// within fn runs on the same dedicated connection (via AsyncLocalStorage) so the
// transaction is honoured; in SQLite it uses the shared connection's BEGIN/COMMIT.
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (getDbFlavor() === 'sqlite') {
    const db = getDb();
    db.exec('BEGIN');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const client = await getPool().connect();
  try {
    return await txStorage.run(client, async () => {
      await client.query('BEGIN');
      try {
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  } finally {
    client.release();
  }
}
