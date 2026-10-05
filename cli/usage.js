// Local, append-only usage accounting.
//
// Why this exists: the CLI has no usage figures anywhere. `--json` output carries no
// token counts and there is no /status line showing spend, so a long session's cost
// is unknowable to the person paying for it. The server side has token counters; the
// CLI path never asked.
//
// Design constraints, all deliberate:
//   - Local only. One JSON line per turn appended to <cwd>/.sword/usage.jsonl. No
//     network call, no telemetry, no analytics endpoint — a coding agent that reads
//     your files must not also report to anyone.
//   - Mode 0600. The file lives next to the session history and is created
//     owner-only; it is chmod'ed on every append because open()'s mode argument is
//     ignored when the file already exists.
//   - Field whitelist. Only the keys in LINE_FIELDS are ever written. That is the
//     mechanism that guarantees a secret cannot reach disk: an API key passed to
//     recordTurn has nowhere to go, rather than being filtered out by a denylist that
//     someone will eventually extend the wrong way.
//   - Clock injectable (`now`) so tests can assert exact rows.
//
// Token counts come from the provider when it reports usage and from estimateTokens
// when it does not; the `estimated` flag on each row records which, because a cost
// computed from a 4-chars-per-token guess is not a measurement.

import { appendFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';

/** Same 4-chars-per-token heuristic as cli/budget.js; no tokenizer dependency. */
export const CHARS_PER_TOKEN = 4;

/**
 * Deterministic token estimate. Never consults a tokenizer, so it never throws and
 * never turns a usage-accounting failure into a broken turn.
 */
export function estimateTokens(text) {
  if (text === null || text === undefined) return 0;
  const length = typeof text === 'string' ? text.length : String(text).length;
  return Math.ceil(length / CHARS_PER_TOKEN);
}

const FILE = 'usage.jsonl';
const DIR = '.sword';
const MODE = 0o600;

// The complete, closed set of persisted keys. See the whitelist note above.
const LINE_FIELDS = Object.freeze([
  'ts', 'model', 'provider', 'tokens_in', 'tokens_out', 'cost_usd', 'duration_ms', 'estimated',
]);

const count = value => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/**
 * Create a usage tracker bound to one working directory.
 *
 * `recordTurn` is async because it awaits the append; it is best-effort at the call
 * site (`tracker.recordTurn(...).catch(() => {})`) — accounting must never be the
 * reason a turn fails.
 *
 * @param {{cwd?: string, provider?: string, now?: () => number}} [options]
 */
export function createUsageTracker({ cwd = process.cwd(), provider = '', now = Date.now } = {}) {
  const file = join(cwd, DIR, FILE);
  // Mutable by necessity (it is a running total), but never leaked: session()
  // returns a frozen copy.
  const totals = { turns: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, duration_ms: 0 };
  const byModel = new Map();

  return {
    file,

    /**
     * Append one usage row and fold it into the session totals.
     *
     * @param {{model?: string, promptTokens?: number, completionTokens?: number,
     *          estimated?: boolean, durationMs?: number, provider?: string,
     *          costUsd?: number}} turn
     */
    async recordTurn({ model = 'unknown', promptTokens = 0, completionTokens = 0,
      estimated = true, durationMs = 0, provider: turnProvider, costUsd } = {}) {
      const tokensIn = count(promptTokens);
      const tokensOut = count(completionTokens);
      const row = {
        ts: new Date(now()).toISOString(),
        model: String(model),
        provider: String(turnProvider ?? provider ?? ''),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        // Omitted rather than written as null: a cost we cannot compute is not zero.
        ...(Number.isFinite(costUsd) ? { cost_usd: costUsd } : {}),
        duration_ms: count(durationMs),
        estimated: estimated !== false,
      };
      const line = Object.fromEntries(LINE_FIELDS.map(key => [key, row[key]]));

      totals.turns += 1;
      totals.tokens_in += tokensIn;
      totals.tokens_out += tokensOut;
      totals.duration_ms += line.duration_ms;
      if (Number.isFinite(costUsd)) totals.cost_usd += costUsd;
      const modelTotals = byModel.get(line.model) ?? { turns: 0, tokens_in: 0, tokens_out: 0 };
      modelTotals.turns += 1;
      modelTotals.tokens_in += tokensIn;
      modelTotals.tokens_out += tokensOut;
      byModel.set(line.model, modelTotals);

      await mkdir(join(cwd, DIR), { recursive: true });
      await appendFile(file, `${JSON.stringify(line)}\n`, { mode: MODE });
      // open()/appendFile()'s mode only applies on creation, so an existing file
      // left world-readable by an earlier build would stay that way forever.
      await chmod(file, MODE);
      return Object.freeze({ ...line });
    },

    /** Frozen copy of the running totals — callers cannot mutate tracker state. */
    session() {
      return Object.freeze({
        turns: totals.turns,
        tokens_in: totals.tokens_in,
        tokens_out: totals.tokens_out,
        tokens: totals.tokens_in + totals.tokens_out,
        ...(totals.cost_usd > 0 ? { cost_usd: Number(totals.cost_usd.toFixed(6)) } : {}),
        duration_ms: totals.duration_ms,
        by_model: Object.freeze(Object.fromEntries(
          [...byModel].map(([name, t]) => [name, Object.freeze({ ...t })]))),
      });
    },

    /** Zero the in-memory totals. The jsonl file is history and is never truncated. */
    reset() {
      totals.turns = 0;
      totals.tokens_in = 0;
      totals.tokens_out = 0;
      totals.cost_usd = 0;
      totals.duration_ms = 0;
      byModel.clear();
      return this.session();
    },
  };
}