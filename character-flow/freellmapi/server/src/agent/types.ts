import type { ChatMessage, ChatToolCall, ChatToolDefinition } from '@freellmapi/shared/types.js';

// ---- Persistent rows ----

export interface AgentSessionRow {
  id: string;
  title: string | null;
  workdir: string;
  model: string | null;
  system_prompt: string | null;
  max_turns: number;
  tool_allow: string | null; // JSON string[] | null
  tool_deny: string;         // JSON string[]
  shell_timeout_ms: number | null;
  character: string | null;
  voice: string;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageRow {
  id: number;
  session_id: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls: string | null; // JSON ChatToolCall[]
  tool_call_id: string | null;
  name: string | null;
  created_at: string;
}

/** OpenAI-style JSON-schema shape for a tool's `parameters`. Kept permissive
 *  (index signature) so tool definitions can carry `description`, `required`,
 *  `default`, etc. Cast to JsonSchemaish when calling repairToolArguments. */
export interface AgentSchemaish {
  type?: string;
  description?: string;
  properties?: Record<string, AgentSchemaish>;
  items?: AgentSchemaish;
  required?: string[];
  [key: string]: unknown;
}

// ---- Tool contract ----

export interface ToolContext {
  workdir: string;
  shellTimeoutMs: number;
  signal: AbortSignal;
  /** espeak-ng voice id for the session's character (speak tool). */
  voice?: string;
}

export interface ToolResult {
  /** Whether the tool itself succeeded. Failures are fed back to the model
   *  as a normal tool message (it gets to recover / retry), not a crash. */
  ok: boolean;
  /** Text payload re-attached to the conversation (auto-truncated). */
  text: string;
}

export interface AgentTool {
  name: string;
  description: string;
  /** OpenAI JSON-schema parameter shape. */
  parameters: AgentSchemaish;
  source: 'builtin' | `mcp.${string}`;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ---- SSE event stream (POST /api/agent/sessions/:id/messages) ----

export type AgentSseEvent =
  | { type: 'start'; turn: number }
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; id: string; ok: boolean; preview: string; truncated: boolean }
  | { type: 'done'; text: string; turns: number }
  | { type: 'error'; error: string; hint?: string };

// ---- Session config (API payloads) ----

export interface AgentSessionConfig {
  title?: string;
  workdir: string;
  model?: string | null;
  systemPrompt?: string | null;
  maxTurns?: number;
  toolAllow?: string[] | null;
  toolDeny?: string[];
  shellTimeoutMs?: number | null;
  character?: string | null;
  voice?: string;
}

export function jsonToolCalls(v: string | null): ChatToolCall[] | null {
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function jsonList(v: string | null): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hydrateHistory(messages: AgentMessageRow[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls) {
      const calls = jsonToolCalls(m.tool_calls);
      out.push({
        role: 'assistant',
        content: m.content || '',
        ...(calls?.length ? { tool_calls: calls } : {}),
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export type { ChatToolDefinition };
