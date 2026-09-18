import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureSwordBackend } from '../cli/backend.js';

test('default Sword uses local unified key instead of inherited provider key', async () => {
  const env = { OPENAI_API_KEY: 'unrelated-provider-secret' };
  const result = await configureSwordBackend(env, async () => 'local-unified-key');
  assert.equal(result.OPENAI_BASE_URL, 'http://127.0.0.1:3001/v1');
  assert.equal(result.OPENAI_API_KEY, 'local-unified-key');
  assert.equal(env.OPENAI_API_KEY, 'unrelated-provider-secret');
});
test('explicit provider configuration never reads the local backend credential', async () => {
  const env = { OPENAI_BASE_URL: 'https://example.com/v1', OPENAI_API_KEY: 'explicit' };
  const result = await configureSwordBackend(env, async () => { throw new Error('must not read'); });
  assert.deepEqual(result, env);
});
test('explicit remote Sword backend requires its own token and never reads local secrets', async () => {
  await assert.rejects(configureSwordBackend({ SWORDCLI_BASE_URL: 'https://example.com' }, async () => { throw new Error('local key leaked'); }), /SWORDCLI_TOKEN/);
  const result = await configureSwordBackend({ SWORDCLI_BASE_URL: 'https://example.com', SWORDCLI_TOKEN: 'remote' }, async () => { throw new Error('must not read'); });
  assert.equal(result.OPENAI_API_KEY, 'remote');
});
test('missing local configuration gives actionable error without credentials', async () => {
  await assert.rejects(configureSwordBackend({}, async () => ''), /unified API key/);
});
test('explicit local OPENAI_BASE_URL bypasses the local backend loader entirely', async () => {
  const env = { OPENAI_BASE_URL: 'https://example.com/v1/', OPENAI_API_KEY: 'explicit' };
  const result = await configureSwordBackend(env, async () => { throw new Error('must not read local key'); });
  assert.deepEqual(result, env);
});
test('remote SWORDCLI_BASE_URL rejects credentials, query and fragment in the URL', async () => {
  for (const url of [
    'https://user:pass@example.com',
    'https://example.com/?key=x',
    'https://example.com#frag'
  ]) {
    await assert.rejects(configureSwordBackend({ SWORDCLI_BASE_URL: url, SWORDCLI_TOKEN: 't' }, async () => 'key'), url);
  }
});
test('remote SWORDCLI_BASE_URL requires HTTPS', async () => {
  await assert.rejects(configureSwordBackend({ SWORDCLI_BASE_URL: 'http://example.com', SWORDCLI_TOKEN: 't' }, async () => 'key'), /HTTPS/);
});
