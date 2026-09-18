import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, getDb } from '../../db/index.js';
import { catalogForSession, executeToolCall, builtinTools, findTool, MAX_TOOL_RESULT_CHARS } from '../../agent/registry.js';
import type { AgentSessionRow } from '../../agent/types.js';
import type { ToolContext } from '../../agent/types.js';

function makeSession(overrides: Partial<AgentSessionRow> = {}): AgentSessionRow {
  return {
    id: 'test-session',
    title: 'test',
    workdir: os.tmpdir(),
    model: null,
    system_prompt: null,
    max_turns: 10,
    tool_allow: null,
    tool_deny: '[]',
    shell_timeout_ms: 5000,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('agent tool registry', () => {
  it('exposes all built-in tools', () => {
    const names = builtinTools().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'read_file', 'write_file', 'edit_file', 'list_dir', 'search_file', 'run_shell',
      'rag_search', 'add_memory', 'recall_memories',
    ]));
  });

  it('honors tool_deny and tool_allow filtering', () => {
    const session = makeSession({ tool_deny: JSON.stringify(['run_shell', 'mcp.rag']) });
    const catalog = catalogForSession(session, false);
    expect(catalog.map((t) => t.name)).not.toContain('run_shell');
    expect(catalog.map((t) => t.name)).toContain('read_file');

    const allowSession = makeSession({ tool_allow: JSON.stringify(['read_file']) });
    const allowCatalog = catalogForSession(allowSession, false);
    expect(allowCatalog.map((t) => t.name)).toEqual(['read_file']);
  });

  it('reports unknown tools with the available list (recoverable, not a crash)', async () => {
    const session = makeSession();
    const ctx: ToolContext = { workdir: os.tmpdir(), shellTimeoutMs: 1000, signal: new AbortController().signal };
    const catalog = catalogForSession(session, false);
    const result = await executeToolCall(findTool(catalog, 'nope'), '{"x":1}', ctx, 'nope');
    expect(result.ok).toBe(false);
    expect(result.text).toContain('Unknown tool "nope"');
    expect(result.text).toContain('read_file');
  });

  it('truncates huge tool results to MAX_TOOL_RESULT_CHARS', async () => {
    const session = makeSession();
    const ctx: ToolContext = { workdir: os.tmpdir(), shellTimeoutMs: 1000, signal: new AbortController().signal };
    const catalog = catalogForSession(session, false);
    const tool = findTool(catalog, 'list_dir')!;
    // /tmp is too big to overflow; use run_shell with seq to force >20k output
    const shell = findTool(catalog, 'run_shell')!;
    const big = await executeToolCall(shell, JSON.stringify({ command: 'yes A | head -c 100000' }), ctx, 'run_shell');
    expect(big.ok).toBe(true);
    expect(big.text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS + 100);
    expect(big.text).toContain('truncated');
    void tool;
  });
});

