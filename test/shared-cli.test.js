import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';


test('CLI resumes shared history, injects retrieval, and saves only actual messages', async t => {
  const { spawn } = await import('node:child_process');
  const id = '00000000-0000-4000-8000-000000000001';
  const original = [{ role: 'user', content: 'earlier goal' }, { role: 'assistant', content: 'earlier result' }];
  let saved, received;
  const session = { id, title: 'test', workdir: process.cwd(), mode: 'coding', model: 'fixture', messages: original, revision: 3 };
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') { res.end(JSON.stringify({ object: 'list', data: [] })); return; }
    if (req.url === '/v1/chat/completions') {
      received = JSON.parse(body);
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'new answer' } }] })); return;
    }
    if (req.method === 'PUT') {
      saved = JSON.parse(body);
      res.end(JSON.stringify({ success: true, data: { session: { ...session, messages: saved.messages, revision: 4 } } })); return;
    }
    res.end(JSON.stringify({ success: true, data: req.url.includes('/context') ? { context: 'old-reference-marker' } : { session } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const child = spawn(process.execPath, [new URL('../cli/flow.js', import.meta.url).pathname, '--shared-session', id, '--prompt', 'next goal', '--json'], {
    env: { ...process.env, SWORDCLI_BASE_URL: '', OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: 'fixture' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '', err = ''; child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, err);
  assert.equal(JSON.parse(out).response, 'new answer');
  // Retrieved memory must never arrive as a user turn, or old prompts hijack the request.
  assert.equal(received.messages[0].role, 'system');
  assert.match(received.messages[0].content, /old-reference-marker/);
  assert.ok(!received.messages.some(m => m.role === 'user' && String(m.content).includes('old-reference-marker')));
  assert.equal(received.messages.at(-1).content, 'next goal');
  assert.deepEqual(saved, { revision: 3, messages: [...original, { role: 'user', content: 'next goal' }, { role: 'assistant', content: 'new answer' }] });
});
