#!/usr/bin/env node
/**
 * vault.js — Persistent per-character note storage (SQLite).
 * Characters can save/read/delete structured notes that persist across sessions.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'vault.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notes_char ON notes(character);
  CREATE INDEX IF NOT EXISTS idx_notes_cat ON notes(category);
`);

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: 'Save a note to persistent vault storage. Tags are comma-separated.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Note content' },
          tags: { type: 'string', description: 'Comma-separated tags (e.g. "research,meeting,idea")' },
          category: { type: 'string', description: 'Category: general, research, meeting, idea, code', default: 'general' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Read a note by ID or search by title.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Note ID to read directly' },
          title_search: { type: 'string', description: 'Search notes by title substring' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List notes filtered by category, tag, or recency.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          tag: { type: 'string', description: 'Filter by tag' },
          limit: { type: 'integer', description: 'Max notes to return', default: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note by ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Note ID to delete' },
        },
        required: ['id'],
      },
    },
  },
];

export async function execute(toolName, args, character) {
  if (!character) return JSON.stringify({ error: 'Character name required' });
  try {
    if (toolName === 'save_note') {
      const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
      const stmt = db.prepare(`INSERT INTO notes (character, title, content, tags, category) VALUES (?, ?, ?, ?, ?)`);
      const info = stmt.run(character, args.title, args.content, JSON.stringify(tags), args.category || 'general');
      return JSON.stringify({ success: true, id: info.lastInsertRowid, title: args.title });
    }
    else if (toolName === 'read_note') {
      if (args.id) {
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND character = ?').get(args.id, character);
        return JSON.stringify(note || { error: 'Note not found' });
      }
      if (args.title_search) {
        const notes = db.prepare(`SELECT id, title, content, tags, category, created_at FROM notes WHERE character = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 5`)
          .all(character, `%${args.title_search}%`);
        return JSON.stringify(notes);
      }
      return JSON.stringify({ error: 'Provide id or title_search' });
    }
    else if (toolName === 'list_notes') {
      let sql = 'SELECT id, title, content, tags, category, created_at FROM notes WHERE character = ?';
      const params = [character];
      if (args.category) { sql += ' AND category = ?'; params.push(args.category); }
      if (args.tag) { sql += ' AND tags LIKE ?'; params.push(`%${args.tag}%`); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(args.limit || 20);
      const notes = db.prepare(sql).all(...params);
      return JSON.stringify({ count: notes.length, notes });
    }
    else if (toolName === 'delete_note') {
      db.prepare('DELETE FROM notes WHERE id = ? AND character = ?').run(args.id, character);
      return JSON.stringify({ success: true, deleted: args.id });
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
  return JSON.stringify({ error: 'Unknown tool' });
}

export function getStats() {
  return db.prepare('SELECT character, COUNT(*) as total FROM notes GROUP BY character').all();
}
