// Honest reporting of what a turn could NOT do.
//
// Why this exists: when the primary provider fails, cli/providerFallback.js answers
// the user's coding prompt with a chat-only paragraph and the turn then looks
// ordinary. Nothing in the transcript says "no tools ran" except one stderr line,
// which scrolls away in an interactive session and is absent entirely from --json.
// A user who asked for a refactor and got a paragraph has been misled, and there is
// no machine-readable fact anywhere to correct that.
//
// So this module does NOT replace the legacy surface — flow.js keeps emitting the
// same notice string and the same `degraded`/`toolsUsed` JSON keys, which existing
// scripts parse. It ADDS a structured `capability_lost` event carrying the same
// facts, so a caller can render them, log them, or fail loudly.
//
// The notice string is duplicated verbatim from providerFallback.fallbackNotice()
// rather than imported: providerFallback imports agent.js, and agent.js is exactly
// the module that will want to import this file, which would make a cycle. The
// duplication is pinned by a test in test/capability.test.js that asserts the two
// strings are identical, so the contract cannot drift silently.

import { safe } from './ui.js';

/**
 * The one user-visible notice printed when a degraded turn engages.
 *
 * LEGACY CONTRACT — byte-identical to providerFallback.fallbackNotice(). Do not
 * reword, re-wrap or "improve" this: users and scripts match on it. Any new
 * explanation belongs in a separate event, not in this string.
 */
export const DEGRADED_NOTICE = '[Degraded] Primary provider failed — the reply below is CHAT-ONLY: no tools ran, no files were read or changed, no commands executed. '
  + 'Retry, or run /clear and switch provider with --model, to do actual work.';

/**
 * What each lost capability means and what the user can do about it.
 *
 * The provider matters because a capability is lost for a *reason* — the anonymous
 * endpoint has no function calling — and the fix (a real key, --model) differs from
 * a rate limit's fix (wait).
 */
const CAPABILITIES = Object.freeze({
  tools: {
    label: 'tool execution',
    suggestion: 'Run again with a provider that supports function calling, or set OPENAI_API_KEY / --model.',
  },
  streaming: {
    label: 'streaming',
    suggestion: 'Use a provider that supports SSE streaming; the reply will arrive as one block.',
  },
  history: {
    label: 'conversation continuity',
    suggestion: 'The turn was saved locally; /clear and re-ask if the degraded reply lost context.',
  },
  provider: {
    label: 'the configured provider',
    suggestion: 'Check --model, OPENAI_BASE_URL and the provider key, then retry.',
  },
  model: {
    label: 'the configured model',
    suggestion: 'The provider does not serve this model id; pick another with --model.',
  },
});

export const LOST_CAPABILITIES = Object.freeze(Object.keys(CAPABILITIES));

/** Short, single-line rendering of one lost capability. */
function printable({ capability, provider, reason }) {
  const parts = [`capability_lost: ${capability}`];
  if (provider) parts.push(`(provider=${provider})`);
  parts.push(`— ${reason || 'unavailable'}`);
  return parts.join(' ');
}
/**
 * Build one structured, printable capability-loss event.
 *
 * Every free-text field is passed through `safe()` because `reason` originates in a
 * provider response body: an untrusted body carrying ANSI escapes or bidirectional
 * control characters must not repaint the terminal or hide the rest of the notice
 * from the user reading it.
 *
 * @param {{capability: string, provider?: string, reason?: string, suggestion?: string}} input
 * @returns {Readonly<{event: string, capability: string, label: string, provider: string,
 *                    reason: string, suggestion: string, text: string}>}
 */
export function capabilityEvent({ capability, provider = 'unknown', reason = '', suggestion } = {}) {
  const key = LOST_CAPABILITIES.includes(capability) ? capability : 'tools';
  const known = CAPABILITIES[key];
  const cleanProvider = safe(provider).slice(0, 80);
  const cleanReason = safe(reason).slice(0, 500);
  return Object.freeze({
    event: 'capability_lost',
    capability: key,
    label: known.label,
    provider: cleanProvider,
    reason: cleanReason,
    // An explicit suggestion wins: the caller knows the specific fix (e.g. which
    // 429 cooldown applied) and the generic text would only dilute it.
    suggestion: safe(suggestion ?? known.suggestion).slice(0, 300),
    text: printable({ capability: key, provider: cleanProvider, reason: cleanReason }),
  });
}

/**
 * Normalize the `lost` input, which callers build ad hoc (bare strings, event
 * objects, or undefined) so a single lost capability is never special-cased.
 */
function toEvents(lost) {
  const items = Array.isArray(lost) ? lost : lost ? [lost] : [];
  return items.map(item => capabilityEvent(typeof item === 'string'
    ? { capability: item }
    : { capability: 'tools', ...item }));
}

/**
 * Describe a degraded turn: what was retried, what was lost, and how to say it.
 *
 * The `degraded: true` / `toolsUsed: false` keys are the LEGACY contract emitted by
 * cli/flow.js and consumed by existing callers — reproduced here unchanged, and
 * never to be renamed or dropped. `event: 'capability_lost'` is the addition.
 *
 * @param {{retryAttempts?: number, lost?: Array, notice?: string}} [input]
 */
export function degradedTurn({ retryAttempts = 0, lost, notice = DEGRADED_NOTICE } = {}) {
  // Default to `tools`: the fallback path always strips tool_calls, so an empty
  // `lost` would silently report a degraded turn as having lost nothing.
  const events = toEvents(lost);
  const resolved = events.length > 0 ? events : [capabilityEvent({ capability: 'tools' })];
  return Object.freeze({
    event: 'capability_lost',
    degraded: true,
    toolsUsed: false,
    retryAttempts: Number.isFinite(retryAttempts) && retryAttempts > 0 ? Math.floor(retryAttempts) : 0,
    capabilities: Object.freeze(resolved.map(e => e.capability)),
    lost: Object.freeze(resolved),
    notice,
    text: `${notice}\n${resolved.map(e => `  ${e.text}${e.suggestion ? ` → ${e.suggestion}` : ''}`).join('\n')}`,
  });
}