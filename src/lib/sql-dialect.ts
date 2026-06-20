// SQLite -> PostgreSQL SQL dialect translation.
//
// The application source keeps SQLite syntax (so it still runs on better-sqlite3),
// and this module rewrites the SQL at runtime only when talking to Postgres.
//
// It is intentionally focused on the constructs actually used in this codebase:
//   - date(...) / datetime(...) with 'now', column expressions, and modifiers
//     ('+90 day', '-30 days', 'start of month', 'weekday N')
//   - strftime('%Y-%m', expr)
//   - LIKE -> ILIKE (SQLite LIKE is case-insensitive for ASCII)
//   - AUTOINCREMENT removal
//
// It uses a small paren-aware scanner so nested calls like
// date(COALESCE(a, b)) are handled correctly.

type SplitResult = { args: string[]; end: number };

// Given source[openParenIndex] === '(', return the top-level comma-separated
// argument strings and the index just past the matching ')'.
function readArgs(source: string, openParenIndex: number): SplitResult {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  let inSingle = false;
  let i = openParenIndex;

  for (; i < source.length; i++) {
    const ch = source[i];

    if (inSingle) {
      current += ch;
      if (ch === "'") {
        // handle escaped '' inside a string literal
        if (source[i + 1] === "'") {
          current += "'";
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      continue;
    }

    if (ch === '(') {
      depth++;
      if (depth === 1) {
        // skip the outermost opening paren itself
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === ')') {
      depth--;
      if (depth === 0) {
        if (current.trim().length > 0 || args.length > 0) {
          args.push(current.trim());
        }
        return { args, end: i + 1 };
      }
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  // Unbalanced parens: return what we have.
  if (current.trim().length > 0) args.push(current.trim());
  return { args, end: source.length };
}

function stripQuotes(literal: string): string | null {
  const m = literal.match(/^'([\s\S]*)'$/);
  return m ? m[1] : null;
}

// Translate a single SQLite date modifier applied to a Postgres expression.
function applyModifier(expr: string, modifier: string): string {
  const m = modifier.trim();

  // Interval modifiers: '+90 day', '-30 days', '+1 month', '2 hours', etc.
  const interval = m.match(/^([+-]?)(\d+)\s+(year|years|month|months|day|days|hour|hours|minute|minutes|second|seconds)$/i);
  if (interval) {
    const sign = interval[1] === '-' ? '-' : '+';
    const amount = interval[2];
    const unit = interval[3];
    return `(${expr} ${sign} INTERVAL '${amount} ${unit}')`;
  }

  // 'start of month' | 'start of day' | 'start of year'
  const startOf = m.match(/^start of (year|month|day)$/i);
  if (startOf) {
    return `date_trunc('${startOf[1].toLowerCase()}', ${expr})`;
  }

  // 'weekday N' -> advance to the next given weekday (0=Sunday..6=Saturday),
  // staying put if already on it. EXTRACT(DOW) matches SQLite's 0=Sunday numbering.
  const weekday = m.match(/^weekday\s+([0-6])$/i);
  if (weekday) {
    const target = weekday[1];
    return `(${expr} + (((${target} - EXTRACT(DOW FROM ${expr})::int) + 7) % 7) * INTERVAL '1 day')`;
  }

  // Unknown modifier: leave the expression unchanged.
  return expr;
}

const STRFTIME_TOKENS: Record<string, string> = {
  '%Y': 'YYYY',
  '%m': 'MM',
  '%d': 'DD',
  '%H': 'HH24',
  '%M': 'MI',
  '%S': 'SS',
  '%j': 'DDD',
  '%W': 'WW',
};

function strftimeFormatToPg(fmt: string): string {
  return fmt.replace(/%[YmdHMSjW]/g, (token) => STRFTIME_TOKENS[token] ?? token);
}

function baseExpr(arg: string, cast: 'date' | 'timestamp'): string {
  const literal = stripQuotes(arg);
  if (literal && literal.toLowerCase() === 'now') {
    return cast === 'date' ? 'CURRENT_DATE' : 'CURRENT_TIMESTAMP';
  }
  // Recurse so nested date()/datetime()/strftime() inside the argument translate too.
  const inner = translateDateFns(arg);
  return `(${inner})::${cast}`;
}

function translateCall(fn: 'date' | 'datetime', args: string[]): string {
  const cast = fn === 'date' ? 'date' : 'timestamp';
  let expr = baseExpr(args[0] ?? "'now'", cast);
  for (let i = 1; i < args.length; i++) {
    const mod = stripQuotes(args[i]);
    if (mod === null) continue;
    expr = applyModifier(expr, mod);
  }
  return `(${expr})::${cast}`;
}

function translateStrftime(args: string[]): string {
  const fmtLiteral = stripQuotes(args[0] ?? '');
  const fmt = fmtLiteral === null ? args[0] : `'${strftimeFormatToPg(fmtLiteral)}'`;
  const target = baseExpr(args[1] ?? "'now'", 'timestamp');
  return `to_char(${target}, ${fmt})`;
}

// Scan and replace date()/datetime()/strftime() calls, honoring nested parens.
function translateDateFns(sql: string): string {
  const fnRegex = /\b(datetime|date|strftime)\s*\(/gi;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fnRegex.exec(sql)) !== null) {
    const fnName = match[1].toLowerCase() as 'date' | 'datetime' | 'strftime';
    const openParen = match.index + match[0].length - 1;
    const { args, end } = readArgs(sql, openParen);

    result += sql.slice(lastIndex, match.index);
    if (fnName === 'strftime') {
      result += translateStrftime(args);
    } else {
      result += translateCall(fnName, args);
    }

    lastIndex = end;
    fnRegex.lastIndex = end;
  }

  result += sql.slice(lastIndex);
  return result;
}

export function translateSqliteToPostgres(sql: string): string {
  let out = sql.replace(/\bAUTOINCREMENT\b/g, '');
  out = translateDateFns(out);
  // SQLite LIKE is case-insensitive for ASCII; ILIKE preserves that behavior.
  out = out.replace(/\bLIKE\b/gi, 'ILIKE');
  return out;
}
