import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createSharedClient, recentContext } from '../cli/shared.js';

test('shared sessions use authenticated backend and refuse stale writes', async t => {
  const id = '00000000-0000-4000-8000-000000000001';
  const requests = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture');
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body: body && JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'PUT') { res.writeHead(409); res.end('{}'); return; }
    res.end(JSON.stringify({ success: true, data: req.url.includes('/context') ? { context: 'Untrusted previous results' } : { session: { id, messages: [], revision: 0 } } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const client = createSharedClient({ url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, key: 'fixture' });
  assert.equal((await client.createSession({ title: 'demo' })).id, id);
  assert.equal((await client.getSession(id)).revision, 0);
  assert.match(await client.context(id, 'a'.repeat(400)), /Untrusted/);
  assert.ok(requests[2].url.length < 300);
  await assert.rejects(client.saveMessages(id, [], 0), /409/);
  await assert.rejects(client.getSession('../escape'), /session id/i);
});

test('recent context retains entire tool groups and rejects oversized turns', () => {
  const first = [{ role: 'user', content: 'old'.repeat(100) }, { role: 'assistant', content: 'old reply' }];
  const recent = [{ role: 'user', content: 'new' }, { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] }, { role: 'tool', tool_call_id: 'a', content: 'result' }, { role: 'assistant', content: 'done' }];
  const messages = [...first, ...recent];
  assert.deepEqual(recentContext(messages, 300), recent);
  assert.equal(messages.length, 6);
  assert.throws(() => recentContext(recent, 2), /too large/i);
});
