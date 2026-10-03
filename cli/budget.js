// Context budgeting and honest degradation.
//
// Why this exists: the request path used to compare `JSON.stringify(messages).length`
// against a fixed 500 000-character cliff and, past it, throw "start a new session".
// That is a lie about *why* the session is big, and it throws away work the user
// cannot recover. Here the request is measured in tokens (a deterministic
// 4-chars-per-token estimate), and when it does not fit we degrade instead of dying.
//
// Degradation order — the ONLY order `degrade()` is allowed to use. Each step is
// tried in turn and the next one starts only when the previous can no longer help:
//   1. Nothing happens while the projected request already fits the budget.
//   2. Drop whole OLDEST TURNS, oldest first. A "turn" is a user message plus every
//      assistant/tool message that follows it, so a (tool_use, tool_result) pair is
//      never separated and no `tool` message is ever left without its `tool_use`.
//   3. Only when every droppable turn is gone, shrink oversized `tool_result`
//      content (largest first, down to a floor): a truncated file listing damages
//      the turn far less than losing the whole conversation turn.
//   4. If it still does not fit, throw — the remainder is genuinely irreducible
//      (system prompt + tool schemas + the current input).
//
// Invariants (all covered by test/budget.test.js):
//   - the CURRENT input — the last user / assistant text block plus everything the
//     in-flight turn produced after it — is never dropped or shrunk;
//   - system messages and tool schemas are never touched;
//   - a (tool_use, tool_result) pair is never split, in either direction;
//   - the input array and its message objects are never mutated;
//   - system + tools + current input alone exceeding the budget throws a clear error
//     instead of silently emitting a request that cannot work.
//
// Pure and dependency-free on purpose: it must be trivially testable and safe to
// call from both the local and the g4f request paths.

export const CHARS_PER_TOKEN = 4;
// Tool output is never squeezed below this; under it the model has nothing to act on.
export const MIN_TOOL_CHARS = 400;
// Default ceiling when a caller has no model-specific number: roughly 128k tokens.
export const DEFAULT_BUDGET_TOKENS = 128000;

/** Deterministic token estimate. Never consults a tokenizer, so it never throws. */
export function estimateTokens(text) {
  if (text === null || text === undefined) return 0;
  const length = typeof text === 'string' ? text.length : String(text).length;
  return Math.ceil(length / CHARS_PER_TOKEN);
}

function charsOf(value) {
  if (typeof value === 'string') return value.length;
  try { return JSON.stringify(value ?? null)?.length ?? 0; } catch { return String(value ?? '').length; }
}

/**
 * Which of the five billable blocks a message belongs to. The block kind decides
 * what `degrade()` is allowed to do with it, so classification is explicit rather
 * than scattered role checks inside the drop loop.
 */
export function classifyMessage(m) {
  if (!m || typeof m !== 'object') return 'system';
  if (m.role === 'system') return 'system';
  if (m.role === 'user') return 'user';
  if (m.role === 'tool') return 'tool_result';
  if (Array.isArray(m.tool_calls) && m.tool_calls.length) return 'assistant_tool_use';
  return 'assistant_text';
}

/** Cost of one message: block kind, on-the-wire chars, tokens, and tool call ids. */
export function messageCost(m) {
  const block = classifyMessage(m);
  const chars = charsOf(m);
  const toolCallIds = block === 'assistant_tool_use'
    ? m.tool_calls.map(call => call?.id).filter(id => typeof id === 'string')
    : block === 'tool_result' && typeof m.tool_call_id === 'string' ? [m.tool_call_id] : [];
  return { block, chars, tokens: Math.ceil(chars / CHARS_PER_TOKEN), toolCallIds };
}


/**
 * What the whole request will cost. Tool schemas are counted ONCE into `reserve`:
 * they travel with every request but are not per-message content, and counting them
 * per message would make the budget arithmetic drift.
 */
export function projectRequest({ messages = [], tools = [] } = {}) {
  const perMessage = messages.map((m, index) => ({ index, ...messageCost(m) }));
  const reserve = estimateTokens(JSON.stringify(tools ?? []));
  const tokens = perMessage.reduce((sum, entry) => sum + entry.tokens, 0) + reserve;
  return { tokens, blocks: perMessage, reserve, perMessage };
}

/**
 * Split messages into turns. A turn starts at a user message and owns every
 * following assistant/tool message; that grouping is exactly what keeps a tool_use
 * and its tool_result inside one unit of degradation.
 */
export function groupTurns(messages) {
  const turns = [];
  for (const [index, m] of (messages ?? []).entries()) {
    const startsUser = classifyMessage(m) === 'user';
    if (startsUser || !turns.length) turns.push({ indices: [index], startsUser });
    else turns[turns.length - 1].indices.push(index);
  }
  return turns;
}

