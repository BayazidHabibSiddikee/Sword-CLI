import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fallbackNotice, attemptFallback, setG4fFactory } from '../cli/providerFallback.js';

test('providerFallback uses g4f and validates prompts/results', async () => {
  assert.ok(fallbackNotice().startsWith('[Fallback]'));
  assert.ok(fallbackNotice().includes('free fallback providers'));

  for (const prompt of ['', '   ', String.fromCharCode(9, 10)]) { // '', spaces, tab+newline
    await assert.rejects(attemptFallback(prompt), /Fallback prompt must not be empty/);
  }

  setG4fFactory({ chatCompletion: async () => 'anonymous answer' });
  assert.equal(await attemptFallback('anything'), 'anonymous answer');

  setG4fFactory({ chatCompletion: async () => ({ content: 'content payload' }) });
  assert.equal(await attemptFallback('anything'), 'content payload');

  setG4fFactory({ chatCompletion: async () => ({ text: '' }) });
  const offline = await attemptFallback('anything');
  assert.ok(offline.includes('[SwordCLI Offline Mode]'));

  setG4fFactory(null);
});

test('providerFallback tries the direct free URL after g4f fails', async () => {
  // Mock OpenAI-compatible endpoint that records what actually arrived.
  let seen = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'direct fallback answer' } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const prevUrl = process.env.SWORD_FREE_FALLBACK_URL;
  process.env.SWORD_FREE_FALLBACK_URL = `http://127.0.0.1:${port}/v1?model=test-model`;
  // Env is read lazily inside attemptFallback, so the same module instance
  // picks this up without a re-import.
  const { attemptFallback: fresh } = await import('../cli/providerFallback.js');

  setG4fFactory({ chatCompletion: async () => { throw new Error('g4f down (simulated 526)'); } });
  const answer = await fresh('ping the mock');
  assert.equal(answer, 'direct fallback answer');
  assert.ok(seen, 'direct fallback endpoint must receive a real HTTP request');
  assert.equal(seen.url, '/v1/chat/completions');
  assert.equal(seen.body.model, 'test-model');
  assert.equal(seen.body.messages[0].content, 'ping the mock');

  process.env.SWORD_FREE_FALLBACK_URL = prevUrl;
  setG4fFactory(null);
  server.close();
});

test('providerFallback recovers when g4f hangs (timeout guard)', async () => {
  let directHits = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      directHits += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'rescued by direct fallback' } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const prevUrl = process.env.SWORD_FREE_FALLBACK_URL;
  process.env.SWORD_FREE_FALLBACK_URL = `http://127.0.0.1:${port}/v1`;
  const { attemptFallback: fresh } = await import('../cli/providerFallback.js');

  // g4f never resolves — the pre-fix behavior stalled the chain indefinitely.
  setG4fFactory({ chatCompletion: () => new Promise(() => {}) });
  const started = Date.now();
  const answer = await fresh('hung provider test', { g4fTimeoutMs: 50 });
  assert.equal(answer, 'rescued by direct fallback');
  assert.ok(Date.now() - started < 5000, 'timeout guard must unblock the chain quickly');
  assert.equal(directHits, 1);

  process.env.SWORD_FREE_FALLBACK_URL = prevUrl;
  setG4fFactory(null);
  server.close();
});
