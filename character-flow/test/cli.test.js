import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runTurn, providerConfig } from '../cli/agent.js';

const answer = content => ({ choices: [{ message: { role: 'assistant', content } }] });

test('provider URL normalizes root or v1 and rejects insecure remote URLs', () => {
  assert.equal(providerConfig({ PROXY_HOST: 'http://localhost:3001/' }).url, 'http://localhost:3001/v1/chat/completions');
  assert.equal(providerConfig({ OPENAI_BASE_URL: 'https://example.com/v1/' }).url, 'https://example.com/v1/chat/completions');
  assert.throws(() => providerConfig({ OPENAI_BASE_URL: 'http://example.com' }), /HTTPS/);
});

test('loop preserves tool protocol, recovers tool errors and does not mutate history', async () => {
  const original = [{ role: 'user', content: 'inspect' }];
  let requests = [];
  const request = async messages => {
    requests = [...requests, messages];
    return requests.length === 1 ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'call1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }
    ] } }] } : answer('done');
  };
  const result = await runTurn({ messages: original, request, execute: async () => { throw new Error('missing'); } });
  assert.equal(result.text, 'done');
  assert.equal(requests[1][1].tool_calls[0].id, 'call1');
  assert.match(requests[1][2].content, /missing/);
  assert.equal(original.length, 1);
});

test('loop bounds requests and rejects malformed responses', async () => {
  await assert.rejects(runTurn({ messages: [], request: async () => ({}), execute: async () => ({}) }), /response/);
  await assert.rejects(runTurn({ messages: [], maxSteps: 1, request: async () => ({ choices: [{ message: {
    role: 'assistant', tool_calls: [{ id: 'a', function: { name: 'x', arguments: '{}' } }]
  } }] }), execute: async () => ({}) }), /limit/);
});

test('CLI one-shot uses a real local HTTP endpoint and emits JSON', async t => {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    // Model discovery issues GET /v1/models with an empty body.
    if (!body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [] })); return; }
    const data = JSON.parse(body);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(data.messages.at(-1).content, 'hello');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(answer('Hello from mock')));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const child = spawn(process.execPath, [new URL('../cli/flow.js', import.meta.url).pathname, '--prompt', 'hello', '--json'], {
    env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'test' }
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).response, 'Hello from mock');
});
