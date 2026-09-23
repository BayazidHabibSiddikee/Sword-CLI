/**
 * core/llm.js — unified chat entry point.
 *
 * Tries the local Sword backend OpenAI-compatible proxy first
 * (POST ${CONFIG.proxyBase}/chat/completions with Bearer auth). On ANY failure
 * — network error, non-200 status, malformed body — falls back to g4f so the
 * CLI always produces a reply. Never throws when g4f succeeds.
 */

import { CONFIG, loadConfig } from './config.js';

let cachedKey = null;

/**
 * Resolve (and memoize) the proxy API key.
 * @returns {Promise<string|null>}
 */
async function resolveKey() {
  if (cachedKey) return cachedKey;
  cachedKey = await loadConfig();
  return cachedKey;
}

/** Base URL + key for any module that wants to call the proxy itself. */
export async function getProxyConfig() {
  return { baseURL: CONFIG.proxyBase, apiKey: await resolveKey() };
}

/** Safely parse a JSON body; returns null instead of throwing. */
async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Wrap fetch errors so a network failure falls through to g4f. */
async function fetchSafely(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error(`[llm] proxy request failed: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Extract plain text content from a non-streaming chat-completions response.
 * Handles standard and defensive shapes; returns null when nothing usable.
 */
function extractContent(payload) {
  const choice = payload?.choices?.[0] ?? null;
  return choice?.message?.content ?? choice?.text ?? null;
}

/**
 * Single chat completion.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Array<object>} [tools] OpenAI-style tool definitions (sent only when non-empty)
 * @param {{model?: string}} [opts]
 * @returns {Promise<{content: string, provider: 'proxy'|'g4f'}>}
 */
export async function chat(messages, tools = [], opts = {}) {
  const model = opts.model ?? CONFIG.state.model;
  const key = await resolveKey();

  const body = {
    model,
    messages,
    stream: false
  };
  if (tools && tools.length) body.tools = tools;

  if (key) {
    const response = await fetchSafely(`${CONFIG.proxyBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

    if (response) {
      const payload = response.ok ? await parseJsonSafely(response) : null;
      const content = extractContent(payload);
      if (content != null && content !== '') {
        return { content, provider: 'proxy' };
      }
      console.error(
        `[llm] proxy did not return usable content (status ${response.status}) — falling back to g4f`
      );
    }
  } else {
    console.error('[llm] no API key resolved — falling back to g4f');
  }

  // Fallback: never throw if g4f works.
  try {
    const { G4F } = await import('g4f');
    const g4f = new G4F();
    const content = await g4f.chatCompletion(messages);
    return { content, provider: 'g4f' };
  } catch (err) {
    throw new Error(`chat failed: proxy unreachable and g4f fallback failed (${err?.message ?? err})`);
  }
}
