/**
 * tasks.js — Lightweight SQLite-backed task tracker.
 * Supports todos, subtasks, tags, priorities, and completion tracking.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const DB_DIR = new URL('../data', import.meta.url).pathname;
mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'tasks.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
        tag TEXT DEFAULT 'general',
        char_key TEXT DEFAULT 'izuku',
        parent_id INTEGER DEFAULT NULL REFERENCES tasks(id),
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT DEFAULT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_tag ON tasks(tag);
      CREATE INDEX IF NOT EXISTS idx_tasks_char ON tasks(char_key);
    `);
  }
  return db;
}

// ── Tool definitions ────────────────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Create a new todo/task. Assign priority, tag, and optionally link as subtask.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title (required)' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low','medium','high','critical'], default: 'medium' },
          tag: { type: 'string', description: 'Tag like "feature","bug","refactor","research"' },
          parent_id: { type: 'integer', description: 'Parent task ID for subtasks' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List tasks filtered by status, tag, priority, or character.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending','in_progress','completed','cancelled'] },
          tag: { type: 'string' },
          priority: { type: 'string', enum: ['low','medium','high','critical'] },
          char_key: { type: 'string' },
          limit: { type: 'integer', default: 20 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update a task: change title, status, priority, or add description.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Task ID (required)' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['pending','in_progress','completed','cancelled'] },
          priority: { type: 'string', enum: ['low','medium','high','critical'] },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task and its subtasks. Irreversible.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Task ID (required)' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stats_tasks',
      description: 'Show task statistics: counts by status, priority distribution, recent activity.',
      parameters: {
        type: 'object',
        properties: {
          char_key: { type: 'string' },
        },
        required: [],
      },
    },
  },
];

// ── Executor ────────────────────────────────────────────────────────────────────
export async function execute(toolName, args) {
  try {
    const d = getDb();

    if (toolName === 'add_task') {
      const stmt = d.prepare(
        `INSERT INTO tasks (title, description, priority, tag, char_key, parent_id) VALUES (?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(args.title, args.description || '', args.priority || 'medium', args.tag || 'general', args.char_key || 'general', args.parent_id || null);
      return JSON.stringify({ success: true, id: info.lastInsertRowid, title: args.title, status: 'pending' });
    }

    if (toolName === 'list_tasks') {
      let sql = 'SELECT id, title, description, status, priority, tag, char_key, parent_id, created_at FROM tasks WHERE 1=1';
      const params = [];
      if (args.status) { sql += ' AND status = ?'; params.push(args.status); }
      if (args.tag) { sql += ' AND tag = ?'; params.push(args.tag); }
      if (args.priority) { sql += ' AND priority = ?'; params.push(args.priority); }
      if (args.char_key) { sql += ' AND (char_key = ? OR char_key IS NULL)'; params.push(args.char_key); }
      sql += ' ORDER BY priority DESC, created_at DESC LIMIT ?';
      params.push(args.limit || 20);
      const rows = d.prepare(sql).all(...params);
      return JSON.stringify({ tasks: rows.map(r => ({
        ...r, id: Number(r.id), parent_id: r.parent_id ? Number(r.parent_id) : null,
      })) });
    }

    if (toolName === 'update_task') {
      const updates = [];
      const params = [];
      if (args.title) { updates.push('title = ?'); params.push(args.title); }
      if (args.status) { updates.push('status = ?'); params.push(args.status); }
      if (args.priority) { updates.push('priority = ?'); params.push(args.priority); }
      if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
      if (updates.length === 0) return JSON.stringify({ error: 'No fields to update' });
      updates.push("updated_at = datetime('now')");
      params.push(args.id);
      d.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      const task = d.prepare('SELECT id, title, status, priority FROM tasks WHERE id = ?').get(args.id);
      return JSON.stringify({ success: true, task });
    }

    if (toolName === 'delete_task') {
      // Delete subtasks first, then the task
      d.prepare('DELETE FROM tasks WHERE parent_id = ?').run(args.id);
      const info = d.prepare('DELETE FROM tasks WHERE id = ?').run(args.id);
      return JSON.stringify({ success: true, deleted: info.changes > 0, id: args.id });
    }

    if (toolName === 'stats_tasks') {
      const total = d.prepare('SELECT COUNT(*) as c FROM tasks').get();
      const byStatus = d.prepare(`SELECT status, COUNT(*) as c FROM tasks GROUP BY status`).all();
      const byPriority = d.prepare(`SELECT priority, COUNT(*) as c FROM tasks GROUP BY priority`).all();
      const byTag = d.prepare(`SELECT tag, COUNT(*) as c FROM tasks GROUP BY tag`).all();
      const recent = d.prepare(`SELECT title, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5`).all();
      return JSON.stringify({
        total: total.c,
        by_status: Object.fromEntries(byStatus.map(r => [r.status, r.c])),
        by_priority: Object.fromEntries(byPriority.map(r => [r.priority, r.c])),
        by_tag: Object.fromEntries(byTag.map(r => [r.tag, r.c])),
        recent,
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
