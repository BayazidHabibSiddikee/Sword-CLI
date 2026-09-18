import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, getDb } from '../../db/index.js';
import {
  runAgentTurn, defaultLlmRunner, type LlmRunner, type LlmRunParams,
} from '../../agent/loop.js';
import { MAX_TOOL_RESULT_CHARS } from '../../agent/registry.js';
import type { AgentSessionRow, AgentSseEvent } from '../../agent/types.js';
import type { AgentStreamEvent } from '../../agent/llm.js';
import type { ChatToolCall } from '@freellmapi/shared/types.js';

function seedSession(id: string, workdir: string): AgentSessionRow {
  getDb().prepare(`
    INSERT INTO agent_sessions (id, title, workdir, model, system_prompt, max_turns, tool_allow, tool_deny, shell_timeout_ms)
    VALUES (?, 'seed', ?, NULL, NULL, 5, NULL, '[]', 5000)
  `).run(id, workdir);
  return getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id) as AgentSessionRow;
}

function done(text: string, toolCalls: ChatToolCall[]): AgentStreamEvent {
  return {
    kind: 'done',
    result: { text, toolCalls, modelId: 'stub', platform: 'stub' },
  };
}

/** Stateful stub: each `llm()` call yields exactly one scripted terminal event
 *  and advances the script — mirroring how the real loop calls one LLM turn per
 *  iteration with growing history. */
function makeLlm(script: AgentStreamEvent[]): LlmRunner {
  let call = 0;
  return function* stateful(_params: LlmRunParams): AsyncGenerator<AgentStreamEvent> {
    const ev = script[call] ?? done('done', []);
    call += 1;
    yield ev;
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown>): ChatToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('agent loop (stub LLM)', () => {
  let workdir: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-'));
  });

  it('runs a tool call then produces the final answer, persisting everything', async () => {
    const sessionId = 'loop-1';
    seedSession(sessionId, workdir);
    const session = getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as AgentSessionRow;

    const llm = makeLlm([
      done('I will create the file.', [toolCall('call_1', 'write_file', { path: 'out.txt', content: 'from-agent' })]),
      done('Done. Created out.txt.', []),
    ]);

    const events: AgentSseEvent[] = [];
    const summary = await runAgentTurn({
      session,
      userMessage: 'make out.txt',
      signal: new AbortController().signal,
      onEvent: (ev) => events.push(ev),
      includeMcp: false,
      llm,
    });

    expect(summary).not.toBeNull();
    expect(summary!.text).toBe('Done. Created out.txt.');
    expect(summary!.turns).toBe(2);
    expect(summary!.toolCalls).toBe(1);

    // The file was actually written into the sandbox
    expect(fs.readFileSync(path.join(workdir, 'out.txt'), 'utf8')).toBe('from-agent');

    // Event order: start -> tool_call -> tool_result -> start -> done
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('start');
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types[types.length - 1]).toBe('done');

    // Persisted history: user first, a tool message present, assistant last
    const db = getDb();
    const rows = db.prepare('SELECT role FROM agent_messages WHERE session_id = ? ORDER BY seq ASC').all(sessionId) as { role: string }[];
    const roles = rows.map((r) => r.role);
    expect(roles[0]).toBe('user');
    expect(roles).toContain('tool');
    expect(roles[roles.length - 1]).toBe('assistant');
  });

  it('stops at max_turns without a final answer', async () => {
    const sessionId = 'loop-2';
    seedSession(sessionId, workdir);
    getDb().prepare('UPDATE agent_sessions SET max_turns = 3 WHERE id = ?').run(sessionId);
    const session = getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as AgentSessionRow;

    // Every turn keeps asking for a tool call — never a final answer.
    const llm = makeLlm([
      done('working…', [toolCall('c0', 'list_dir', {})]),
      done('working…', [toolCall('c1', 'list_dir', {})]),
      done('working…', [toolCall('c2', 'list_dir', {})]),
    ]);

    const events: AgentSseEvent[] = [];
    const summary = await runAgentTurn({
      session, userMessage: 'loop', signal: new AbortController().signal,
      onEvent: (ev) => events.push(ev), includeMcp: false, llm,
    });

    expect(summary).not.toBeNull();
    expect(summary!.text).toContain('Reached the maximum of 3');
    expect(summary!.turns).toBe(3);
    expect(events[events.length - 1].type).toBe('done');
  });

  it('feeds tool failures back to the model (recoverable, not a crash)', async () => {
    const sessionId = 'loop-3';
    seedSession(sessionId, workdir);
    const session = getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as AgentSessionRow;

    const llm = makeLlm([
      done('', [toolCall('call_esc', 'write_file', { path: '../../escape.txt', content: 'x' })]),
      done('Could not write outside workdir.', []),
    ]);

    const events: AgentSseEvent[] = [];
    const summary = await runAgentTurn({
      session, userMessage: 'try to escape', signal: new AbortController().signal,
      onEvent: (ev) => events.push(ev), includeMcp: false, llm,
    });

    expect(summary).not.toBeNull();
    const toolResult = events.find((e) => e.type === 'tool_result') as { ok: boolean } | undefined;
    expect(toolResult).toBeDefined();
    expect(toolResult!.ok).toBe(false);
    // No escape file was written outside the sandbox
    expect(fs.existsSync(path.join(path.dirname(workdir), 'escape.txt'))).toBe(false);
  });

  it('persists assistant tool_calls JSON so history can be re-hydrated', async () => {
    const sessionId = 'loop-4';
    seedSession(sessionId, workdir);
    const session = getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as AgentSessionRow;

    const llm = makeLlm([
      done('', [toolCall('c1', 'list_dir', {})]),
      done('ok', []),
    ]);
    await runAgentTurn({
      session, userMessage: 'x', signal: new AbortController().signal,
      onEvent: () => {}, includeMcp: false, llm,
    });

    const row = getDb().prepare(
      "SELECT * FROM agent_messages WHERE session_id = ? AND role = 'assistant' AND tool_calls IS NOT NULL",
    ).get(sessionId) as { tool_calls: string } | undefined;
    expect(row).toBeDefined();
    const parsed = JSON.parse(row!.tool_calls);
    expect(parsed[0].function.name).toBe('list_dir');
  });

  it('exposes defaultLlmRunner as the router-backed delegation', () => {
    expect(typeof defaultLlmRunner).toBe('function');
    void MAX_TOOL_RESULT_CHARS;
  });
});
