import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Candidate DB locations, in priority order:
//  1. SWORD_DB_FILE env override (explicit wins)
//  2. <repo>/GET_API/server/data/freeapi.db  (this file lives at
//     <repo>/character-flow/character-flow/cli/backend.js, so ../../../GET_API)
//  3. Legacy/alternate checkouts that may hold the same unified key.
function candidateDbPaths() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const list = [];
  if (process.env.SWORD_DB_FILE?.trim()) list.push(process.env.SWORD_DB_FILE.trim());
  list.push(
    path.resolve(here, '../../../sword-server/data/sword.db'),
    '/home/sword/Documents/Characters/sword-server/data/sword.db',
    path.resolve(here, '../../../GET_API/server/data/freeapi.db'),
    '/home/sword/Documents/Characters/GET_API/server/data/freeapi.db',
  );
  return [...new Set(list)];
}

export function readLocalUnifiedKey() {
  const require = createRequire(import.meta.url);
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.error(`[backend] better-sqlite3 unavailable; falling back to g4f. (${err?.message ?? err})`);
    return null;
  }
  const tried = [];
  // sword-server mints its own token into its sqlite settings table — same read path.
  for (const file of candidateDbPaths()) {
    if (!existsSync(file)) { tried.push(`${file} (missing)`); continue; }
    let db;
    try {
      db = new Database(file, { readonly: true, fileMustExist: true });
      const value = db.prepare("SELECT value FROM settings WHERE key IN ('unified_api_key','api_token') ORDER BY key DESC").get()?.value;
      if (typeof value === 'string' && value.trim()) return value.trim();
      tried.push(`${file} (no unified_api_key row)`);
    } catch (err) {
      tried.push(`${file} (${err?.message ?? err})`);
    } finally { try { db?.close(); } catch { /* ignore */ } }
  }
  console.error(`[backend] Could not read local unified key; falling back to g4f. Tried: ${tried.join('; ')}`);
  return null;
}

export async function configureSwordBackend(env, readKey = readLocalUnifiedKey, opts = {}) {
  const allowSilentFallback = opts.allowSilentFallback === true;
  // Preserve intentionally configured providers, including test/mock endpoints.
  if (!env.SWORDCLI_BASE_URL && (env.OPENAI_BASE_URL || env.PROXY_HOST)) return { ...env };
  const base = new URL(env.SWORDCLI_BASE_URL || 'http://127.0.0.1:3101/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Backend URL must not contain credentials, query or fragment');
  // Local backends: sword-server (:3101) or the GET_API stack (:3001), both loopback only.
  const localBackend = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    && ['3001', '3101'].includes(base.port) && ['/', '/v1', '/v1/'].includes(base.pathname);
  if (!localBackend && !env.SWORDCLI_TOKEN) throw new Error('Set SWORDCLI_TOKEN for an explicitly configured backend; local credentials are never sent elsewhere.');
  if (!localBackend && base.protocol !== 'https:') throw new Error('Remote backends require HTTPS');
  const key = env.SWORDCLI_TOKEN || await readKey();
  if (typeof key !== 'string' || !key.trim()) {
    if (allowSilentFallback) return { ...env, _swordG4fFallback: true };
    throw new Error('Missing unified API key: start the local Sword backend or set OPENAI_BASE_URL/OPENAI_API_KEY/SWORDCLI_BASE_URL/SWORDCLI_TOKEN.');
  }
  const url = base.href.replace(/\/+$/, '');
  return { ...env, OPENAI_BASE_URL: url.endsWith('/v1') ? url : `${url}/v1`, OPENAI_API_KEY: key };
}
