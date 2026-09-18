/**
 * MCP client — connects to external Model Context Protocol servers (stdio)
 * configured in `server/data/agent-mcp.json` and exposes their tools in the
 * agent catalog as `mcp.<server>.<tool>`.
 *
 * Config format:
 * {
 *   "servers": [
 *     { "name": "rag", "command": "node", "args": ["dist/mcp/rag-mcp-server.js"], "env": {} }
 *   ]
 * }
 *
 * Connections are lazy and cached; a failing server degrades gracefully (its
 * tools are simply absent) rather than breaking the agent loop.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { AgentTool } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Server binary working directory. */
  cwd?: string;
}

export interface McpConfig {
  servers: McpServerConfig[];
}

// server/data/agent-mcp.json (works from src/ in dev and dist/ in prod).
export const MCP_CONFIG_PATH = path.resolve(__dirname, '../../data/agent-mcp.json');

export function mcpConfigPath(): string {
  return MCP_CONFIG_PATH;
}

export function loadMcpConfig(): McpConfig {
  if (!existsSync(MCP_CONFIG_PATH)) return { servers: [] };
  try {
    const parsed = JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf8')) as Partial<McpConfig>;
    const servers = Array.isArray(parsed.servers)
      ? parsed.servers.filter((s): s is McpServerConfig => Boolean(s?.name && s?.command))
      : [];
    return { servers };
  } catch (err) {
    console.warn('[agent-mcp] invalid agent-mcp.json, ignoring:', (err as Error).message);
    return { servers: [] };
  }
}

export function saveMcpConfig(config: McpConfig): void {
  if (!existsSync(path.dirname(MCP_CONFIG_PATH))) mkdirSync(path.dirname(MCP_CONFIG_PATH), { recursive: true });
  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  closeAllMcpClients(); // force re-read of config on next use
}

// ---- Connection cache -------------------------------------------------------

interface McpEntry {
  client: Client;
  config: McpServerConfig;
  tools: McpTool[];
}

const clients = new Map<string, McpEntry>();
const connectPromises = new Map<string, Promise<void>>();

export function closeAllMcpClients(): void {
  for (const entry of clients.values()) {
    entry.client.close().catch(() => {});
  }
  clients.clear();
  connectPromises.clear();
}

async function ensureServer(cfg: McpServerConfig): Promise<void> {
  if (clients.has(cfg.name)) return;
  let pending = connectPromises.get(cfg.name);
  if (pending) return;
  pending = (async () => {
    try {
      const client = new Client({ name: `sword-cli:${cfg.name}`, version: '1.0.0' });
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
      );
      if (cfg.env) {
        for (const [k, v] of Object.entries(cfg.env)) env[k] = v;
      }
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env,
        cwd: cfg.cwd,
        stderr: 'ignore',
      });
      await client.connect(transport);
      const { tools } = await client.listTools();
      clients.set(cfg.name, { client, config: cfg, tools: tools ?? [] });
    } catch (err) {
      console.warn(`[agent-mcp] server "${cfg.name}" failed to connect:`, (err as Error).message);
    } finally {
      connectPromises.delete(cfg.name);
    }
  })();
  connectPromises.set(cfg.name, pending);
  await pending;
}

/** Tool-call execution against a connected MCP server. */
export async function callMcpTool(server: string, tool: string, args: Record<string, unknown>): Promise<ToolResultLike> {
  const entry = clients.get(server);
  if (!entry) {
    const cfg = loadMcpConfig().servers.find((s) => s.name === server);
    if (!cfg) return { ok: false, text: `MCP server "${server}" is not configured` };
    await ensureServer(cfg);
    const fresh = clients.get(server);
    if (!fresh) return { ok: false, text: `MCP server "${server}" is unavailable (connection failed)` };
    return invokeTool(fresh, tool, args);
  }
  return invokeTool(entry, tool, args);
}

async function invokeTool(entry: McpEntry, tool: string, args: Record<string, unknown>): Promise<ToolResultLike> {
  try {
    // The SDK's callTool returns the parsed CallToolResult (text/image/resource
    // content blocks, optional isError). Keep it loosely typed: shapes vary by
    // protocol version and we only need the text blocks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await entry.client.callTool({ name: tool, arguments: args });
    return mcpResultToText(result);
  } catch (err) {
    return { ok: false, text: `MCP tool "${tool}" failed: ${(err as Error).message}` };
  }
}

function mcpResultToText(result: unknown): ToolResultLike {
  const r = result as { content?: unknown; isError?: boolean };
  // MCP tool results are content blocks; flatten text blocks, note media.
  const blocks: unknown[] = Array.isArray(r?.content) ? r.content : [];
  const parts: string[] = [];
  for (const b of blocks) {
    const block = b as { type?: string; text?: string; mimeType?: string; isError?: boolean };
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (block?.type === 'image') {
      parts.push(`[image ${block.mimeType ?? 'unknown'} (not displayed)]`);
    } else if (block?.type === 'resource') {
      parts.push(`[resource result]`);
    }
  }
  const text = parts.length ? parts.join('\n') : '(no content)';
  if (r?.isError === true) return { ok: false, text: `MCP tool returned an error: ${text}` };
  return { ok: true, text };
}

interface ToolResultLike {
  ok: boolean;
  text: string;
}

/** The full MCP-backed tool list, refreshed lazily. Exposed to the registry as
 *  `mcp.<server>.<tool>`. */
export function mcpTools(): AgentTool[] {
  const config = loadMcpConfig();
  const out: AgentTool[] = [];
  for (const cfg of config.servers) {
    // Sync snapshot: only already-connected servers list tools here; the
    // call path (callMcpTool) lazily connects on first use if needed.
    const entry = clients.get(cfg.name);
    for (const t of entry?.tools ?? []) {
      const fullName = `mcp.${cfg.name}.${t.name}`;
      out.push({
        name: fullName,
        description: `[MCP:${cfg.name}] ${t.description ?? t.name}`,
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        source: `mcp.${cfg.name}`,
        async execute(args, _ctx) {
          // Lazy connect in case the server isn't up yet.
          const pending = connectPromises.get(cfg.name) ?? ensureServer(cfg);
          await pending;
          return callMcpTool(cfg.name, t.name, args);
        },
      });
    }
    if (!entry) {
      // Not connected yet — advertise a placeholder only after the first
      // successful handshake. To keep the catalog honest, attempt a
      // background connect; the next catalog build will include real tools.
      ensureServer(cfg).catch(() => {});
    }
  }
  return out;
}
