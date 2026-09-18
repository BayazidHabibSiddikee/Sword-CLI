import { test } from 'node:test';
import assert from 'node:assert/strict';

test('providerFallback uses g4f and validates prompts/results', async t => {
  let payload = 'default';
  t.mock.module('g4f', {
    namedExports: {
      G4F: class {
        async chatCompletion() {
          return payload;
        }
      }
    }
  });

  const { fallbackNotice, attemptFallback } = await import('../cli/providerFallback.js');

  assert.ok(fallbackNotice().startsWith('[Fallback]'));
  assert.ok(fallbackNotice().includes('g4f'));

  for (const prompt of ['', '   ', '\t\n']) {
    await assert.rejects(attemptFallback(prompt), /Fallback prompt must not be empty/);
  }

  payload = 'anonymous answer';
  assert.equal(await attemptFallback('anything'), 'anonymous answer');

  payload = { content: 'content payload' };
  assert.equal(await attemptFallback('anything'), 'content payload');

  payload = { text: '' };
  await assert.rejects(attemptFallback('anything'), /Fallback provider returned no text/);
});
