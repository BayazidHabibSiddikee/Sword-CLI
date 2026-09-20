// Minimal agent loop: user msg -> (LLM turn -> tool calls -> results)* -> answer.
// Persists every step to sessions/messages so turns are resumable.
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { chat } from '../providers.js';
import { toolDefs, execTool } from './tools.js';

const SYSTEM = [
  'You are Sword, a coding agent inside one working directory (the session workdir).',
  'Inspect before changing: read_file / list_dir / search before edit_file or write_file.',
  'Use run_shell for builds, tests, git. Keep answers concise.',
].join('\n');

export function createSession({ title, workdir, model }) {
  const id = randomUUID();
  getDb().prepare('INSERT INTO sessions(id, title, workdir, model) VALUES(?, ?, ?, ?)').run(id, title || 'session', workdir, model || null);
  return getSession(id);
}

export function getSession(id) {
  const s = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!s) throw Object.assign(new Error('session not found'), { status: 404 });
  s.messages = getDb().prepare('SELECT role, content, tool_calls, tool_call_id, name FROM messages WHERE session_id = ? ORDER BY id').all(id);
  // CLI shared-mode expects a monotonically bumpable revision on every payload.
  s.revision = s.messages.length;
  return s;
}

/** Full-history replace (CLI shared-mode PUT /sessions/:id/messages). */
export function replaceMessages(id, messages) {
  const db = getDb();
  db.transaction(msgs => {
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    for (const m of msgs) {
      db.prepare('INSERT INTO messages(session_id, role, content, tool_calls, tool_call_id, name) VALUES(?, ?, ?, ?, ?, ?)').run(
        id, m.role, m.content ?? '', m.tool_calls ? JSON.stringify(m.tool_calls) : null, m.tool_call_id || null, m.name || null);
    }
  })(messages);
  db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function listSessions() {
  return getDb().prepare('SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS messageCount FROM sessions s ORDER BY updated_at DESC LIMIT 100').all();
}

export function deleteSession(id) {
  getDb().prepare('DELETE FROM messages WHERE session_id = ?').run(id);
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function persist(sessionId, msg) {
  getDb().prepare('INSERT INTO messages(session_id, role, content, tool_calls, tool_call_id, name) VALUES(?, ?, ?, ?, ?, ?)').run(
    sessionId, msg.role, msg.content ?? '', msg.tool_calls ? JSON.stringify(msg.tool_calls) : null, msg.tool_call_id || null, msg.name || null);
  getDb().prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);
}

export async function runTurn({ sessionId, userMessage, model, signal, onEvent }) {
  const s = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!s) throw Object.assign(new Error('session not found'), { status: 404 });
  persist(sessionId, { role: 'user', content: userMessage });
  const history = getDb().prepare('SELECT role, content, tool_calls, tool_call_id, name FROM messages WHERE session_id = ? ORDER BY id').all(sessionId);
  const messages = [{ role: 'system', content: `${SYSTEM}\nWorking directory: ${s.workdir}` }];
  for (const m of history) {
    if (m.role === 'assistant' && m.tool_calls) messages.push({ role: 'assistant', content: m.content || null, tool_calls: JSON.parse(m.tool_calls) });
    else if (m.role === 'tool') messages.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content });
    else messages.push({ role: m.role, content: m.content });
  }
  let turns = 0, toolCalls = 0, emptyRetries = 0;
  const maxTurns = 10;
  while (turns < maxTurns) {
    turns++;
    onEvent?.({ type: 'start', turn: turns });
    if (signal?.aborted) { onEvent?.({ type: 'error', error: 'aborted' }); return null; }
    let result;
    try {
      result = await chat({ messages, tools: toolDefs, model: model || s.model || undefined, signal, onToken: d => onEvent?.({ type: 'token', delta: d }) });
    } catch (e) { onEvent?.({ type: 'error', error: String(e?.message ?? e) }); return null; }
    if (!result.toolCalls.length) {
      if (!result.text.trim()) {
        // Small local models sometimes return an empty final answer with no
        // tool calls; retry the turn once or twice before giving up.
        if (emptyRetries++ < 2) { turns--; onEvent?.({ type: 'token', delta: '(empty response, retrying)' }); continue; }
        onEvent?.({ type: 'error', error: 'empty provider response' });
        return null;
      }
      persist(sessionId, { role: 'assistant', content: result.text });
      onEvent?.({ type: 'done', text: result.text, turns, provider: result.provider, model: result.model });
      return { text: result.text, turns, toolCalls };
    }
    persist(sessionId, { role: 'assistant', content: result.text, tool_calls: result.toolCalls });
    messages.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      const name = call.function?.name || 'unknown';
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
      onEvent?.({ type: 'tool_call', id: call.id, name, arguments: args });
      const r = await execTool(name, args, s.workdir, signal);
      toolCalls++;
      onEvent?.({ type: 'tool_result', id: call.id, ok: r.ok, preview: r.text.slice(0, 2000), truncated: r.text.length > 2000 });
      persist(sessionId, { role: 'tool', content: r.text, tool_call_id: call.id, name });
      messages.push({ role: 'tool', tool_call_id: call.id, content: r.text });
    }
  }
  const stop = '[stopped] max turns reached; send a new message to continue.';
  persist(sessionId, { role: 'assistant', content: stop });
  onEvent?.({ type: 'done', text: stop, turns });
  return { text: stop, turns, toolCalls };
}
