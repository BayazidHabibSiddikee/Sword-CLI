import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function readLocalUnifiedKey() {
  const require = createRequire(new URL('../swordcli/server/package.json', import.meta.url));
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(fileURLToPath(new URL('../swordcli/server/data/freeapi.db', import.meta.url)), {
      readonly: true, fileMustExist: true
    });
    const value = db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key'").get()?.value;
    if (typeof value === 'string' && value.trim()) return value;
    return null;
  } catch (err) {
    console.error(`[backend] Could not read local unified key; falling back to g4f. (${err?.message ?? err})`);
    return null;
  } finally { db?.close(); }
}

export async function configureSwordBackend(env, readKey = readLocalUnifiedKey, opts = {}) {
  const allowSilentFallback = opts.allowSilentFallback === true;
  // Preserve intentionally configured providers, including test/mock endpoints.
  if (!env.SWORDCLI_BASE_URL && (env.OPENAI_BASE_URL || env.PROXY_HOST)) return { ...env };
  const base = new URL(env.SWORDCLI_BASE_URL || 'http://127.0.0.1:3001/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Backend URL must not contain credentials, query or fragment');
  const localBackend = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    && base.port === '3001' && ['/', '/v1', '/v1/'].includes(base.pathname);
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
