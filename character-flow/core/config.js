/**
 * core/config.js — central runtime state + API key resolution.
 *
 * Resolves the API key WITHOUT hardcoding it:
 *   1. env OPENAI_API_KEY
 *   2. CLI reads the local Sword backend unified key from
 *      `freellmapi/server/data/freeapi.db` in `cli/backend.js`
 */

const SWORD_DATA_DIR = '/home/sword/Documents/Characters/character-flow/character-flow/freellmapi/server/data';

export const CONFIG = {
  /** Base URL of the freellmapi OpenAI-compatible proxy. */
  proxyBase: 'http://localhost:3001/v1',
  /** Mutable runtime state shared by CLI, web server and agent. */
  state: {
    character: 'izuku',
    model: 'auto',
    effort: 'medium',
    teamMode: false,
    externalApi: ''
  },
  /** Short name → brain id. */
  CHARACTER_ALIASES: {
    monk: 'monk_maecenas',
    rishad: 'prince_rishad',
    turing: 'turing_voss',
    sable: 'sable_chen',
    ada: 'ada_vance',
    kael: 'kael_vector',
    izuku: 'izuku',
    mahina: 'mahina',
    muhan: 'muhan',
    plastos: 'plastos'
  }
};

/** Guidance string per effort level (drives system prompts). */
export function effortText(effort) {
  switch (effort) {
    case 'low':
      return 'Answer as briefly as possible. One or two short sentences, no preamble, no lists unless strictly asked.';
    case 'high':
      return 'Think carefully and answer thoroughly: analyze the request, consider alternatives and edge cases, then give a detailed, well-structured answer.';
    case 'medium':
    default:
      return 'Balance speed and depth: give a clear, focused answer with the key reasoning and any important caveats, without excessive detail.';
  }
}

/**
 * Parse a .env file with KEY=VALUE lines into a plain object.
 * Tolerant of blank lines, 'export ' prefixes, quotes and comments.
 * Exported for testability/reuse.
 */
export function parseEnvFile(text) {
  const out = {};
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const noExport = line.startsWith('export ') ? line.slice(7) : line;
    const eq = noExport.indexOf('=');
    if (eq <= 0) continue;
    const key = noExport.slice(0, eq).trim();
    let value = noExport.slice(eq + 1).trim();
    if (value.length >= 2) {
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }
    }
    out[key] = value;
  }
  return out;
}

/**
 * Async — resolve the proxy API key.
 * Priority: env OPENAI_API_KEY. The local unified key is read from the
 * backend SQLite DB by `cli/backend.js`; this module does not duplicate
 * that behavior.
 * @returns {Promise<string|null>} resolved key, or null if none found.
 */
export async function loadConfig() {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;
  return null;
}
