import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Local API databases that may hold the CLI's credential. Every candidate is
// inside this repository (the swordcli API background and the plain-node
// sword-server), so a fresh clone never depends on an external project.
const FREEAPI_DBS = [
  '../swordcli/server/data/freeapi.db',
];
const SWORD_SERVER_DB = '../sword-server/data/sword.db';

/** sword-server (:3101) keeps its token under `api_token`; freeapi backends (:3001) under `unified_api_key`. */
function dbCandidates(baseHref) {
  let port = '';
  try { port = new URL(baseHref).port; } catch { /* default order */ }
  const freeapi = FREEAPI_DBS.map(rel => ({ rel, key: 'unified_api_key' }));
  const swordServer = { rel: SWORD_SERVER_DB, key: 'api_token' };
  return port === '3101' ? [swordServer, ...freeapi] : [...freeapi, swordServer];
}

function readKeyFromDb({ rel, key }) {
  const dbUrl = new URL(rel, import.meta.url);
  if (!existsSync(fileURLToPath(dbUrl))) return null;
  let db;
  try {
    const require = createRequire(new URL('../package.json', dbUrl));
    const Database = require('better-sqlite3');
    db = new Database(fileURLToPath(dbUrl), { readonly: true, fileMustExist: true });
    const value = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  } finally { db?.close(); }
}

/**
 * Check a candidate key against the backend we're about to use, so a machine
 * running several local backends (each with its own unified key) picks the one
 * the target actually accepts. Returns null when the backend is unreachable.
 */
async function keyWorks(baseHref, key) {
  try {
    const base = baseHref.replace(/\/+$/, '');
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2500),
    });
    if (r.status === 401 || r.status === 403) return false;
    return r.status < 500;
  } catch { return null; }
}

export async function readLocalUnifiedKey(base = 'http://127.0.0.1:3001/v1') {
  const candidates = dbCandidates(base);
  const tried = [];
  const keys = [];
  for (const c of candidates) {
    tried.push(c.rel);
    const k = readKeyFromDb(c);
    if (k && !keys.includes(k)) keys.push(k);
  }
  if (!keys.length) {
    console.error(`[backend] Could not read local unified key (tried: ${tried.join(', ')}); falling back to g4f.`);
    return null;
  }
  if (keys.length === 1) return keys[0];
  for (const k of keys) if (await keyWorks(base, k) === true) return k;
  return keys[0]; // backend offline — best effort, candidate order decides
}

export async function configureSwordBackend(env, readKey = readLocalUnifiedKey, opts = {}) {
  const allowSilentFallback = opts.allowSilentFallback === true;
  // Preserve intentionally configured providers, including test/mock endpoints.
  if (!env.SWORDCLI_BASE_URL && (env.OPENAI_BASE_URL || env.PROXY_HOST)) return { ...env };
  const base = new URL(env.SWORDCLI_BASE_URL || 'http://127.0.0.1:3001/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Backend URL must not contain credentials, query or fragment');
  const localBackend = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    && (base.port === '3001' || base.port === '3101') && ['/', '/v1', '/v1/'].includes(base.pathname);
  if (!localBackend && !env.SWORDCLI_TOKEN) throw new Error('Set SWORDCLI_TOKEN for an explicitly configured backend; local credentials are never sent elsewhere.');
  if (!localBackend && base.protocol !== 'https:') throw new Error('Remote backends require HTTPS');
  const url = base.href.replace(/\/+$/, '');
  const openaiBase = url.endsWith('/v1') ? url : `${url}/v1`;
  const key = env.SWORDCLI_TOKEN || await readKey(openaiBase);
  if (typeof key !== 'string' || !key.trim()) {
    const reason = 'Missing unified API key: start the local Sword backend or set OPENAI_BASE_URL/OPENAI_API_KEY/SWORDCLI_BASE_URL/SWORDCLI_TOKEN.';
    if (allowSilentFallback) return { ...env, _swordG4fFallback: true, _swordG4fReason: reason };
    throw new Error(reason);
  }
  return { ...env, OPENAI_BASE_URL: openaiBase, OPENAI_API_KEY: key };
}
