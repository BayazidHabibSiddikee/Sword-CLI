// Anonymous last-resort provider.
//
// SwordCLI normally talks to the configured OpenAI-compatible endpoint. When that
// endpoint is unreachable or refuses the request (bad credentials, 5xx, refused
// connection) the interactive turn would otherwise just fail. This module wraps
// g4f and optional free OpenAI-compatible fallbacks so the same prompt can be
// answered anonymously, without any credentials.
//
// It is deliberately isolated from ./agent.js: the fallback is a text-only escape
// hatch, it has no tool support, and it must never be used for a denied or
// cancelled turn (callers check for AbortError first).

import { createRequest } from './agent.js';

let mockFactory = null;

/**
 * Free OpenAI-compatible fallback endpoints, read lazily so tests and runtime
 * env changes are honored. Accepts a comma-separated list of base URLs; each
 * may carry ?model=<id> to pin the model (defaults to gpt-4o-mini).
 */
function freeFallbackUrls() {
  return (process.env.SWORD_FREE_FALLBACK_URL?.trim() || '')
    .split(',').map(raw => raw.trim()).filter(Boolean);
}

/** Lazily construct the g4f client so importing this module stays cheap. */
async function g4f() {
  if (mockFactory) return mockFactory;
  const { G4F } = await import('g4f');
  return new G4F();
}

/** Test-only override for the g4f client factory. */
export function setG4fFactory(factory) {
  mockFactory = factory || null;
}

/** The single user-visible notice printed when the fallback engages. */
export function fallbackNotice() {
  // Be explicit that the reply below is chat-only. The old wording implied the agent
  // was still working; a coding task silently loses its tools here and the user has
  // no way to tell that from a completed answer.
  return '[Degraded] Primary provider failed — the reply below is CHAT-ONLY: no tools ran, no files were read or changed, no commands executed. '
    + 'Retry, or run /clear and switch provider with --model, to do actual work.';
}

/**
 * Best-effort text extraction from a provider response.
 * Handles plain strings, {content}|{text}|{message.content} wrappers and the
 * OpenAI chat-completions shape ({choices:[{message:{content}}]}).
 */
function extractText(result) {
  const text = typeof result === 'string'
    ? result
    : result?.choices?.[0]?.message?.content ?? result?.content ?? result?.text ?? result?.message?.content ?? '';
  if (typeof text === 'string' && text.trim()) return text;
  return '';
}

/** Reject after `ms` so a hung provider cannot stall the whole fallback chain. */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * Try g4f first, then optional direct free OpenAI-compatible endpoints.
 * The fallback keeps g4f in the chain; it does not remove it.
 *
 * @param {string} prompt
 * @param {{g4fTimeoutMs?: number, directTimeoutMs?: number}} [opts]
 */
/**
 * g4f request factory for use by cli/flow.js.
 * g4f doesn't support tools, so tool_calls are stripped and the result is
 * returned in the same shape as createRequest() from cli/agent.js.
 *
 * This keeps the g4f client in one place (providerFallback.js) instead of
 * duplicating it across cli/flow.js, cli/tui.js and core/llm.js.
 */
export function createG4fRequest(tools, signal, onToken) {
  let g4fClient = null;
  return async messages => {
    const { G4F } = await import('g4f');
    g4fClient ??= new G4F();
    const plainMessages = messages.map(m => ({
      role: m.role === 'tool' ? 'assistant' : m.role,
      content: m.content || (m.tool_calls ? '[Tool call results omitted]' : '')
    })).filter(m => m.content);
    const result = await g4fClient.chatCompletion(plainMessages, {
      model: 'gpt-4o-mini',
    });
    const text = typeof result === 'string' ? result : result?.content ?? result?.text ?? result?.message?.content ?? '';
    if (typeof onToken === 'function' && text) onToken(text);
    return { choices: [{ message: { role: 'assistant', content: text || 'No response from g4f' } }] };
  };
}

export async function attemptFallback(prompt, opts = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Fallback prompt must not be empty');
  const g4fTimeoutMs = Number.isFinite(opts.g4fTimeoutMs) && opts.g4fTimeoutMs > 0 ? opts.g4fTimeoutMs : 45000;
  const directTimeoutMs = Number.isFinite(opts.directTimeoutMs) && opts.directTimeoutMs > 0 ? opts.directTimeoutMs : 30000;

  const errors = [];
  // 1) g4f first; when a test mock is installed, use it as the g4f client.
  //    Guarded by a timeout: dead free providers can hang for minutes while
  //    g4f cycles retries, which would stall the whole fallback chain.
  try {
    const client = await g4f();
    const messages = [{ role: 'user', content: prompt }];
    let result;
    if (typeof client.chatCompletion === 'function') result = await withTimeout(client.chatCompletion(messages), g4fTimeoutMs, 'g4f');
    else if (typeof client.createChatCompletion === 'function') result = await withTimeout(client.createChatCompletion(messages), g4fTimeoutMs, 'g4f');
    else if (typeof client.chat === 'function') result = await withTimeout(client.chat(messages), g4fTimeoutMs, 'g4f');
    else throw new Error('g4f client missing chat method');
    const text = extractText(result);
    if (text) return text;
  } catch (e) {
    errors.push({ provider: 'g4f', error: e instanceof Error ? e.message : String(e) });
  }

  // 2) optional direct free fallback endpoints, no auth required.
  // createRequest(config) returns a request closure — it must be invoked with
  // the message list; awaiting it alone would never send the HTTP request.
  const urls = freeFallbackUrls();
  for (const raw of urls) {
    try {
      const base = raw.replace(/\?.*$/, '').replace(/\/+$/, '');
      const model = new URL(raw).searchParams.get('model') || 'gpt-4o-mini';
      const request = createRequest({
        url: `${base}/chat/completions`,
        key: '',
        model,
      });
      const result = await withTimeout(request([{ role: 'user', content: prompt }]), directTimeoutMs, raw);
      const text = extractText(result);
      if (text) return text;
    } catch (e) {
      errors.push({ provider: raw, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const reason = errors.map(e => `- ${e.provider}: ${e.error}`).join('\n') || 'unknown';
  // No LLM is available. Be honest: without a working provider nothing can call tools,
  // read files or run commands. The old message falsely implied local tools still worked.
  return `[SwordCLI: No provider available]\n\nYour prompt: "${prompt}"\n\nNo LLM provider is reachable — all providers failed:\n${reason}\n\nWithout a working provider the agent CANNOT read files, write code, or run commands.\nRun \`sword doctor\` for an automated diagnosis and fix steps, or configure a provider:\n  • OPENAI_BASE_URL + OPENAI_API_KEY (any OpenAI-compatible endpoint)\n  • SWORDCLI_BASE_URL + SWORDCLI_TOKEN  (remote Sword backend)\n  • Start the local stack: \`./sword.mjs up\`  then re-run sword`;
}