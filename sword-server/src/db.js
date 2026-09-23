// Minimal Sword backend — independent of freellmapi.
// Data model (SQLite, sword.db):
//   providers(id, name, base_url, api_key, model, enabled, created_at)
//   sessions(id, title, workdir, model, created_at, updated_at)
//   messages(id, session_id, role, content, tool_calls, tool_call_id, name, created_at)
//   settings(key, value) — holds routing strategy + generated bearer token
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SWORD_DATA_DIR || path.join(here, '..', 'data');
export const DB_FILE = process.env.SWORD_DB_FILE || path.join(DATA_DIR, 'sword.db');

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !fs.existsSync(DB_FILE);
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      workdir TEXT NOT NULL DEFAULT '',
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      tool_call_id TEXT,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Single bearer token that gates the API (CLI + web send it as Bearer).
  // Generated once on first boot, printed to stdout, persisted in settings.
  let token = getSetting('api_token');
  if (!token) {
    token = 'sword-' + crypto.randomBytes(24).toString('hex');
    setSetting('api_token', token);
    console.log(`[sword-server] generated API token: ${token}`);
    console.log(`[sword-server] export it as SWORD_TOKEN, or paste it into the web UI.`);
  }
  if (fresh) console.log(`[sword-server] database created at ${DB_FILE}`);
  return db;
}

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Import provider keys from the freellmapi DB (one-time copy, then independent). */
export function importFromFreeDb(freeDbPath) {
  if (!freeDbPath || !fs.existsSync(freeDbPath)) return { imported: 0, reason: 'no freellmapi db found' };
  const { default: FreeDb } = { default: null };
  let src;
  try {
    src = new Database(freeDbPath, { readonly: true });
  } catch (e) {
    return { imported: 0, reason: String(e?.message ?? e) };
  }
  try {
    // freellmapi stores per-platform keys encrypted; we can't decrypt without
    // its ENCRYPTION_KEY — but rows carry platform + base_url hints. Instead we
    // copy what IS portable: the unified key is not needed (we mint our own),
    // and provider base URLs live in code. What we CAN do: record platform names
    // so the operator knows what to re-add. The real portable path is env vars.
    const tables = src.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    return { imported: 0, tables, note: 'keys are AES-encrypted in freellmapi; re-add via POST /api/providers or env' };
  } finally {
    src.close();
  }
}
