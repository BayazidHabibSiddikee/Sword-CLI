/**
 * The agent loop: user message → (LLM turn → tool calls → results)* → final
 * answer. Every step is persisted to agent_sessions/agent_messages so sessions
 * are resumable; tool results are truncated before re-entry; tool failures are
 * fed back to the model as normal tool messages so it can recover.
 */
import { getDb } from '../db/index.js';
import type { ChatMessage, ChatToolCall, ChatToolDefinition } from '@freellmapi/shared/types.js';
import { runLlmTurn, type AgentStreamEvent } from './llm.js';
import { catalogForSession, findTool, executeToolCall, MAX_TOOL_RESULT_CHARS } from './registry.js';
import { loadMemoryPromptBlock } from './tools/memory.js';
import { characterSystemBlock, voiceForCharacter } from './characters.js';
import {
  type AgentSessionRow, type AgentSseEvent, jsonToolCalls,
} from './types.js';

export const DEFAULT_SYSTEM_PROMPT = [
  'You are FreeLLMAPI\'s coding agent. You work inside a single sandboxed working directory (the session workdir).',
  'You have a detailed tool catalog below. Follow the tool schemas exactly.',
  'Guidelines:',
  '- Inspect before changing: use read_file / list_dir / search_file to understand the target before edit_file or write_file.',
  '- Use run_shell for builds, tests, git, and anything the file tools cannot do. Commands run in the workdir.',
  '- edit_file old_string must match the file exactly and occur once — read first if unsure.',
  '- Keep answers concise; show the key results of tool calls, not raw transcripts.',
  '- Use add_memory only for durable facts (user preferences, project conventions, decisions).',
].join('\n');

export interface LlmRunParams {
  session: AgentSessionRow;
  messages: ChatMessage[];
  tools: ChatToolDefinition[];
  signal: AbortSignal;
  onToken: (delta: string) => void;
}

/** LLM seam — defaults to the router-backed runLlmTurn; tests inject a stub. */
export type LlmRunner = (params: LlmRunParams) => AsyncGenerator<AgentStreamEvent>;

export function defaultLlmRunner(params: LlmRunParams): AsyncGenerator<AgentStreamEvent> {
  return runLlmTurn({
    session: params.session,
    messages: params.messages,
    tools: params.tools,
    signal: params.signal,
    onToken: params.onToken,
  });
}

export interface RunAgentTurnOptions {
  session: AgentSessionRow;
  userMessage: string;
  signal: AbortSignal;
  /** Stream an event as it happens (SSE / TUI / UI). */
  onEvent: (ev: AgentSseEvent) => void;
  /** Skip MCP tools in the catalog (tests). */
  includeMcp?: boolean;
  /** Inject a stub LLM (tests). Defaults to the router-backed runner. */
  llm?: LlmRunner;
}

export interface RunAgentTurnSummary {
  text: string;
  turns: number;
  toolCalls: number;
}

/** Build the system prompt: session override or default + character persona +
 *  workdir + memory bank. */
export function buildSystemPrompt(session: AgentSessionRow): string {
  const base = session.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const memory = loadMemoryPromptBlock();
  const character = characterSystemBlock(session.character || null);
  return [
    base,
    character,
    '',
    `## Environment`,
    `- Working directory: ${session.workdir}`,
    `- Max consecutive model turns: ${session.max_turns}`,
    `- Voice: ${session.voice || 'en-gb'} (use the speak tool for notifications)`,
    memory ? '\n' + memory : '',
  ].join('\n');
}

