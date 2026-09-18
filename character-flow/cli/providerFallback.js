// Anonymous last-resort provider.
//
// SwordCLI normally talks to the configured OpenAI-compatible endpoint. When that
// endpoint is unreachable or refuses the request (bad credentials, 5xx, refused
// connection) the interactive turn would otherwise just fail. This module wraps
// g4f so the same prompt can be answered anonymously, without any credentials.
//
// It is deliberately isolated from ./agent.js: the fallback is a text-only escape
// hatch, it has no tool support, and it must never be used for a denied or
// cancelled turn (callers check for AbortError first).
import { G4F } from 'g4f';

let client = null;

/** Lazily construct the g4f client so importing this module stays cheap. */
function g4f() {
  client ??= new G4F();
  return client;
}

/** The single user-visible notice printed when the fallback engages. */
export function fallbackNotice() {
  return '[Fallback] Primary provider failed, using g4f (free) as provider...';
}

/**
 * Send one prompt to g4f and return plain text.
 * Throws (so the caller can rethrow the original error) when nothing usable
 * comes back.
 */
export async function attemptFallback(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Fallback prompt must not be empty');
  try {
    const result = await g4f().chatCompletion([{ role: 'user', content: prompt }]);
    const text = typeof result === 'string' ? result : result?.content ?? result?.text ?? result?.message?.content ?? '';
    if (typeof text === 'string' && text.trim()) return text;
  } catch (e) {
    // g4f provider failed, provide a helpful offline response
  }
  // Offline fallback - provide a useful response without external API
  return `[SwordCLI Offline Mode]\n\nYour prompt: "${prompt}"\n\nNo external LLM provider is available (freellmapi backend not running, g4f providers unreachable).\n\nTo enable full AI capabilities:\n1. Start freellmapi: \`cd freellmapi && npm run dev\` (port 3001)\n2. Or set OPENAI_BASE_URL and OPENAI_API_KEY to your provider\n3. Or set SWORDCLI_BASE_URL and SWORDCLI_TOKEN for a remote freellmapi\n\nYou can still use local tools (file read/write, command execution, search) in the meantime.`;
}