// Local CLI usage accounting over HTTP.
//
// The CLI writes one JSON line per turn to <cwd>/.flow/usage.jsonl (see cli/usage.js).
// This route exposes those rows to the dashboard so a session's token spend is
// inspectable without opening the file. It is deliberately read-only and
// local-filesystem only: it never writes, never calls a provider, and never accepts a
// path from the request — the directory comes from SWORD_USAGE_DIR or process.cwd(),
// so a caller cannot use it to read an arbitrary file.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const usageRouter = Router();

/** Only the fields the CLI actually writes are echoed back. */
const LINE_FIELDS = ['ts', 'model', 'provider', 'tokens_in', 'tokens_out', 'cost_usd', 'duration_ms', 'estimated'] as const;

function usageFile(): string {
  const dir = process.env.SWORD_USAGE_DIR ? resolve(process.env.SWORD_USAGE_DIR) : process.cwd();
  return join(dir, '.flow', 'usage.jsonl');
}

function readRows(file: string): Record<string, unknown>[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return []; // no file yet is not an error; the CLI simply has no recorded turns
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      rows.push(Object.fromEntries(LINE_FIELDS.map(key => [key, parsed[key]])));
    } catch {
      // A truncated final line (a write interrupted mid-append) is skipped, not fatal.
    }
  }
  return rows;
}

usageRouter.get('/', (_req: Request, res: Response) => {
  const file = usageFile();
  const rows = readRows(file);
  type Totals = { turns: number; tokens_in: number; tokens_out: number; duration_ms: number; cost_usd: number };
  const totals = rows.reduce<Totals>(
    (acc, row) => {
      acc.turns += 1;
      acc.tokens_in += Number(row.tokens_in) || 0;
      acc.tokens_out += Number(row.tokens_out) || 0;
      acc.duration_ms += Number(row.duration_ms) || 0;
      if (typeof row.cost_usd === 'number') acc.cost_usd += row.cost_usd;
      return acc;
    },
    { turns: 0, tokens_in: 0, tokens_out: 0, duration_ms: 0, cost_usd: 0 },
  );
  const limit = Math.min(Math.max(parseInt(String((_req.query.limit ?? '200') as string), 10) || 200, 1), 5000);
  res.json({
    file,
    totals: { ...totals, tokens: totals.tokens_in + totals.tokens_out },
    rows: rows.slice(-limit),
  });
});
