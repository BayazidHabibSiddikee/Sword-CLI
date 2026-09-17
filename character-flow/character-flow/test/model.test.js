import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolveModel, modelsUrl } from '../cli/model.js';

const config = url => ({ url, key: 'fixture', model: 'auto' });

async function withModels(t, payload, status = 200) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return config(`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
}

test('models URL is derived from the chat completions endpoint', () => {
  assert.equal(modelsUrl(config('http://x/v1/chat/completions')), 'http://x/v1/models');
});

test('an explicit override always wins, without a network call', async () => {
  const model = await resolveModel(config('http://127.0.0.1:9/v1/chat/completions'), 'my-model');
  assert.equal(model, 'my-model');
});

test('SWORD_MODEL wins over preferred selection', async t => {
  const cfg = await withModels(t, { data: [{ id: 'gemini-3.6-flash' }] });
  assert.equal(await resolveModel(cfg, undefined, { SWORD_MODEL: 'chosen-by-env' }), 'chosen-by-env');
});

test('the strongest available preferred model is selected', async t => {
  const cfg = await withModels(t, { data: [{ id: 'gemini-3.5-flash' }, { id: 'gemini-3.6-flash' }, { id: 'weak-model' }] });
  assert.equal(await resolveModel(cfg, undefined, {}), 'gemini-3.6-flash');
});

test('a retired preferred id never pins the CLI to an unavailable model', async t => {
  const cfg = await withModels(t, { data: [{ id: 'weak-model' }] });
  assert.equal(await resolveModel(cfg, undefined, {}), 'auto');
});

test('discovery failures and malformed bodies fall back to backend routing', async t => {
  const failing = await withModels(t, { error: 'nope' }, 500);
  assert.equal(await resolveModel(failing, undefined, {}), 'auto');
  const malformed = await withModels(t, { data: 'not-an-array' });
  assert.equal(await resolveModel(malformed, undefined, {}), 'auto');
  assert.equal(await resolveModel(config('http://127.0.0.1:9/v1/chat/completions'), undefined, {}), 'auto');
});