function persistMessage(
  sessionId: string,
  row: {
    role: ChatMessage['role'];
    content: string;
    tool_calls?: ChatToolCall[];
    tool_call_id?: string;
    name?: string;
  },
): void {
  const db = getDb();
  const seq = (db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS s FROM agent_messages WHERE session_id = ?').get(sessionId) as { s: number }).s;
  db.prepare(
    `INSERT INTO agent_messages (session_id, seq, role, content, tool_calls, tool_call_id, name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    seq,
    row.role,
    row.content,
    row.tool_calls && row.tool_calls.length > 0 ? JSON.stringify(row.tool_calls) : null,
    row.tool_call_id ?? null,
    row.name ?? null,
  );
}

function loadHistory(sessionId: string): ChatMessage[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq ASC')
    .all(sessionId) as unknown as import('./types.js').AgentMessageRow[];
  const out: ChatMessage[] = [];
  for (const m of rows) {
    if (m.role === 'assistant') {
      const calls = jsonToolCalls(m.tool_calls);
      out.push({
        role: 'assistant',
        content: m.content,
        ...(calls && calls.length > 0 ? { tool_calls: calls } : {}),
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id ?? '',
        ...(m.name ? { name: m.name } : {}),
      });
    } else {
      out.push({ role: m.role as ChatMessage['role'], content: m.content });
    }
  }
  return out;
}

/**
 * Run one user-message through the full tool loop. Emits AgentSseEvents via
 * onEvent; returns a summary once `done` has been emitted. Never throws for
 * tool errors — they surface as tool_result events with ok:false.
 */
export async function runAgentTurn(opts: RunAgentTurnOptions): Promise<RunAgentTurnSummary | null> {
  const { session, userMessage, signal, onEvent } = opts;
  const includeMcp = opts.includeMcp ?? true;
  const db = getDb();

  const sessionRow = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(session.id) as AgentSessionRow | undefined;
  if (!sessionRow) {
    onEvent({ type: 'error', error: `Session ${session.id} not found` });
    return null;
  }

  // Persist the user message first so a crash mid-turn still preserves it.
  persistMessage(sessionRow.id, { role: 'user', content: userMessage });

  // Fresh context every turn: system prompt + full persisted history (which
  // now ends with our new user message).
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(sessionRow) },
    ...loadHistory(sessionRow.id),
  ];

  const catalog = catalogForSession(sessionRow, includeMcp);
  const tools: ChatToolDefinition[] = catalog.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const toolContext = {
    workdir: sessionRow.workdir,
    shellTimeoutMs: sessionRow.shell_timeout_ms ?? 0,
    signal,
    voice: sessionRow.voice || voiceForCharacter(sessionRow.character)?.voice || 'en-gb',
  };

  const llm = opts.llm ?? defaultLlmRunner;
  let turns = 0;
  let toolCallsTotal = 0;
  const maxTurns = sessionRow.max_turns > 0 ? sessionRow.max_turns : 10;

  while (turns < maxTurns) {
    turns += 1;
    onEvent({ type: 'start', turn: turns });
    if (signal.aborted) {
      onEvent({ type: 'error', error: 'Aborted', hint: 'Request was cancelled' });
      return null;
    }

    // ---- LLM turn (streaming) ----
    let turnText = '';
    let turnToolCalls: ChatToolCall[] = [];
    let sawDone = false;

    for await (const ev of llm({
      session: sessionRow,
      messages,
      tools,
      signal,
      onToken: (delta) => onEvent({ type: 'token', delta }),
    })) {
      switch (ev.kind) {
        case 'token':
          // Handled via onToken above; no double-emit.
          break;
        case 'done':
          sawDone = true;
          turnText = ev.result.text;
          turnToolCalls = ev.result.toolCalls;
          break;
        case 'error':
          onEvent({
            type: 'error',
            error: ev.message,
            hint: ev.retryable
              ? 'All routed models are rate-limited or cool down. Try again shortly.'
              : undefined,
          });
          return null;
      }
      // Exactly one terminal event ends a single LLM call; stop consuming the
      // stream as soon as it arrives.
      if (sawDone) break;
    }
    if (!sawDone) {
      onEvent({ type: 'error', error: 'Model stream ended without a result', hint: 'Provider may have dropped the stream. Try again.' });
      return null;
    }

    // ---- No tool calls → final answer ----
    if (turnToolCalls.length === 0) {
      persistMessage(sessionRow.id, { role: 'assistant', content: turnText });
      db.prepare("UPDATE agent_sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionRow.id);
      onEvent({ type: 'done', text: turnText, turns });
      return { text: turnText, turns, toolCalls: toolCallsTotal };
    }

    // ---- Persist assistant message WITH its tool calls ----
    persistMessage(sessionRow.id, {
      role: 'assistant',
      content: turnText,
      tool_calls: turnToolCalls,
    });
    messages.push({ role: 'assistant', content: turnText, tool_calls: turnToolCalls });

    // ---- Execute each tool call, persist results, feed back ----
    for (const call of turnToolCalls) {
      if (signal.aborted) break;
      const name = call.function.name;
      let rawArgs: string | undefined;
      try {
        rawArgs = call.function.arguments;
      } catch {
        rawArgs = undefined;
      }
      onEvent({
        type: 'tool_call',
        id: call.id,
        name,
        arguments: safeParseArgs(rawArgs),
      });

      const tool = findTool(catalog, name);
      const result = await executeToolCall(tool, rawArgs, toolContext, name);
      const truncated = result.text.length >= MAX_TOOL_RESULT_CHARS;

      onEvent({
        type: 'tool_result',
        id: call.id,
        ok: result.ok,
        preview: result.text.slice(0, 4000),
        truncated,
      });
      persistMessage(sessionRow.id, {
        role: 'tool',
        content: result.text,
        tool_call_id: call.id,
        name,
      });
      messages.push({
        role: 'tool',
        content: result.text,
        tool_call_id: call.id,
        name,
      } as ChatMessage);
      toolCallsTotal += 1;
    }

    if (signal.aborted) {
      onEvent({ type: 'error', error: 'Aborted', hint: 'Request was cancelled' });
      return null;
    }
  }

  // Hit the turn cap: stop and say so (the model still got its final word in
  // the last turn only if it chose to; otherwise close the loop explicitly).
  persistMessage(sessionRow.id, {
    role: 'assistant',
    content: `[stopped] Reached the maximum of ${maxTurns} model turns without a final answer. Continue with a new message.`,
  });
  db.prepare("UPDATE agent_sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionRow.id);
  const stopText = `[stopped] Reached the maximum of ${maxTurns} model turns. Continue with a new message.`;
  onEvent({ type: 'done', text: stopText, turns });
  return { text: stopText, turns, toolCalls: toolCallsTotal };
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { _value: parsed };
  } catch {
    return { _raw: raw.slice(0, 2000) };
  }
}

export type { AgentStreamEvent };
