// Regression test for Bug #2: /provider remove argument indexing.
// Verifies that `/provider remove <id>` passes parts[2] (the target provider name/id)
// instead of parts[1] ('remove'), and correctly removes the provider.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';

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

  send(input) { this.child.stdin.write(input); }

  stop() {
    this.child.kill('SIGKILL');
  }
}

test('/provider remove <id> deletes provider using target argument instead of "remove"', { skip: hasPty ? false : 'util-linux script required' }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'sword-prov-test-'));
  t.after(async () => {
    try { await rm(cwd, { recursive: true, force: true }); } catch {}
  });

  const base = await mockProvider(t);
  const repl = new ReplSession(base, cwd);
  t.after(() => repl.stop());

  await repl.wait(/sword> /);

  // 1. Add a custom provider
  let offset = repl.text.length;
  repl.send('/provider add custom-target http://127.0.0.1:8999 dummy-key test-model\n');
  await repl.waitAfter(/Provider added: custom-target/, offset);
  await repl.waitAfter(/sword> /, offset);

  // 2. Verify provider shows in list
  offset = repl.text.length;
  repl.send('/provider list\n');
  await repl.waitAfter(/custom-target/, offset);
  await repl.waitAfter(/sword> /, offset);

  // Read .flow/providers.json to confirm it exists and check its id
  const provFile = join(cwd, '.flow', 'providers.json');
  assert.ok(existsSync(provFile), 'providers.json must exist');
  let data = JSON.parse(readFileSync(provFile, 'utf8'));
  assert.equal(data.length, 1);
  assert.equal(data[0].name, 'custom-target');
  const providerId = data[0].id;
  assert.ok(providerId.startsWith('custom-target-'));

  // 3. Remove by ID using `/provider remove <id>`
  offset = repl.text.length;
  repl.send(`/provider remove ${providerId}\n`);
  await repl.waitAfter(/Provider removed/, offset);
  await repl.waitAfter(/sword> /, offset);

  // 4. Verify provider is removed from disk and memory
  data = JSON.parse(readFileSync(provFile, 'utf8'));
  assert.equal(data.length, 0, 'Target provider must be removed from providers list');

  // Also verify removing by name works
  offset = repl.text.length;
  repl.send('/provider add second-target http://127.0.0.1:8999 dummy-key test-model\n');
  await repl.waitAfter(/Provider added: second-target/, offset);
  await repl.waitAfter(/sword> /, offset);
  data = JSON.parse(readFileSync(provFile, 'utf8'));
  assert.equal(data.length, 1);

  offset = repl.text.length;
  repl.send('/provider remove second-target\n');
  await repl.waitAfter(/Provider removed/, offset);
  await repl.waitAfter(/sword> /, offset);
  data = JSON.parse(readFileSync(provFile, 'utf8'));
  assert.equal(data.length, 0, 'Target provider removed by name as well');

  // Clean exit
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
});
