/**
 * Agentic API — persistent sessions, tool-calling chat (SSE), tool catalog,
 * and MCP server config. Follows the sendOk/sendError envelope for
 * non-streaming routes (docs/agent-harness.md); chat is raw SSE so clients
 * can stream tokens + tool events live.
 *
 * The dashboard and the CLI talk to these endpoints unauthenticated on the
 * local host, matching every other /api/* route in this app.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { sendOk, sendError } from '../lib/envelope.js';
import { runAgentTurn } from '../agent/loop.js';
import { characterRoster } from '../agent/characters.js';
import { speak } from '../agent/voice.js';
import { catalogForSession } from '../agent/registry.js';
import { loadMcpConfig, saveMcpConfig, closeAllMcpClients, mcpConfigPath, type McpConfig } from '../agent/mcp-client.js';
import type { AgentSessionRow } from '../agent/types.js';

export const agentRouter = Router();

// ---- Session config validation -------------------------------------------

const stringOrNull = z.string().nullable().optional();
const sessionCreateSchema = z.object({
  title: z.string().optional(),
  workdir: z.string().min(1),
  model: stringOrNull,
  systemPrompt: stringOrNull,
  maxTurns: z.number().int().min(1).max(50).optional(),
  toolAllow: z.array(z.string()).nullable().optional(),
  toolDeny: z.array(z.string()).optional(),
  shellTimeoutMs: z.number().int().positive().nullable().optional(),
  character: stringOrNull,
  voice: z.string().optional(),
});

const sessionPatchSchema = z.object({
  title: z.string().optional(),
  workdir: z.string().min(1).optional(),
  model: stringOrNull,
  systemPrompt: stringOrNull,
  maxTurns: z.number().int().min(1).max(50).optional(),
  toolAllow: z.array(z.string()).nullable().optional(),
  toolDeny: z.array(z.string()).optional(),
  shellTimeoutMs: z.number().int().positive().nullable().optional(),
  character: stringOrNull,
  voice: z.string().optional(),
});

function resolveWorkdir(input: string): string {
  const resolved = path.resolve(input.trim());
  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch {
    // best effort; the tool layer will report real failures
  }
  return resolved;
}

function getSessionRow(id: string): AgentSessionRow | undefined {
  const row = getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id);
  return row ? (row as AgentSessionRow) : undefined;
}

function publicSession(row: AgentSessionRow): Record<string, unknown> {
  return { ...row };
}

// ---- Sessions CRUD --------------------------------------------------------

agentRouter.post('/sessions', (req: Request, res: Response) => {
  const parsed = sessionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.errors.map((e) => e.message).join(', '), { retryable: false });
    return;
  }
  const data = parsed.data;
  const id = crypto.randomUUID();
  const workdir = resolveWorkdir(data.workdir);

  const insert = getDb().prepare(`
    INSERT INTO agent_sessions
      (id, title, workdir, model, system_prompt, max_turns, tool_allow, tool_deny, shell_timeout_ms, character, voice)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  try {
    insert.run(
      id,
      data.title ?? null,
      workdir,
      data.model ?? null,
      data.systemPrompt ?? null,
      data.maxTurns ?? 10,
      data.toolAllow ? JSON.stringify(data.toolAllow) : null,
      JSON.stringify(data.toolDeny ?? []),
      data.shellTimeoutMs ?? null,
      data.character ?? null,
      data.voice ?? '',
    );
  } catch (err) {
    sendError(res, 500, (err as Error).message, { retryable: true, hint: 'Database write failed' });
    return;
  }
  res.status(201).json({ success: true, data: publicSession(getSessionRow(id)!) });
});

agentRouter.get('/sessions', (_req: Request, res: Response) => {
  const db = getDb();
  const sessions = db.prepare('SELECT * FROM agent_sessions ORDER BY updated_at DESC').all() as AgentSessionRow[];
  const messageCounts = db.prepare('SELECT session_id, COUNT(*) AS n FROM agent_messages GROUP BY session_id').all() as { session_id: string; n: number }[];
  const countMap = new Map(messageCounts.map((r) => [r.session_id, r.n]));
  const list = sessions.map((s) => ({ ...publicSession(s), messageCount: countMap.get(s.id) ?? 0 }));
  sendOk(res, { sessions: list, total: list.length });
});

agentRouter.get('/sessions/:id', (req: Request, res: Response) => {
  const session = getSessionRow(req.params.id as string);
  if (!session) {
    sendError(res, 404, 'Agent session not found');
    return;
  }
  const db = getDb();
  const recent = db.prepare('SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?').all(
    session.id,
    50,
  ) as import('../agent/types.js').AgentMessageRow[];
  sendOk(res, { ...publicSession(session), recentMessages: recent.reverse() });
});

agentRouter.patch('/sessions/:id', (req: Request, res: Response) => {
  const session = getSessionRow(req.params.id as string);
  if (!session) {
    sendError(res, 404, 'Agent session not found');
    return;
  }
  const parsed = sessionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.errors.map((e) => e.message).join(', '), { retryable: false });
    return;
  }
  const data = parsed.data;
  const db = getDb();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title); }
  if (data.workdir !== undefined) { updates.push('workdir = ?'); values.push(resolveWorkdir(data.workdir)); }
  if (data.model !== undefined) { updates.push('model = ?'); values.push(data.model); }
  if (data.systemPrompt !== undefined) { updates.push('system_prompt = ?'); values.push(data.systemPrompt); }
  if (data.maxTurns !== undefined) { updates.push('max_turns = ?'); values.push(data.maxTurns); }
  if (data.toolAllow !== undefined) { updates.push('tool_allow = ?'); values.push(data.toolAllow ? JSON.stringify(data.toolAllow) : null); }
  if (data.toolDeny !== undefined) { updates.push('tool_deny = ?'); values.push(JSON.stringify(data.toolDeny)); }
  if (data.shellTimeoutMs !== undefined) { updates.push('shell_timeout_ms = ?'); values.push(data.shellTimeoutMs); }
  if (data.character !== undefined) { updates.push('character = ?'); values.push(data.character); }
  if (data.voice !== undefined) { updates.push('voice = ?'); values.push(data.voice); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE agent_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values, session.id);
  }
  sendOk(res, publicSession(getSessionRow(session.id)!));
});

agentRouter.delete('/sessions/:id', (req: Request, res: Response) => {
  const session = getSessionRow(req.params.id as string);
  if (!session) {
    sendError(res, 404, 'Agent session not found');
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM agent_messages WHERE session_id = ?').run(session.id);
  db.prepare('DELETE FROM agent_sessions WHERE id = ?').run(session.id);
  sendOk(res, { deleted: session.id });
});

// ---- Chat (SSE) -----------------------------------------------------------

agentRouter.post('/sessions/:id/messages', async (req: Request, res: Response) => {
  const session = getSessionRow(req.params.id as string);
  if (!session) {
    sendError(res, 404, 'Agent session not found');
    return;
  }
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    sendError(res, 400, '"content" (non-empty string) is required');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const emit = (ev: Record<string, unknown>): void => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  const abort = new AbortController();
  // NOTE: req 'close' fires as soon as the request BODY is consumed (Node 16+),
  // which would abort every turn immediately — the disconnect signal is the
  // RESPONSE closing early.
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  await runAgentTurn({
    session,
    userMessage: content,
    signal: abort.signal,
    onEvent: emit,
  });
  res.end();
});

// ---- Tool catalog -----------------------------------------------------------

agentRouter.get('/tools', (req: Request, res: Response) => {
  // Without a session id, use an empty allow/deny config.
  const sessionId = req.query.sessionId;
  const session = typeof sessionId === 'string' && sessionId ? getSessionRow(sessionId) : undefined;
  const config = session
    ? { tool_allow: session.tool_allow, tool_deny: session.tool_deny }
    : { tool_allow: null, tool_deny: '[]' };
  const tools = catalogForSession(config)
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      source: t.source,
    }));
  sendOk(res, { tools });
});

// ---- Character roster -----------------------------------------------------

agentRouter.get('/characters', (_req: Request, res: Response) => {
  sendOk(res, { characters: characterRoster() });
});

agentRouter.post('/voice', async (req: Request, res: Response) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) {
    sendError(res, 400, '"text" is required');
    return;
  }
  const voice = typeof req.body?.voice === 'string' ? req.body.voice : 'en-gb';
  const say = req.body?.say !== false;
  const result = await speak(text.slice(0, 400), voice, { say });
  sendOk(res, { ...result });
});

// ---- MCP config -----------------------------------------------------------

const mcpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

const mcpConfigSchema = z.object({
  servers: z.array(mcpServerSchema).default([]),
});

agentRouter.get('/mcp', (_req: Request, res: Response) => {
  sendOk(res, { config: loadMcpConfig() });
});

agentRouter.put('/mcp', (req: Request, res: Response) => {
  const parsed = mcpConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.errors.map((e) => e.message).join(', '), { retryable: false });
    return;
  }
  saveMcpConfig(parsed.data as McpConfig);
  sendOk(res, parsed.data);
});

agentRouter.post('/mcp/reload', (_req: Request, res: Response) => {
  closeAllMcpClients();
  const config = loadMcpConfig();
  sendOk(res, { reloaded: config.servers.length, path: mcpConfigPath() });
});

// ---- Session-scoped catalog convenience -------------------------------------

agentRouter.get('/sessions/:id/tools', (req: Request, res: Response) => {
  const session = getSessionRow(req.params.id as string);
  if (!session) {
    sendError(res, 404, 'Agent session not found');
    return;
  }
  const tools = catalogForSession(session).map((t) => ({
    name: t.name,
    description: t.description,
    source: t.source,
  }));
  sendOk(res, { tools });
});