/** Keep head and tail: the end of a build or test log is what says what broke. */
function truncateMiddle(body, max) {
  const text = typeof body === 'string' ? body : String(body ?? '');
  const notice = chars => `\n[truncated ${chars} chars — head and tail preserved]\n`;
  const half = Math.max(1, Math.floor((max - notice(text.length).length) / 2));
  return `${text.slice(0, half)}${notice(text.length - half * 2)}${text.slice(-half)}`;
}

/**
 * Structured `context_budget` event for a degraded request. `degrade()` stays
 * pure (its `events` hold only `drop-turns` / `shrink-tool-result`), while the
 * request path emits this envelope so budget pressure is observable in logs.
 */
export function contextBudgetEvent({ projectedTokens = 0, budgetTokens = DEFAULT_BUDGET_TOKENS, events = [] } = {}) {
  const dropped = events.filter(e => e?.type === 'drop-turns').reduce((s, e) => s + (e.messages ?? 0), 0);
  const shrunk = events.filter(e => e?.type === 'shrink-tool-result').length;
  return { type: 'context_budget', tokens: projectedTokens, budget: budgetTokens, degraded: true, dropped, shrunk };
}

/**
 * Fit a request into `budgetTokens`, degrading in the documented order.
 * Returns a NEW message array plus `events`, the honest account of what was given up.
 */
export function degrade({ messages = [], tools = [], budgetTokens = DEFAULT_BUDGET_TOKENS } = {}) {
  const input = Array.isArray(messages) ? messages : [];
  let work = input.slice(); // never touches the caller's array or its message objects
  let projected = projectRequest({ messages: work, tools });
  if (projected.tokens <= budgetTokens) return { messages: work, degraded: false, events: [], projected };

  const turns = groupTurns(work);
  const lastTurn = turns[turns.length - 1];
  // The current input is the last turn: the newest user message and everything the
  // in-flight turn produced after it. A leading group with no user message has no
  // safe start boundary either, so dropping it could orphan what follows.
  const pinned = new Set();
  for (const turn of turns) {
    if (turn === lastTurn || !turn.startsUser) for (const i of turn.indices) pinned.add(i);
  }
  const systemIndices = work.map((m, i) => (classifyMessage(m) === 'system' ? i : -1)).filter(i => i >= 0);
  for (const i of systemIndices) pinned.add(i);

  const overflow = need => new Error(
    `Context budget exceeded: system prompt, tool schemas and the current input alone need ${need} tokens, `
    + `but the budget is ${budgetTokens}. Raise the budget or start a new session with /clear.`
  );
  // The true floor: everything pinned, with tool output already squeezed to the
  // floor it would end up at. Checking this BEFORE discarding anything means the
  // error names what the user cannot remove, and that a pinned-but-shrinkable tool
  // result is not mistaken for irreducible content.
  const floorTokens = () => projectRequest({
    messages: work.filter((_, i) => pinned.has(i))
      .map(m => (classifyMessage(m) === 'tool_result' && typeof m.content === 'string' && m.content.length > MIN_TOOL_CHARS
        ? { ...m, content: 'x'.repeat(MIN_TOOL_CHARS) } : m)),
    tools
  }).tokens;
  // Checked before anything is discarded, so the error names the true floor.
  const floor = floorTokens();
  if (floor > budgetTokens) throw overflow(floor);

  const events = [];
  const tokensNow = () => projectRequest({ messages: work, tools }).tokens;

  // Step 2 — drop whole oldest turns, oldest first. Turn granularity is what keeps
  // every tool_use next to its tool_result.
  const dropped = new Set();
  for (const turn of turns) {
    if (tokensNow() <= budgetTokens) break;
    if (turn.indices.some(i => pinned.has(i))) continue;
    for (const i of turn.indices) dropped.add(i);
  }
  if (dropped.size) {
    work = work.filter((_, i) => !dropped.has(i));
    events.push({ type: 'drop-turns', messages: dropped.size, remaining: work.length });
  }

  // Step 3 — only now shrink oversized tool output, largest first, down to a floor.
  for (let guard = 0; tokensNow() > budgetTokens && guard < 1000; guard++) {
    let target = -1;
    let longest = MIN_TOOL_CHARS;
    for (const [i, m] of work.entries()) {
      if (classifyMessage(m) !== 'tool_result' || typeof m.content !== 'string') continue;
      if (m.content.length > longest) { longest = m.content.length; target = i; }
    }
    if (target < 0) break;
    const next = Math.max(MIN_TOOL_CHARS, Math.floor(longest / 2));
    const before = work[target];
    const content = truncateMiddle(before.content, next);
    work = work.slice();
    work[target] = { ...before, content };
    events.push({ type: 'shrink-tool-result', tool_call_id: before.tool_call_id, from: before.content.length, to: content.length });
  }

  projected = projectRequest({ messages: work, tools });
  if (projected.tokens > budgetTokens) throw overflow(Math.max(projected.tokens, floorTokens()));
  return { messages: work, degraded: events.length > 0, events, projected };
}
