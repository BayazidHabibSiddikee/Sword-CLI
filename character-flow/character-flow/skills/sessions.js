/**
 * sessions.js — Persistent session manager for character-flow.
 * Saves and loads conversation state so you can resume where you left off.
 * Stores per-character: messages, tool calls, timestamps, model, thread_id.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

const SESSIONS_DIR = new URL('../data/sessions', import.meta.url).pathname;
mkdirSync(SESSIONS_DIR, { recursive: true });

function sessionPath(charKey) {
  return path.join(SESSIONS_DIR, `${charKey}.json`);
}

export class SessionManager {
  constructor() {
    this.sessions = {};
  }

  /** Load session for a character, or create new */
  load(charKey) {
    const p = sessionPath(charKey);
    if (!existsSync(p)) {
      this.sessions[charKey] = this._empty(charKey);
      return this.sessions[charKey];
    }
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      this.sessions[charKey] = data;
      return data;
    } catch {
      this.sessions[charKey] = this._empty(charKey);
      return this.sessions[charKey];
    }
  }

  /** Save current session to disk */
  save(charKey) {
    const session = this.sessions[charKey];
    if (!session) return;
    session.updated_at = new Date().toISOString();
    writeFileSync(sessionPath(charKey), JSON.stringify(session, null, 2));
  }

  /** Persist messages + metadata after each turn */
  persist(charKey, userInput, agentResult) {
    const session = this.load(charKey);
    session.conversation.push({
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    });
    if (agentResult) {
      session.conversation.push({
        role: 'assistant',
        content: agentResult.response,
        turns: agentResult.turns,
        hasToolCalls: agentResult.hasToolCalls,
        timestamp: new Date().toISOString(),
      });
    }
    session.message_count = session.conversation.length;
    session.last_interaction = new Date().toISOString();
    this.save(charKey);
  }

  /** Get conversation summary for resumption context */
  summarize(charKey, maxTokens = 2000) {
    const session = this.load(charKey);
    if (session.conversation.length === 0) return '';
    // Return last N messages that fit within context budget
    const msgs = session.conversation.slice(-20);
    let text = `Previous conversation history:\n`;
    for (const m of msgs) {
      const prefix = m.role === 'user' ? 'USER' : 'ASSISTANT';
      text += `\n[${prefix}] ${m.content?.slice(0, maxTokens)}\n`;
    }
    return text;
  }

  /** Clear conversation but keep session metadata */
  clear(charKey) {
    const session = this.load(charKey);
    session.conversation = [];
    session.message_count = 0;
    session.clear_timestamp = new Date().toISOString();
    this.save(charKey);
  }

  /** List all sessions with metadata */
  list() {
    const sessions = {};
    for (const f of (existsSync(SESSIONS_DIR)
      ? readdirSync(SESSIONS_DIR)
      : [])) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = JSON.parse(readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
        const charKey = f.replace('.json', '');
        sessions[charKey] = {
          message_count: data.message_count || 0,
          created_at: data.created_at,
          updated_at: data.updated_at,
          last_interaction: data.last_interaction,
          has_conversation: (data.conversation?.length || 0) > 0,
        };
      } catch (_) {}
    }
    return sessions;
  }

  _empty(charKey) {
    return {
      char_key: charKey,
      conversation: [],
      message_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_interaction: null,
      model_history: [],
    };
  }
}

export const sessions = new SessionManager();
