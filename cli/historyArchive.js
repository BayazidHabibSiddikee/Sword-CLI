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
import assert from 'node:assert/strict';

const __dirname = import.meta.dirname;
const RAG_DB_PATH = join(__dirname, 'brain', 'rag.db');

export const HISTORY_THRESHOLD = 200;
// Max characters we allow per archived document before truncating.
const DOC_MAX_CHARS = 4000;
// How many recent archive hits to mention in the injected hint.
const ARCHIVE_HINT_TOP_K = 3;

// A stub left behind in the retained window so the model can see that history went
// missing instead of silently believing the session just started. It is a `user`
// message on purpose: `loadSession` rejects any role outside user/assistant/tool, so
// a custom role would make the whole session unloadable.
export const PLACEHOLDER_MARK = '[archived-history]';

/** Is this message the archive placeholder stub rather than real conversation? */
export function isPlaceholder(m) {
  return Boolean(m) && m.role === 'user' && typeof m.content === 'string' && m.content.includes(PLACEHOLDER_MARK);
}

export function placeholderMessage(archivedCount = 0) {
  return {
    role: 'user',
    content: `${PLACEHOLDER_MARK} ${archivedCount} earlier turn(s) of this session were archived out of context to stay within the context budget. They are still searchable in the knowledge library under the \`history\` category — run \`save_to_rag\` or ask for retrieval if a decision from earlier matters.`
  };
}

/**
 * Split the log so the retained tail is at least `keepCount` messages and the cut
 * never lands inside a (tool_use, tool_result) group. `messages.slice(n)` can strand
 * a `tool` message whose `tool_use` was archived away, which providers reject; the
 * cut is therefore moved backwards until the tail starts at a message that does not
 * depend on anything in the head.
 */
export function splitAtTurnBoundary(messages, keepCount) {
  // keepCount is a LOWER bound on the retained window, not an exact split: the cut is
  // moved backwards as needed and a non-positive request keeps everything (archive
  // nothing), which is what `slice(len - 0)` used to do.
  const requested = Number.isSafeInteger(keepCount) ? keepCount : 0;
  let split = requested > 0 ? Math.max(0, messages.length - requested) : 0;
  // A `tool` result at the head of the tail is orphaned by this cut: back up past
  // every consecutive tool result, and past the assistant tool_calls that issued them.
  while (split > 0 && split < messages.length) {
    const first = messages[split];
    if (first?.role !== 'tool') break;
    split--;
    while (split > 0 && Array.isArray(messages[split]?.tool_calls) && messages[split].tool_calls.length) split--;
  }
  // Guard: adjacency alone is not proof. A hand-crafted or corrupted session log
  // can interleave a result away from its call, so verify the cut directly —
  // every tool_result in the retained tail must find its tool_use ALSO in the
  // tail — and back up until it holds. Providers reject an orphaned result, and
  // the archive must never produce one.
  split = backUpPastOrphanedResults(messages, split);
  const result = { head: messages.slice(0, split), tail: messages.slice(split) };
  // Turn-boundary invariant: no tool_result in the tail may point to a tool_use
  // in the head. Providers reject orphaned results, so fail loudly in dev/test
  // rather than emitting a request that cannot work.
  assertNoOrphanedToolPairs(messages, result.tail, split);
  return result;
}

function assertNoOrphanedToolPairs(messages, tail, split) {
  const headIds = new Set();
  for (let i = 0; i < split; i++) {
    const m = messages[i];
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const call of m.tool_calls) {
        if (typeof call?.id === 'string') headIds.add(call.id);
      }
    }
  }
  const tailIds = new Set();
  for (const m of tail) {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const call of m.tool_calls) {
        if (typeof call?.id === 'string') tailIds.add(call.id);
      }
    }
  }
  for (const m of tail) {
    if (m?.role !== 'tool' || typeof m.tool_call_id !== 'string') continue;
    // A result whose tool_use is nowhere in the log is pre-corrupted input, not
    // a cut this function made — only assert against pairs we could have split.
    if (!headIds.has(m.tool_call_id) && !tailIds.has(m.tool_call_id)) continue;
    assert.ok(
      tailIds.has(m.tool_call_id),
      `splitAtTurnBoundary orphaned tool_result ${m.tool_call_id} at cut ${split}`
    );
  }
}

/**
 * Largest cut ≤ `split` at which no tail tool_result points back to a tool_use
 * in the head. Each pass moves the cut strictly backwards (to before the
 * offending call), so this terminates even on adversarial input.
 */
function backUpPastOrphanedResults(messages, split) {
  const useIndex = new Map();
  for (const [index, m] of messages.entries()) {
    if (m?.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue;
    for (const call of m.tool_calls) {
      if (typeof call?.id === 'string' && !useIndex.has(call.id)) useIndex.set(call.id, index);
    }
  }
  let cut = split;
  while (cut > 0) {
    let move = -1;
    for (let i = cut; i < messages.length && move < 0; i++) {
      const m = messages[i];
      if (m?.role !== 'tool' || typeof m.tool_call_id !== 'string') continue;
      const usedAt = useIndex.get(m.tool_call_id);
      if (usedAt !== undefined && usedAt < cut) move = usedAt;
    }
    if (move < 0) break;
    cut = move;
  }
  return cut;
}

/** Compress a sequence of raw messages into one or more RAG-ready docs. */
export function compressTurns(messages) {
  // Walk messages in pairs: user text followed by the assistant turn (text + tool calls).
  // Placeholder stubs are dropped first: re-archiving them would write a document
  // about the archive into the archive, and each pass would grow the stub's count.
  const source = (messages ?? []).filter(m => !isPlaceholder(m));
  const docs = [];
  let i = 0;
  while (i < source.length) {
    const user = source[i];
    if (!user || user.role !== 'user' || typeof user.content !== 'string') {
      i++; continue;
    }
    // Collect any assistant + tool-result blocks that belong to this user turn.
    const blocks = [{ role: 'user', content: user.content }];
    i++;
    while (i < source.length && source[i].role === 'assistant') {
      blocks.push(source[i]);
      i++;
    }
    while (i < source.length && source[i].role === 'tool') {
      blocks.push(source[i]);
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

/**
 * Persist compressed docs into the local RAG database, then discard them.
 *
 * The retained window is cut at a turn boundary and carries exactly ONE placeholder
 * stub at its head, so the model can tell that context was archived rather than
 * assume the session just began — and so a second archive pass cannot stack stubs.
 * Returns `{ archived, keepCount, kept }` where `keepCount === kept.length`; callers
 * must use `kept` (not a re-slice of the input) so the stub survives.
 */
export async function archiveMessages(messages, keepCount, archivedBefore = 0) {
  if (messages.length <= HISTORY_THRESHOLD) return { archived: 0, keepCount: messages.length, kept: messages.slice() };
  // Split: keep the tail, archive the head — never inside a tool_use/tool_result pair.
  const { head, tail } = splitAtTurnBoundary(messages, keepCount);
  const docs = compressTurns(head);
  if (!docs.length) return { archived: 0, keepCount: messages.length, kept: messages.slice() };
  await ensureRagDb();
  const { RagEngine } = await import(join(__dirname, './brain/rag.js')).catch(() => null);
  if (!RagEngine) return { archived: 0, keepCount: messages.length, kept: messages.slice(), reason: 'RagEngine unavailable' };
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
  if (!written) return { archived: 0, keepCount: messages.length, kept: messages.slice() };
  const stub = placeholderMessage(archivedBefore + written);
  const kept = tail.some(isPlaceholder) ? tail : [stub, ...tail];
  return { archived: written, keepCount: kept.length, kept };
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
