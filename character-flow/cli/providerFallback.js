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
let freeDirectUrl = process.env.SWORD_FREE_FALLBACK_URL?.trim() || '';

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
  return '[Fallback] Primary provider failed, using free fallback providers...';
}

/**
 * Best-effort text extraction from a provider response.
 */
function extractText(result) {
  const text = typeof result === 'string' ? result : result?.content ?? result?.text ?? result?.message?.content ?? '';
  if (typeof text === 'string' && text.trim()) return text;
  return '';
}

/**
 * Try g4f first, then optional direct free OpenAI-compatible endpoints.
 * The fallback keeps g4f in the chain; it does not remove it.
 */
export async function attemptFallback(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Fallback prompt must not be empty');

  const errors = [];
  // 1) g4f first; when a test mock is installed, use it as the g4f client
  try {
    const client = await g4f();
    const messages = [{ role: 'user', content: prompt }];
    let result;
    if (typeof client.chatCompletion === 'function') result = await client.chatCompletion(messages);
    else if (typeof client.createChatCompletion === 'function') result = await client.createChatCompletion(messages);
    else if (typeof client.chat === 'function') result = await client.chat(messages);
    else throw new Error('g4f client missing chat method');
    const text = extractText(result);
    if (text) return text;
  } catch (e) {
    errors.push({ provider: 'g4f', error: e instanceof Error ? e.message : String(e) });
  }

  // 2) optional direct free fallback endpoint, no auth required
  const urls = [freeDirectUrl].filter(Boolean);
  for (const raw of urls) {
    try {
      const base = raw.replace(/\/+$/, '');
      const url = new URL(`${base}/chat/completions`);
      const result = await createRequest({
        baseUrl: url.href.replace(/\/chat\/completions$/, ''),
        apiKey: 'none',
        model: url.searchParams.get('model') || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        signal: undefined,
        timeout: 120000,
        onToken: undefined,
      });
      const text = extractText(result);
      if (text) return text;
    } catch (e) {
      errors.push({ provider: raw, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const reason = errors.map(e => `- ${e.provider}: ${e.error}`).join('\n') || 'unknown';
  // Offline fallback - provide a useful response without external API
  return `[SwordCLI Offline Mode]\n\nYour prompt: "${prompt}"\n\nNo external LLM provider is available.\nTried:\n${reason}\n\nTo enable full AI capabilities:\n1. Start the local Sword backend: \`cd freellmapi/server && npm run dev\` (port 3001)\n2. Or set OPENAI_BASE_URL and OPENAI_API_KEY to your provider\n3. Or set SWORDCLI_BASE_URL and SWORDCLI_TOKEN for a remote Sword backend\n4. Or set SWORD_FREE_FALLBACK_URL to an OpenAI-compatible free endpoint\n\nYou can still use local tools (file read/write, command execution, search) in the meantime.`;
}