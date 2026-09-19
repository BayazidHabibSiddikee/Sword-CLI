import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackNotice, attemptFallback, setG4fFactory } from '../cli/providerFallback.js';

test('providerFallback uses g4f and validates prompts/results', async () => {
  assert.ok(fallbackNotice().startsWith('[Fallback]'));
  assert.ok(fallbackNotice().includes('g4f'));

  for (const prompt of ['', '   ', '\t\n']) {
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
