import { fileTools } from './tools/file.js';
import { shellTools } from './tools/shell.js';
import { ragTools } from './tools/rag.js';
import { memoryTools } from './tools/memory.js';
import { videoTools } from './tools/video.js';
import { voiceTools } from './tools/voice.js';
import { mcpTools } from './mcp-client.js';
import { repairToolArguments } from '../lib/tool-args.js';
import type { AgentSchemaish, AgentSessionRow, AgentTool, ToolContext, ToolResult } from './types.js';
import { jsonList } from './types.js';

/** Cap a tool's output before it re-enters the conversation. */
export const MAX_TOOL_RESULT_CHARS = 20_000;

export function builtinTools(): AgentTool[] {
  return [...fileTools, ...shellTools, ...ragTools, ...memoryTools, ...videoTools, ...voiceTools];
}

function isAllowed(name: string, allow: string[], deny: string[]): boolean {
  if (deny.length > 0) {
    // deny matches on exact name or on an mcp.<server>.* prefix
    if (deny.includes(name)) return false;
    if (name.startsWith('mcp.')) {
      const server = `mcp.${name.split('.')[1]}`;
      if (deny.includes(server)) return false;
    }
  }
  // An allow-list only restricts when it's non-empty; empty/null = allow all.
  if (allow.length > 0) {
    return allow.includes(name) || (name.startsWith('mcp.') && allow.includes(`mcp.${name.split('.')[1]}`));
  }
  return true;
}

/** Full catalog for a session: builtins + MCP tools, filtered by the session's
 *  tool_allow / tool_deny lists. `sources` controls whether MCP tools are
 *  included (tests may skip MCP). */
export function catalogForSession(
  session: Pick<AgentSessionRow, 'tool_allow' | 'tool_deny'>,
  includeMcp = true,
): AgentTool[] {
  const allow = jsonList(session.tool_allow);
  const deny = jsonList(session.tool_deny);
  const tools = [...builtinTools(), ...(includeMcp ? mcpTools() : [])];
  return tools.filter((t) => isAllowed(t.name, allow, deny));
}

/** Resolve a tool by name from the (already filtered) catalog. */
export function findTool(catalog: AgentTool[], name: string): AgentTool | undefined {
  return catalog.find((t) => t.name === name);
}

export interface ExecutedTool {
  name: string;
  arguments: Record<string, unknown>;
  result: ToolResult;
}

/** Execute one tool call: repair args against the tool's JSON schema, run it,
 *  and truncate the result. Unknown tools produce a recoverable error result
 *  (the model sees it and adapts). */
export async function executeToolCall(
  tool: AgentTool | undefined,
  rawArgs: string | Record<string, unknown> | undefined,
  ctx: ToolContext,
  callName?: string,
): Promise<ToolResult> {
  let args: Record<string, unknown>;
  if (typeof rawArgs === 'string') {
    if (tool) {
      // Models routinely emit nested JSON as strings (GLM family) — repair
      // against the tool's real parameter schema; returns the repaired JSON
      // string, then parse it.
      const repaired = repairToolArguments(rawArgs, tool.parameters);
      try {
        const parsed: unknown = JSON.parse(repaired);
        args = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        args = {};
      }
    } else {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
  } else {
    args = rawArgs ?? {};
  }
  if (!tool) {
    return {
      ok: false,
      text: `Unknown tool "${callName ?? 'unknown'}". Available tools: ${[
        ...builtinTools().map((t) => t.name),
        ...mcpTools().map((t) => t.name),
      ].join(', ')}`,
    };
  }
  try {
    const result = await tool.execute(args, ctx);
    let text = result.text ?? '';
    if (text.length > MAX_TOOL_RESULT_CHARS) {
      text = text.slice(0, MAX_TOOL_RESULT_CHARS) + `\n[output truncated to ${MAX_TOOL_RESULT_CHARS} chars]`;
    }
    return { ok: result.ok, text };
  } catch (err) {
    return { ok: false, text: `Tool "${tool.name}" threw: ${(err as Error).message}` };
  }
}
