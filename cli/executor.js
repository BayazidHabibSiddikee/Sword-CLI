// Phase 2 execution engine: turn a model's tool calls into work, in parallel where
// that is safe, and fold the results back into history without ever duplicating a
// tool_call_id.
//
// Why a module at all: `runTurn` grew a single `for (const call of calls)` loop, so a
// model asking for six reads paid for them serially even though reads cannot conflict.
// The loop is replaced by three stages, each independently testable:
//
//   prepareCalls(calls, repeats, limits, outcomes) -> {entries, hardStop, text, answers}
//       Validates every call and bumps the loop counters IN CALL ORDER (not completion
//       order — otherwise parallelism would make the stop ladder non-deterministic),
//       then decides whether the turn must stop.
//   runReadonly / runMutation -> Outcome[]
//       Bounded concurrency for reads; strictly sequential for anything that can
//       mutate the work tree, because a mutation that overlaps another is a lost
//       update at best and a corrupted file at worst.
//   foldResults(history, outcomes) -> NEW history array
//       Appends EXACTLY ONE tool message per tool_call_id, in ORIGINAL call order,
//       even though completion order differs. Never mutates its input.
//
// The ordering invariant is the whole point: providers reject a message stream with
// two results for one id, and reject a tool result that does not follow its
// tool_call. Parallel completion is only safe if the fold is total and ordered.

const TOOL_OUTPUT_CHARS = 48000;

// Mirrors the thresholds in agent.js — kept local so this module has no dependency on
// the request path and can be unit-tested without a provider.
const LOOP_SOFT = 2, LOOP_HARD = 3, LOOP_REPEAT = 5;

export const MAX_CALLS = 16;
export const DEFAULT_MAX_PARALLEL = 4;
export const MAX_PARALLEL = 16;
export const MAX_BATCH = 8;

/** Elide the middle, keep head and tail — build/test failures live at the end. */
export function truncateMiddle(body, max = TOOL_OUTPUT_CHARS) {
  const notice = chars => `\n[truncated ${chars} chars — head and tail preserved]\n`;
  const half = Math.max(1, Math.floor((max - notice(body.length).length) / 2));
  return `${body.slice(0, half)}${notice(body.length - half * 2)}${body.slice(-half)}`;
}

/** Stable identity of a call, so the repeat ledger compares meaning, not key order. */
export function callKey(name, args) {
  let stable;
  try { stable = JSON.stringify(args ?? {}, Object.keys(args ?? {}).sort()); } catch { stable = String(args); }
  return `${name}:${stable}`;
}

export function loopStopText(name, seen) {
  return `You have called \`${name}\` with identical arguments ${seen} times in a row and it keeps failing. `
    + 'Stop retrying. Re-read the relevant file, reconsider the approach, or tell the user what is blocking you.';
}

/** Serialize a tool result for the wire, exactly once and always bounded. */
export function toolContent(result) {
  let serialized;
  try { serialized = JSON.stringify(result ?? null); } catch { serialized = JSON.stringify({ error: 'Unserializable tool result' }); }
  return serialized.length > TOOL_OUTPUT_CHARS ? truncateMiddle(serialized, TOOL_OUTPUT_CHARS) : serialized;
}

function normalizeEntry(call, index) {
  const name = call?.function?.name;
  let args = null;
  let argsError = null;
  try {
    args = JSON.parse(call?.function?.arguments || '{}');
  } catch (error) {
    argsError = `Malformed JSON arguments: ${error.message}`;
  }
  return { id: call?.id ?? null, index, name, args, argsError, key: callKey(name, args), outcome: null };
}

function unwrap(item) {
  if (item && typeof item === 'object' && item.outcome) return item.outcome;
  return item;
}

// Attach a non-enumerable failure to the returned array: callers still get a plain
// Outcome[] (so `for (const o of ...)` and spread work unchanged) but can see WHY the
// run stopped short without threading a second return value through every caller.
function withFailure(outcomes, failure) {
  Object.defineProperty(outcomes, 'failure', { value: failure ?? null, enumerable: false });
  return outcomes;
}
/**
 * Validate calls and apply the loop ladder.
 *
 * `repeats` is the turn's ledger (a Map) and the ONLY thing mutated — in index order,
 * so a parallel run and a sequential run of the same calls reach identical counters.
 * `outcomes` is the (unordered) completion list. When omitted this is a pure
 * validation pass: entries come back with no outcome and hardStop is false.
 */
