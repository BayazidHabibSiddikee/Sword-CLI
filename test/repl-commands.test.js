// Regression test for Bug #4: REPL Slash Commands Parity.
// Verifies that `/session`, `/history`, `/brain`, `/model`, `/character`,
// `/team`, and `/routine` execute valid responses and do NOT return
// "Unknown command. Did you mean /<cmd>?".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');
const hasPty = spawnSync('sh', ['-c', 'command -v script >/dev/null 2>&1']).status === 0;

async function mockProvider(t) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (const content of ['ok\n']) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/v1`;
}

class ReplSession {
  constructor(base, cwd) {
    this.child = spawn('script', ['-qec', `${process.execPath} ${CLI}`, '/dev/null'], {
      cwd,
      env: {
        ...process.env,
        OPENAI_BASE_URL: base,
        OPENAI_API_KEY: 'fixture',
        OPENAI_MODEL: 'fixture'
      },
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
      const slice = this.text.slice(waiter.fromIndex || 0);
      if (waiter.token.test(slice) || this.exited) {
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(this.exited);
      }
    }
  }

  wait(token, ms = 20000) {
    return this.waitAfter(token, 0, ms);
  }

  waitAfter(token, fromIndex = 0, ms = 20000) {
    const slice = this.text.slice(fromIndex);
    if (token.test(slice)) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const waiter = { token, fromIndex, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`timed out waiting for ${token} — output so far:\n${this.text.slice(fromIndex)}`));
      }, ms);
      this.waiters.add(waiter);
    });
  }

  async exec(command, token, ms = 20000) {
    const fromIndex = this.text.length;
    this.send(command);
    await this.waitAfter(token, fromIndex, ms);
    return this.text.slice(fromIndex);
  }

  send(input) { this.child.stdin.write(input); }

  stop() {
    this.child.kill('SIGKILL');
  }
}

test('all documented slash commands execute valid responses and never return unknown command suggestions', { skip: hasPty ? false : 'util-linux script required' }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'sword-repl-cmds-'));
  t.after(async () => {
    try { await rm(cwd, { recursive: true, force: true }); } catch {}
  });

  const base = await mockProvider(t);
  const repl = new ReplSession(base, cwd);
  t.after(() => repl.stop());

  await repl.wait(/sword> /);

  async function runCmd(cmd, expectedToken) {
    const offset = repl.text.length;
    repl.send(`${cmd}\n`);
    await repl.waitAfter(expectedToken, offset);
    await repl.waitAfter(/sword> /, offset);
    const slice = repl.text.slice(offset);
    assert.ok(!slice.includes(`Unknown command. Did you mean ${cmd.split(' ')[0]}?`), `Must not suggest unknown for ${cmd}`);
    return slice;
  }

  // 1. /session
  const sOut = await runCmd('/session', /Session Information:/);
  assert.ok(sOut.includes('Active Session:'));
  assert.ok(sOut.includes('Turn Count:'));
  assert.ok(sOut.includes('Token Usage:'));

  // 2. /history
  await runCmd('/history', /No conversation history in current session|Conversation History/);

  // 3. /brain
  const bOut = await runCmd('/brain', /Working Memory & Brain Status:/);
  assert.ok(bOut.includes('Persona:'));
  assert.ok(bOut.includes('Context:'));
  assert.ok(bOut.includes('Memory:'));

  // 4. /model (without name)
  const mOut = await runCmd('/model', /Models:/);
  assert.ok(mOut.includes('available options:'));

  // 4b. /model <name>
  await runCmd('/model gpt-4o-mini', /Active model switched to: gpt-4o-mini/);

  // 5. /character (without name)
  const cOut = await runCmd('/character', /Active character:/);
  assert.ok(cOut.includes('Available characters:'));

  // 5b. /character <name>
  await runCmd('/character izuku', /Active character switched to: izuku/);

  // 6. /team (toggle)
  await runCmd('/team', /Team mode is now ON/);

  // 6b. /team list
  const tListOut = await runCmd('/team list', /Team configuration:/);
  assert.ok(tListOut.includes('Members (10):'));

  // 6c. /team add
  await runCmd('/team add custom_agent', /Added "custom_agent" to team \(11 agents\)/);

  // 6d. /team remove
  await runCmd('/team remove custom_agent', /Removed "custom_agent" from team \(10 agents\)/);

  // 7. /routine
  await runCmd('/routine', /No routines defined|Routines \(/);

  // 7b. /routine list
  await runCmd('/routine list', /No routines defined|Routines \(/);

  // Clean exit with Ctrl+D
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
});