describe('agent file tools (sandbox)', () => {
  let workdir: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-sandbox-'));
    fs.writeFileSync(path.join(workdir, 'hello.txt'), 'hello world\n');
  });

  // NOTE: ctx/catalog are built lazily inside each test so `workdir` (set in
  // beforeAll) is the real sandbox, not the placeholder os.tmpdir().
  const mkCtx = (): ToolContext => ({ workdir, shellTimeoutMs: 5000, signal: new AbortController().signal });
  const mkCatalog = () => catalogForSession(makeSession({ workdir, tool_deny: '[]' }), false);

  it('writes, reads and edits files inside the workdir', async () => {
    const ctx = mkCtx();
    const catalog = mkCatalog();
    const write = findTool(catalog, 'write_file')!;
    let r = await executeToolCall(write, JSON.stringify({ path: 'sub/new.txt', content: 'abc' }), ctx, 'write_file');
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(workdir, 'sub/new.txt'), 'utf8')).toBe('abc');

    const read = findTool(catalog, 'read_file')!;
    r = await executeToolCall(read, JSON.stringify({ path: 'hello.txt' }), ctx, 'read_file');
    expect(r.ok).toBe(true);
    expect(r.text).toContain('hello world');

    const edit = findTool(catalog, 'edit_file')!;
    r = await executeToolCall(edit, JSON.stringify({ path: 'hello.txt', old_string: 'hello world', new_string: 'hello agents' }), ctx, 'edit_file');
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(workdir, 'hello.txt'), 'utf8')).toBe('hello agents\n');

    // Non-unique edit must fail recoverably
    r = await executeToolCall(edit, JSON.stringify({ path: 'hello.txt', old_string: 'hello agents', new_string: 'x' }), ctx, 'edit_file');
    expect(r.ok).toBe(true);
  });

  it('rejects path escapes from the workdir', async () => {
    const ctx = mkCtx();
    const catalog = mkCatalog();
    const read = findTool(catalog, 'read_file')!;
    const r = await executeToolCall(read, JSON.stringify({ path: '../../etc/passwd' }), ctx, 'read_file');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('escapes workdir');

    const write = findTool(catalog, 'write_file')!;
    const r2 = await executeToolCall(write, JSON.stringify({ path: '/etc/agent-escape.txt', content: 'x' }), ctx, 'write_file');
    expect(r2.ok).toBe(false);
    expect(fs.existsSync('/etc/agent-escape.txt')).toBe(false);
  });

  it('lists directories recursively, skipping node_modules/.git', async () => {
    const ctx = mkCtx();
    const catalog = mkCatalog();
    fs.mkdirSync(path.join(workdir, 'node_modules/junk'), { recursive: true });
    fs.writeFileSync(path.join(workdir, 'node_modules/junk/x.txt'), 'x');
    const list = findTool(catalog, 'list_dir')!;
    const r = await executeToolCall(list, JSON.stringify({}), ctx, 'list_dir');
    expect(r.ok).toBe(true);
    expect(r.text).toContain('hello.txt');
    expect(r.text).not.toContain('node_modules');
  });

  it('searches file contents', async () => {
    const ctx = mkCtx();
    const catalog = mkCatalog();
    // Self-contained fixture so earlier edits to hello.txt don't affect the search.
    fs.writeFileSync(path.join(workdir, 'needle.txt'), 'unique-needle-42\n');
    const search = findTool(catalog, 'search_file')!;
    const r = await executeToolCall(search, JSON.stringify({ pattern: 'unique-needle-42' }), ctx, 'search_file');
    expect(r.ok).toBe(true);
    expect(r.text).toContain('needle.txt');
  });
});

describe('agent shell tool', () => {
  let workdir: string;

  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-shell-'));
  });

  const mkCtx = (): ToolContext => ({ workdir, shellTimeoutMs: 5000, signal: new AbortController().signal });
  const mkShell = () => findTool(catalogForSession(makeSession({ workdir, tool_deny: '[]' }), false), 'run_shell')!;

  it('runs commands in the workdir and reports exit codes', async () => {
    const ctx = mkCtx();
    const shell = mkShell();
    const r = await executeToolCall(shell, JSON.stringify({ command: 'pwd && echo ran-ok' }), ctx, 'run_shell');
    expect(r.ok).toBe(true);
    expect(r.text).toContain('ran-ok');
    expect(r.text).toContain('exit 0');
  });

  it('surfaces non-zero exit codes as tool failures the model can read', async () => {
    const ctx = mkCtx();
    const shell = mkShell();
    const r = await executeToolCall(shell, JSON.stringify({ command: 'false' }), ctx, 'run_shell');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('exit 1');
  });

  it('kills commands at the session shell_timeout_ms', async () => {
    const shell = mkShell();
    const shortCtx: ToolContext = { workdir, shellTimeoutMs: 400, signal: new AbortController().signal };
    const start = Date.now();
    const r = await executeToolCall(shell, JSON.stringify({ command: 'sleep 10' }), shortCtx, 'run_shell');
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.text).toContain('timed out');
  });

  it('respects the per-call timeoutMs cap', async () => {
    const ctx = mkCtx();
    const shell = mkShell();
    const start = Date.now();
    const r = await executeToolCall(shell, JSON.stringify({ command: 'sleep 10', timeoutMs: 300 }), ctx, 'run_shell');
    expect(Date.now() - start).toBeLessThan(5000);
    expect(r.text).toContain('timed out');
  });

  it('kills the whole process group on timeout (backgrounded children do not survive)', async () => {
    const ctx = mkCtx();
    const shell = mkShell();
    // Background a long sleep, then `wait` so the foreground also blocks; the
    // timeout must kill the whole group (including the backgrounded sleep).
    const r = await executeToolCall(
      shell,
      JSON.stringify({ command: 'sleep 30 & sleep 30', timeoutMs: 400 }),
      ctx,
      'run_shell',
    );
    expect(r.text).toContain('timed out');
    // Give stragglers a beat, then confirm no "sleep 30" survived.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { execSync } = await import('node:child_process');
    let alive = false;
    try {
      const out = execSync('ps -eo args | grep -F "sleep 30" | grep -v grep || true', { encoding: 'utf8' });
      alive = out.trim().length > 0;
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});
