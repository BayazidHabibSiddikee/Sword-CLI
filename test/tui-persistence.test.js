// The REPL must never end by itself: only /exit, /quit, Ctrl+D or a confirmed
// Ctrl+C may close the session.
//
// Node cannot allocate a PTY, so the CLI runs under util-linux `script`, which
// gives it a real terminal on stdin/stdout. A local OpenAI-compatible fixture
// keeps the test offline and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');
const hasPty = spawnSync('sh', ['-c', 'command -v script >/dev/null 2>&1']).status === 0;

async function provider(t) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) {                       // GET /v1/models — model discovery
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (const content of ['hi ', 'there', '\n']) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      await new Promise(r => setTimeout(r, 20));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/v1`;
}

class Repl {
  constructor(base) {
    this.child = spawn('script', ['-qec', `${process.execPath} ${CLI}`, '/dev/null'], {
      env: { ...process.env, OPENAI_BASE_URL: base, OPENAI_API_KEY: 'fixture', OPENAI_MODEL: 'fixture' },
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

  stop() {
    this.child.kill('SIGKILL');
  }
}

test('the prompt survives turns, idle time and a single Ctrl+C; only Ctrl+D ends it', { skip: hasPty ? false : 'util-linux `script` is required for a PTY' }, async t => {
  const base = await provider(t);
  const repl = new Repl(base);
  t.after(() => repl.stop());

  await repl.wait(/sword> /);
  repl.send('/status\n');
  await repl.wait(/mode:/);

  // A completed turn must not end the session.
  repl.send('hi\n');
  await repl.wait(/there/);
  await repl.wait(/sword> /);

  // Sitting at the prompt without typing must not end the session either.
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(repl.exited, false, `CLI exited while idle:\n${repl.text.slice(-2000)}`);

  // One Ctrl+C warns instead of exiting; the prompt keeps working.
  repl.send('\x03');
  await repl.wait(/Ctrl\+C again/);
  assert.equal(repl.exited, false, 'a single Ctrl+C must not end the session');
  repl.send('/status\n');
  await repl.wait(/mode:[\s\S]*mode:/);

  // Ctrl+D is an explicit request: the session ends cleanly.
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(repl.exited, true, 'Ctrl+D must end the session');
  assert.equal(repl.exit, 0, 'Ctrl+D must exit with status 0');
});

test('a command that throws is reported without ending the session', { skip: hasPty ? false : 'util-linux `script` is required for a PTY' }, async t => {
  const base = await provider(t);
  const repl = new Repl(base);
  t.after(() => repl.stop());

  await repl.wait(/sword> /);
  // /provider with a missing argument used to throw out of the command loop and
  // take the whole CLI with it; now it prints usage and keeps the prompt.
  repl.send('/provider add only-a-name\n');
  await repl.wait(/Usage: \/provider/);
  repl.send('/team\n');
  await repl.wait(/Team mode is now/);
  assert.equal(repl.exited, false);
  repl.send('\x04');
  await repl.wait(/Session closed by Ctrl\+D/);
});
