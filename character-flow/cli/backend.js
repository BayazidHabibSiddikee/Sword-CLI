import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

function readLocalUnifiedKey() {
  const require = createRequire(new URL('../../../freellmapi/server/package.json', import.meta.url));
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(fileURLToPath(new URL('../../../freellmapi/server/data/freeapi.db', import.meta.url)), {
      readonly: true, fileMustExist: true
    });
    return db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key'").get()?.value;
  } catch {
    throw new Error('Cannot read local freellmapi configuration. Start its backend first, or set SWORDCLI_BASE_URL and SWORDCLI_TOKEN.');
  } finally { db?.close(); }
}

export async function configureSwordBackend(env, readKey = readLocalUnifiedKey) {
  // Preserve intentionally configured providers, including test/mock endpoints.
  if (!env.SWORDCLI_BASE_URL && (env.OPENAI_BASE_URL || env.PROXY_HOST)) return { ...env };
  const base = new URL(env.SWORDCLI_BASE_URL || 'http://127.0.0.1:3001/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Backend URL must not contain credentials, query or fragment');
  const localBackend = base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    && base.port === '3001' && ['/', '/v1', '/v1/'].includes(base.pathname);
  if (!localBackend && !env.SWORDCLI_TOKEN) throw new Error('Set SWORDCLI_TOKEN for an explicitly configured backend; local credentials are never sent elsewhere.');
  if (!localBackend && base.protocol !== 'https:') throw new Error('Remote backends require HTTPS');
  const key = env.SWORDCLI_TOKEN || await readKey();
  if (typeof key !== 'string' || !key.trim()) throw new Error('Missing freellmapi unified API key. Start the backend or configure SWORDCLI_TOKEN.');
  const url = base.href.replace(/\/+$/, '');
  return { ...env, OPENAI_BASE_URL: url.endsWith('/v1') ? url : `${url}/v1`, OPENAI_API_KEY: key };
}
