// Session-history archiving into the local RAG engine.
//
// Long sessions grow the message history unboundedly, which exhausts context
// windows and makes every request slower and more expensive. This module solves
// that by sliding a retention window over the message log: once the history
// exceeds `HISTORY_THRESHOLD` messages, older turns are compressed into RAG
// documents so they stop occupying context but remain retrievable on demand.
//
// Compression strategy — one document per agent turn:
//   - One user prompt + the following assistant text + all tool calls / results
//     from that turn are folded into a single Markdown section.
//   - Tool call summaries capture name + first line of output; full content is
//     omitted because it would defeat the purpose of compressing the log.
//   - Category is `history/<date>` so documents are naturally grouped in RAG.
//
// Retrieval hook — every turn past the threshold also injects a short
// `ARCHIVE_BLOCK` into the system prompt so the model knows it can query the
// archive when relevant prior context would help. No UI is shown; this is purely
// an instruction to the LLM about its capabilities.
//
// Safety: reads/writes only through the local RagEngine singleton. No paths, no
// shell, no external network.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const __dirname = import.meta.dirname;
const RAG_DB_PATH = join(__dirname, 'brain', 'rag.db');

export const HISTORY_THRESHOLD = 200;
// Max characters we allow per archived document before truncating.
const DOC_MAX_CHARS = 4000;
// How many recent archive hits to mention in the injected hint.
const ARCHIVE_HINT_TOP_K = 3;

/** Compress a sequence of raw messages into one or more RAG-ready docs. */
export function compressTurns(messages) {
  // Walk messages in pairs: user text followed by the assistant turn (text + tool calls).
  const docs = [];
  let i = 0;
  while (i < messages.length) {
    const user = messages[i];
    if (!user || user.role !== 'user' || typeof user.content !== 'string') {
      i++; continue;
    }
    // Collect any assistant + tool-result blocks that belong to this user turn.
    const blocks = [{ role: 'user', content: user.content }];
    i++;
    while (i < messages.length && messages[i].role === 'assistant') {
      blocks.push(messages[i]);
      i++;
    }
    while (i < messages.length && messages[i].role === 'tool') {
      blocks.push(messages[i]);
      i++;
    }
    const content = buildTurnSummary(blocks);
    if (content.length < 40) continue; // skip trivially empty turns.
    const title = extractTitle(blocks);
    docs.push({ category: 'history', title, content });
  }
  return docs;
}

function buildTurnSummary(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (b.role === 'user') {
      parts.push(`## User\n${b.content}\n`);
    } else if (b.role === 'assistant') {
      if (b.content) parts.push(`**Response:** ${String(b.content).slice(0, 600)}\n`);
      if (Array.isArray(b.tool_calls)) {
        for (const tc of b.tool_calls) {
          const args = safeJson(tc.function?.arguments);
          parts.push(`- \`call ${tc.function.name}(${args.slice(0, 200)})\`\n`);
        }
      }
    } else if (b.role === 'tool') {
      const snippet = String(b.content ?? '').replace(/\s+/g, ' ').slice(0, 300);
      parts.push(`  <tool ${b.tool_call_id}: ${snippet}>\n`);
    }
  }
  return parts.join('\n').trim();
}

function extractTitle(blocks) {
  const first = blocks.find(b => b.role === 'user');
  if (!first?.content) return 'archived turn';
  const line = first.content.trim().split(/\n/)[0];
  return line.slice(0, 120) || 'archived turn';
}

function safeJson(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v ?? null); } catch { return String(v ?? ''); }
}

/** Persist compressed docs into the local RAG database, then discard them. */
export async function archiveMessages(messages, keepCount) {
  if (messages.length <= HISTORY_THRESHOLD) return { archived: 0, keepCount: messages.length };
  // Split: keep the tail, archive the head.
  const archive = messages.slice(0, messages.length - keepCount);
  const keep = messages.slice(messages.length - keepCount);
  const docs = compressTurns(archive);
  if (!docs.length) return { archived: 0, keepCount: messages.length };
  await ensureRagDb();
  const { RagEngine } = await import(join(__dirname, '../brain/rag.js')).catch(() => null);
  if (!RagEngine) return { archived: 0, keepCount: messages.length, reason: 'RagEngine unavailable' };
  const engine = new RagEngine(RAG_DB_PATH);
  let written = 0;
  try {
    for (const doc of docs) {
      const id = engine.insertKnowledge(doc.category, doc.title, doc.content.slice(0, DOC_MAX_CHARS), 'history_archive');
      if (id) written++;
    }
  } finally {
    try { engine.db?.close(); } catch { /* best effort */ }
  }
  return { archived: written, keepCount: keep.length, kept: keep };
}

async function ensureRagDb() {
  const fs = await import('node:fs/promises');
  const dir = join(__dirname, 'brain');
  await mkdir(dir, { recursive: true });
  const db = join(dir, 'rag.db');
  if (!(await fs.stat(db).catch(() => false))) {
    // Create an empty WAL-free SQLite shell so RagEngine can open it immediately.
    const { execSync } = await import('node:child_process');
    try { execSync(`sqlite3 "${db}" "CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,category TEXT,title TEXT,content TEXT,embedding BLOB,note TEXT,created_at TEXT)"`, { stdio: 'ignore' }); } catch { /* sqlite may not be installed; RagEngine creates tables itself on insert */ }
  }
}

/** Injected hint appended to the system prompt when archive is active. */
export function archiveHint(archivedCount) {
  if (!archivedCount) return '';
  return `\n\n## Archived History\nYou have ${archivedCount} prior conversation turns stored in the local knowledge library under the \`history\` category. If the current task references past decisions, files changed earlier, or context from before this turn, run \`save_to_rag\` to persist anything new, or rely on the RAG system automatically recalling relevant snippets during this session.`;
}
