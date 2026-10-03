// Phase 1 integration — cli/budget.js and cli/sessionDiff.js wired into cli/flow.js.
//
// Covered here:
//   1. projectRequest() runs before EVERY provider call; over budget the request
//      is degraded with the honest notice, and degradation is request-local — the
//      persisted session keeps every message.
//   2. /status shows tokens used vs. budget and the <workspace-diff> block
//      (via sessionDiff → formatSessionDiff), or just the budget line outside
//      a git repository.
//   3. Archiving keeps the placeholder stub, so a resumed session is honest
//      ("N earlier turn(s) archived") instead of silently blank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession } from '../cli/agent.js';
import * as checkpoints from '../cli/checkpoint.js';
import { PLACEHOLDER_MARK, isPlaceholder } from '../cli/historyArchive.js';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');
const run = promisify(execFile);
const hasPty = spawnSync('sh', ['-c', 'command -v script >/dev/null 2>&1']).status === 0;
const answer = content => ({ choices: [{ message: { role: 'assistant', content } }] });
const NOTICE = '[Context limit reached — oldest turns dropped. Use /status to see the current budget.]';

async function git(cwd, args) { return (await run('git', args, { cwd })).stdout; }

async function tempDir(prefix) {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

/** Local OpenAI-compatible fixture: model discovery + one completion. */
async function provider(t) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/v1`;
}

function spawnFlow(args, { cwd, env = {} } = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, SWORD_BUDGET_TOKENS: '', ...env }
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  return { child, done: once(child, 'close').then(([code]) => ({ code, stdout, stderr })) };
}

// ── 1. projectRequest before every provider call + honest degradation ─────────
test('an over-budget request is projected, degraded and announced before the wire', async t => {
  const cwd = await tempDir('flow-budget-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.flow'), { recursive: true });
  // 60 messages ≈ 61k tokens: far above the 20k ceiling configured below, while
  // the irreducible floor (system prompt + tool schemas + current input) fits.
  const messages = [];
  for (let i = 0; i < 30; i++) {
    messages.push({ role: 'user', content: `OLDBASE-${i} ` + 'p'.repeat(4000) });
    messages.push({ role: 'assistant', content: 'a'.repeat(4000) });
  }
  await writeFile(join(cwd, '.flow', 'budget.json'), JSON.stringify({ cwd, messages }));

  // Two provider calls: runTurn's tool step and its final answer. Both must be
  // projected and degraded — not just the first one.
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [] })); return; }
    const data = JSON.parse(body);
    requests.push(data.messages);
    const reply = requests.length === 1
      ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'write_file', arguments: '{"path":"x.txt","content":"y"}' } }
        ] } }] }
      : answer('done');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const { done } = spawnFlow(['--session', 'budget', '--prompt', 'hello', '--json'], {
    cwd,
    env: {
      OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
      OPENAI_API_KEY: '', OPENAI_MODEL: 'test', SWORD_BUDGET_TOKENS: '20000'
    }
  });
  const { code, stdout, stderr } = await done;
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).response, 'done');

  assert.equal(requests.length, 2, 'projectRequest wraps every runTurn step');
  for (const wire of requests) {
    assert.equal(wire[0].role, 'system');
    assert.equal(wire[0].content, NOTICE, 'the honest notice leads every degraded request');
    assert.ok(!wire.some(m => typeof m.content === 'string' && m.content.includes('OLDBASE-0')),
      'the oldest turn was dropped from the wire');
    assert.ok(wire.some(m => m.role === 'system' && m !== wire[0]), 'the real system prompt survived degradation');
  }
  // The CURRENT input is never touched by degradation.
  assert.deepEqual(requests[0].at(-1), { role: 'user', content: 'hello' });
  assert.ok(requests[1].some(m => m.role === 'user' && m.content === 'hello'));
  assert.equal(requests[1].at(-1).role, 'tool', 'the in-flight tool result belongs to the current input');
  // The user is told, honestly, on stderr.
  assert.match(stderr, /Context over budget \(\d+ > 20000 tokens\): dropped \d+ old message\(s\); the current input was kept\./);

  // Request-local: the persisted session keeps EVERY message plus the new turn,
  // and still loads (degradation is not allowed to corrupt the session file).
  const saved = JSON.parse(await readFile(join(cwd, '.flow', 'budget.json'), 'utf8'));
  assert.equal(saved.messages.length, 64, '60 fixture + prompt + tool call + tool result + final answer');
  assert.match(saved.messages[0].content, /OLDBASE-0/, 'nothing was trimmed from the persisted log');
  assert.equal((await loadSession(cwd, 'budget')).length, 64);
});

// ── 2. /status: tokens vs. budget + workspace diff ────────────────────────────
test('/status shows tokens used vs. budget and the workspace diff', { skip: hasPty ? false : 'util-linux `script` is required for a PTY' }, async t => {
  const cwd = await tempDir('flow-status-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await git(cwd, ['init', '-q', '.']);
  await git(cwd, ['config', 'user.email', 'e@e.t']);
  await git(cwd, ['config', 'user.name', 'e']);
  await writeFile(join(cwd, 'a.txt'), 'alpha\n');
  await git(cwd, ['add', '-A']);
  await git(cwd, ['commit', '-qm', 'init']);
  const snapshot = await checkpoints.create(cwd, 'session start');
  assert.equal(snapshot.ok, true);

  const base = await provider(t);
  const repl = new Repl({ cwd, env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture' } });
  t.after(() => repl.stop());
  await repl.wait(/sword> /);
  repl.send('/status\n');
  // Budget line: tokens used vs. the default 128000-token ceiling.
  await repl.wait(/\/ 128000 tokens \(\d+%\)/);
  // Wired sessionDiff: git-derived workspace block with the session baseline.
  await repl.wait(/<workspace-diff>/);
  await repl.wait(/baseline: checkpoint /);
  assert.equal(repl.exited, false);
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
});

test('/status outside a git repo shows the budget line and no workspace diff', { skip: hasPty ? false : 'util-linux `script` is required for a PTY' }, async t => {
  const cwd = await tempDir('flow-status-nogit-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const base = await provider(t);
  const repl = new Repl({ cwd, env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture' } });
  t.after(() => repl.stop());
  await repl.wait(/sword> /);
  repl.send('/status\n');
  await repl.wait(/\/ 128000 tokens \(\d+%\)/);
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.ok(!/<workspace-diff>/.test(repl.text), 'no diff block is printed outside a repo');
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
});


// ── 3. Resume after archive is honest: the placeholder stub survives ──────────
test('archiving keeps the placeholder stub so a resumed session is honest', async t => {
  const cwd = await tempDir('flow-archive-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.flow'), { recursive: true });
  // 204 messages > HISTORY_THRESHOLD: the turn pushes it to 206, so the archiver
  // splits (keeping 200) and the stub must land at the head of the retained log.
  const messages = [];
  for (let i = 0; i < 102; i++) {
    messages.push({ role: 'user', content: `turn ${i}: ` + 'q'.repeat(200) });
    messages.push({ role: 'assistant', content: 'a'.repeat(200) });
  }
  assert.equal(messages.length, 204);
  await writeFile(join(cwd, '.flow', 'arch.json'), JSON.stringify({ cwd, messages }));

  // Buffered (--json) requests need a plain JSON reply, not the SSE fixture.
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [] })); return; }
    JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(answer('done')));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  // Don't leave archive documents behind in the shared dev RAG database.
  t.after(async () => {
    try {
      const { default: Database } = await import('better-sqlite3');
      const db = new Database(join(import.meta.dirname, '..', 'cli', 'brain', 'rag.db'));
      db.prepare("DELETE FROM knowledge WHERE source = 'history_archive'").run();
      db.close();
    } catch { /* database may not exist */ }
  });

  const { done } = spawnFlow(['--session', 'arch', '--prompt', 'hello', '--json'], {
    cwd,
    env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture' }
  });
  const { code, stdout, stderr } = await done;
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).response, 'done');
  assert.match(stderr, /Archived 3 turn\(s\) into knowledge library; kept 201 recent messages\./);
  assert.ok(!/Context over budget/.test(stderr), 'well under budget: no degradation was needed');

  const saved = JSON.parse(await readFile(join(cwd, '.flow', 'arch.json'), 'utf8'));
  assert.equal(saved.messages.length, 201, 'one stub + the 200 retained messages');
  assert.ok(saved.messages[0].content.startsWith(PLACEHOLDER_MARK), 'the stub leads the retained window');
  assert.match(saved.messages[0].content, /3 earlier turn\(s\)/, 'the stub counts what was archived');
  // Resume is honest: loadSession accepts every role and the stub is present —
  // not a blank history that pretends the session just started.
  const reloaded = await loadSession(cwd, 'arch');
  assert.equal(reloaded.length, 201);
  assert.ok(isPlaceholder(reloaded[0]));
  assert.equal(reloaded[1].content.slice(0, 6), 'turn 3', 'the tail keeps its first unarchived turn');
});


// ── PTY helper (same pattern as test/tui-persistence.test.js) ─────────────────
class Repl {
  constructor(opts = {}) {
    this.child = spawn('script', ['-qec', `${process.execPath} ${CLI}`, '/dev/null'], {
      cwd: opts.cwd,
      env: { ...process.env, SWORD_BUDGET_TOKENS: '', ...(opts.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.text = '';
    this.exited = false;
    this.exit = null;
    this.waiters = new Set();
    for (const stream of [this.child.stdout, this.child.stderr]) {
      stream.on('data', chunk => this.feed(String(chunk)));
    }
    this.child.on('close', code => { this.exited = true; this.exit = code; this.resolveAll(); });
  }

  feed(chunk) {
    this.text += chunk;
    this.resolveAll();
  }

  resolveAll() {
    for (const waiter of [...this.waiters]) {
      if (waiter.token.test(this.text) || this.exited) {
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(this.exited);
      }
    }
  }

  /** Wait until `token` shows up, or fail if the CLI dies first. */
  wait(token, ms = 20000) {
    if (token.test(this.text)) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const waiter = { token, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`timed out waiting for ${token} — output so far:\n${this.text.slice(-2000)}`));
      }, ms);
      this.waiters.add(waiter);
    });
  }

  send(input) { this.child.stdin.write(input); }

  stop() { this.child.kill('SIGKILL'); }
}