export function prepareCalls(calls, repeats, limits = {}, outcomes = []) {
  if (!Array.isArray(calls) || calls.length > (limits.maxCalls ?? MAX_CALLS)) throw new Error('Invalid tool calls');
  const entries = calls.map(normalizeEntry);
  for (const entry of entries) if (!entry.id || !entry.name) throw new Error('Invalid tool call');

  const done = new Map();
  for (const item of outcomes) {
    const outcome = unwrap(item);
    if (outcome?.id) done.set(outcome.id, outcome);
  }
  const soft = limits.soft ?? LOOP_SOFT;
  const hard = limits.hard ?? LOOP_HARD;
  const repeat = limits.repeat ?? LOOP_REPEAT;

  let hardStop = false;
  let stopName = null;
  let stopSeen = 0;
  const answers = new Map();

  for (const entry of entries) {
    const outcome = done.get(entry.id);
    if (!outcome) continue;
    // A call whose arguments never parsed did not run; bumping its ledger would
    // count a repetition the model never actually got to make.
    const result = entry.argsError ? { error: entry.argsError } : (outcome.result ?? null);
    const ok = result?.error === undefined;
    // Accounting runs AFTER the outcome is known, and a change of outcome for the
    // same (tool, args) pair resets the streak.
    const failingNow = !ok;
    const prev = repeats.get(entry.key);
    const seen = prev && prev.failing === failingNow ? prev.count + 1 : 1;
    repeats.set(entry.key, { count: seen, failing: failingNow });
    const base = result && typeof result === 'object' ? result : { result };
    let final = result;
    if (failingNow && seen >= hard) {
      hardStop = true;
      stopName = entry.name;
      stopSeen = seen;
      final = { error: loopStopText(entry.name, seen) };
    } else if (failingNow && seen >= soft) {
      final = { ...base, error: `${base.error ?? 'failed'} (repetition ${seen}/${hard})` };
    } else if (!failingNow && seen >= repeat) {
      final = { ...base, note: `\`${entry.name}\` was called ${seen} times with identical arguments and succeeded each time. Continue only if that repetition is intentional.` };
    }
    const folded = { ...outcome, name: entry.name, args: entry.args, index: entry.index,
      ok: final?.error === undefined, result: final, content: toolContent(final) };
    entry.outcome = folded;
    answers.set(entry.id, folded.content);
  }

  const text = hardStop ? loopStopText(stopName, stopSeen) : null;
  return { entries, hardStop, text, answers };
}

/**
 * Split calls into ordered segments of work. Returns a NEW array; input untouched.
 *
 * Consecutive reads collapse into one `readonly` segment. A mutating call always
 * breaks the run, so reads that FOLLOW a mutation are dispatched only once that
 * mutation has finished — a read the model listed after a write must not observe the
 * pre-write tree. Consecutive batchable mutations collapse into one `batch` segment
 * (capped at maxBatch) so the group gets a single approval and a single checkpoint.
 */
export function partitionCalls(calls, { isMutating = () => false, batchable = () => false, maxBatch = MAX_BATCH } = {}) {
  const segments = [];
  for (const [index, call] of (Array.isArray(calls) ? calls : []).entries()) {
    const entry = normalizeEntry(call, index);
    const kind = !isMutating(call) ? 'readonly' : (batchable(call) ? 'batch' : 'mutate');
    const previous = segments[segments.length - 1];
    if (previous && previous.kind === kind && (kind !== 'batch' || previous.calls.length < maxBatch)) {
      previous.calls = [...previous.calls, entry];
      continue;
    }
    segments.push({ kind, calls: [entry] });
  }
  return segments;
}

function outcomeOf(entry, result, startedAt) {
  return { id: entry.id, index: entry.index, name: entry.name, args: entry.args,
    ok: result?.error === undefined, result: result ?? null, ms: Math.max(0, Date.now() - startedAt) };
}

/** Best-effort one-line summary so UI listeners keep the single-arg shape. */
function summarizeOutcome(result, args) {
  if (result && typeof result === 'object') {
    if (typeof result.error === 'string') return result.error;
    if (result.timedOut) return 'timeout';
    if (result.signal) return `signal=${result.signal}`;
    if ('exitCode' in result) return `exit=${result.exitCode ?? '?'}`;
    if (typeof result.path === 'string') return result.path;
    if (typeof result.content === 'string') return result.content;
    if (typeof result.url === 'string') return result.url;
    if (typeof result.markdown === 'string') return result.markdown;
  }
  if (args && typeof args.path === 'string') return args.path;
  return '';
}

function emit(onEvent, entry, result, startedAt) {
  // A UI listener must never be able to break execution.
  try {
    if (result === undefined) { onEvent?.(entry.name); return; }
    onEvent?.(entry.name, { ok: result?.error === undefined, ms: Math.max(0, Date.now() - startedAt), summary: summarizeOutcome(result, entry.args) });
  } catch { /* ignore */ }
}

function asEntries(calls) {
  return (Array.isArray(calls) ? calls : []).map((call, i) =>
    (call && call.key !== undefined && call.index !== undefined ? call : normalizeEntry(call, i)));
}

/**
 * Run read-only calls with bounded concurrency (default 4). Returns outcomes in
 * COMPLETION order; `foldResults` is what restores call order.
 *
 * On abort the completed outcomes are returned together with `outcomes.failure`
 * rather than thrown away — the caller folds what finished and repairs the rest,
 * which is exactly the existing checkpointRepair contract.
 */
