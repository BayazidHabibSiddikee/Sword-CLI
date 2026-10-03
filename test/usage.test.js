import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile, chmod, mkdir } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsageTracker, estimateTokens } from '../cli/usage.js';

async function workspace(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-usage-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

const readRows = async cwd => (await readFile(join(cwd, '.flow', 'usage.jsonl'), 'utf8'))
  .split('\n').filter(Boolean).map(line => JSON.parse(line));

test('estimateTokens is ceil(chars/4) and never throws', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens('x'.repeat(400001)), 100001);
});

test('a turn appends one JSON line to .flow/usage.jsonl with the documented fields', async t => {
  const cwd = await workspace(t);
  const tracker = createUsageTracker({ cwd, provider: 'g4f', now: () => 1_700_000_000_000 });
  const row = await tracker.recordTurn({
    model: 'gpt-4o-mini', promptTokens: 1200, completionTokens: 340, durationMs: 2100, estimated: false, costUsd: 0.0042,
  });

  const rows = await readRows(cwd);
  assert.equal(rows.length, 1, 'exactly one line per turn');
  assert.deepEqual(row, {
    ts: new Date(1_700_000_000_000).toISOString(),
    model: 'gpt-4o-mini',
    provider: 'g4f',
    tokens_in: 1200,
    tokens_out: 340,
    cost_usd: 0.0042,
    duration_ms: 2100,
    estimated: false,
  });
  assert.deepEqual(rows[0], row, 'the returned row is the persisted row');

  // A second turn appends rather than overwriting.
  await tracker.recordTurn({ model: 'gpt-4o-mini', promptTokens: 10, completionTokens: 5 });
  assert.equal((await readRows(cwd)).length, 2);
  // cost_usd is omitted, not written as 0: an unknown cost is not a free turn.
  assert.equal('cost_usd' in (await readRows(cwd))[1], false);
});

test('usage.jsonl is created 0600 and re-hardened on every append', async t => {
  const cwd = await workspace(t);
test('the tracker accumulates per-turn and per-session totals', async t => {
  const cwd = await workspace(t);
  const tracker = createUsageTracker({ cwd });
  assert.deepEqual(tracker.session(), { turns: 0, tokens_in: 0, tokens_out: 0, tokens: 0, duration_ms: 0, by_model: {} });

  await tracker.recordTurn({ model: 'a', promptTokens: 100, completionTokens: 50, durationMs: 500 });
  await tracker.recordTurn({ model: 'a', promptTokens: 100, completionTokens: 25, durationMs: 500 });
  await tracker.recordTurn({ model: 'b', promptTokens: 10, completionTokens: 5, durationMs: 100, costUsd: 0.5 });

  const session = tracker.session();
  assert.equal(session.turns, 3);
  assert.equal(session.tokens_in, 210, 'totals accumulate across turns');
  assert.equal(session.tokens_out, 80);
  assert.equal(session.tokens, 290, 'tokens is the combined figure');
  assert.equal(session.duration_ms, 1100);
  assert.equal(session.cost_usd, 0.5);
  assert.deepEqual(session.by_model.a, { turns: 2, tokens_in: 200, tokens_out: 75 });
  assert.deepEqual(session.by_model.b, { turns: 1, tokens_in: 10, tokens_out: 5 });

  // The file and the in-memory totals agree.
  const rows = await readRows(cwd);
  assert.equal(rows.reduce((sum, r) => sum + r.tokens_in, 0), 210);

  tracker.reset();
  assert.deepEqual(tracker.session(), { turns: 0, tokens_in: 0, tokens_out: 0, tokens: 0, duration_ms: 0, by_model: {} });
  assert.equal((await readRows(cwd)).length, 3, 'reset clears counters, never the history file');
});

test('a usage row never carries a secret, whatever the caller passes', async t => {
  const cwd = await workspace(t);
  const tracker = createUsageTracker({ cwd });
  await tracker.recordTurn({
    model: 'gpt-4o-mini', promptTokens: 10, completionTokens: 10,
    apiKey: 'sk-live-SECRET', authorization: 'Bearer sk-live-SECRET', key: 'sk-live-SECRET',
  });
  const raw = await readFile(join(cwd, '.flow', 'usage.jsonl'), 'utf8');
  assert.ok(!raw.includes('SECRET'), 'no caller-supplied credential may reach disk');
  // A whitelist, not a denylist: only the documented keys are ever written.
  assert.deepEqual(Object.keys((await readRows(cwd))[0]).sort(),
    ['duration_ms', 'estimated', 'model', 'provider', 'tokens_in', 'tokens_out', 'ts'].sort());
});

test('session() returns a frozen snapshot that cannot mutate tracker state', async t => {
  const cwd = await workspace(t);
  const tracker = createUsageTracker({ cwd });
  await tracker.recordTurn({ model: 'a', promptTokens: 10, completionTokens: 5 });
  const snapshot = tracker.session();
  assert.ok(Object.isFrozen(snapshot));
  assert.throws(() => { 'use strict'; snapshot.turns = 99; }, TypeError);
  assert.equal(tracker.session().turns, 1);
});

test('recordTurn creates .flow when absent and clamps unusable counts', async t => {
  const cwd = await workspace(t);
  const tracker = createUsageTracker({ cwd });
  await tracker.recordTurn({ model: 'm' }); // no .flow dir yet
  assert.ok((await stat(join(cwd, '.flow'))).isDirectory());
  await tracker.recordTurn({ model: 'm', promptTokens: -5, completionTokens: NaN, durationMs: 'fast' });
  const row = (await readRows(cwd))[1];
  assert.equal(row.tokens_in, 0, 'negative and non-numeric counts clamp to 0');
  assert.equal(row.duration_ms, 0);
  assert.equal(row.estimated, true, 'the default is "this was a guess"');
});
  const tracker = createUsageTracker({ cwd });
  await tracker.recordTurn({ model: 'm', promptTokens: 1, completionTokens: 1 });
  const file = join(cwd, '.flow', 'usage.jsonl');
  assert.equal((await stat(file)).mode & 0o777, 0o600, 'usage.jsonl must be owner-only');

  // appendFile's mode is ignored for an existing file, so a loosened one created
  // by an earlier build must be repaired rather than trusted.
  await chmod(file, 0o644);
  await tracker.recordTurn({ model: 'm', promptTokens: 1, completionTokens: 1 });
  assert.equal((await stat(file)).mode & 0o777, 0o600, 'mode must be re-applied on append');
});