export async function runReadonly(calls, { run, signal, onEvent, maxParallel = DEFAULT_MAX_PARALLEL } = {}) {
  const entries = asEntries(calls);
  const limit = Math.max(1, Math.min(MAX_PARALLEL, Math.trunc(maxParallel) || DEFAULT_MAX_PARALLEL));
  const results = new Array(entries.length);
  let cursor = 0;
  let failure = null;

  const worker = async () => {
    while (cursor < entries.length) {
      if (signal?.aborted) { failure ??= signal.reason ?? new Error('aborted'); return; }
      const index = cursor++;
      const entry = entries[index];
      const startedAt = Date.now();
      emit(onEvent, entry, undefined, startedAt);
      let result;
      try {
        result = entry.argsError ? { error: entry.argsError } : await run(entry, { signal });
      } catch (error) {
        // A genuine abort propagates; anything else is a tool failure the model
        // should see rather than a turn-ending error.
        if (signal?.aborted) { failure ??= error; return; }
        result = { error: error?.message ?? String(error) };
      }
      const outcome = outcomeOf(entry, result, startedAt);
      emit(onEvent, entry, outcome.result, startedAt);
      results[index] = outcome;
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, worker));
  // Completion order for the caller; the holes left by an abort are dropped.
  return withFailure(results.filter(Boolean), failure);
}

/**
 * Run mutating calls STRICTLY sequentially. Two overlapping writes to the tree is a
 * data race; parallelism here buys nothing because each one needs approval anyway.
 *
 * When `batch` is supplied and more than one call is queued, the whole segment goes
 * to it in one shot — single approval, single checkpoint — and it returns outcomes.
 */
export async function runMutation(calls, { run, batch, signal, onEvent } = {}) {
  const entries = asEntries(calls);
  const results = new Array(entries.length);
  let failure = null;

  if (typeof batch === 'function' && entries.length > 1) {
    const startedAt = Date.now();
    for (const entry of entries) emit(onEvent, entry, undefined, startedAt);
    try {
      const produced = (await batch(entries, { signal, onEvent })) ?? [];
      const byId = new Map(produced.map(o => [o?.id, o]));
      entries.forEach((entry, i) => {
        const outcome = byId.get(entry.id) ?? { ok: false, result: { error: 'batch produced no result' }, ms: 0 };
        results[i] = { ...outcome, id: entry.id, index: entry.index, name: entry.name, args: entry.args };
        emit(onEvent, entry, results[i].result, startedAt);
      });
    } catch (error) {
      if (signal?.aborted) failure = error;
      else entries.forEach((entry, i) => { results[i] = outcomeOf(entry, { error: error?.message ?? String(error) }, startedAt); emit(onEvent, entry, results[i].result, startedAt); });
    }
    return withFailure(results.filter(Boolean), failure);
  }

  for (const [i, entry] of entries.entries()) {
    if (signal?.aborted) { failure = signal.reason ?? new Error('aborted'); break; }
    const startedAt = Date.now();
    emit(onEvent, entry, undefined, startedAt);
    let result;
    try {
      result = entry.argsError ? { error: entry.argsError } : await run(entry, { signal });
    } catch (error) {
      if (signal?.aborted) { failure = error; break; }
      result = { error: error?.message ?? String(error) };
    }
    const outcome = outcomeOf(entry, result, startedAt);
    emit(onEvent, entry, outcome.result, startedAt);
    results[i] = outcome;
  }
  return withFailure(results.filter(Boolean), failure);
}

/**
 * Append one tool message per outcome, ordered by ORIGINAL call index.
 *
 * Three properties this must never lose, whatever the completion order was:
 *   - exactly one message per tool_call_id (a duplicate is a protocol error);
 *   - original call order, because providers match results positionally;
 *   - the input array and every message in it are untouched.
 * Ids already present in `history` are dropped rather than repeated, so folding the
 * same outcomes twice is safe.
 */
export function foldResults(history, outcomes) {
  const base = Array.isArray(history) ? history : [];
  const answered = new Set(base.filter(m => m?.role === 'tool').map(m => m.tool_call_id));
  const seen = new Set();
  const ordered = (Array.isArray(outcomes) ? outcomes : [])
    .map((item, i) => ({ outcome: unwrap(item), i }))
    .filter(({ outcome }) => outcome?.id && !(answered.has(outcome.id)))
    .sort((a, b) => (a.outcome.index ?? a.i) - (b.outcome.index ?? b.i) || a.i - b.i);
  const added = [];
  for (const { outcome } of ordered) {
    if (seen.has(outcome.id)) continue;
    seen.add(outcome.id);
    // `content` is present when prepareCalls already applied the loop ladder (it may
    // have rewritten the result); otherwise serialize the raw outcome here, so
    // foldResults is usable straight on execution outcomes.
    const content = typeof outcome.content === 'string' ? outcome.content : toolContent(outcome.result);
    if (typeof content !== 'string') continue;
    added.push({ role: 'tool', tool_call_id: outcome.id, content });
  }
  return added.length ? [...base, ...added] : base;
}
