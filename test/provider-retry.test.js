import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyError, computeBackoff, withRetry, CircuitBreaker, providerHealth,
  parseRetryAfter, circuitOpenError, RETRY_KINDS,
} from '../cli/providerRetry.js';

// A retry must never make a test wait: sleep records the requested delay and
// resolves immediately, so backoff values are asserted directly.
const instantSleep = async () => {};
const errorWith = fields => Object.assign(new Error(fields.message ?? 'boom'), fields);

test('classifyError maps 429 to rate_limited and honours Retry-After', () => {
  const verdict = classifyError({ status: 429, message: 'Too Many Requests', headers: new Map([['retry-after', '7']]) });
  assert.equal(verdict.kind, 'rate_limited');
  assert.equal(verdict.status, 429);
  assert.equal(verdict.retryAfterMs, 7000, 'Retry-After: 7 must become 7000ms');
  // An HTTP-date Retry-After is also accepted, resolved against the injected clock.
  const dated = classifyError({ status: 429, retryAfter: new Date(1_000_000).toUTCString() }, { now: 900_000 });
  assert.equal(dated.retryAfterMs, 100_000);
  assert.equal(parseRetryAfter('nonsense'), undefined);
  assert.equal(parseRetryAfter(''), undefined);
  assert.equal(parseRetryAfter(undefined), undefined);
});

test('classifyError splits transient, auth, capability and model failures', () => {
  assert.equal(classifyError({ status: 503, message: 'service unavailable' }).kind, 'transient');
  assert.equal(classifyError(new Error('fetch failed: ECONNREFUSED')).kind, 'transient');
  assert.equal(classifyError({ status: 500, message: 'internal server error' }).kind, 'transient');
  assert.equal(classifyError({ status: 401, message: 'unauthorized' }).kind, 'auth');
  assert.equal(classifyError({ status: 403, message: 'forbidden' }).kind, 'auth');
  assert.equal(classifyError({ status: 400, message: "this model does not support 'tools'" }).kind, 'capability');
  assert.equal(classifyError({ status: 404, message: 'model not found' }).kind, 'model_missing');
  assert.equal(classifyError(new Error('Some unrecognized provider shape')).kind, 'fatal');

  // A status wins over message sniffing: a 401 whose body mentions rate limits is
  // still a dead key, not a throttle.
  assert.equal(classifyError({ status: 401, message: 'rate limit exceeded' }).kind, 'auth');

  // AbortError is fatal (never retried); TimeoutError is transient (worth a retry).
  assert.equal(classifyError(new DOMException('aborted', 'AbortError')).kind, 'fatal');
  assert.equal(classifyError(new DOMException('timed out', 'TimeoutError')).kind, 'transient');

  // The pre-fix generic string from cli/agent.js, where status was discarded.
  assert.equal(classifyError(new Error('Provider HTTP 503; check endpoint')).kind, 'transient');
  assert.equal(classifyError(new Error('Provider HTTP 401')).kind, 'auth');
});

test('computeBackoff is monotonic, capped and jittered', () => {
  // jitter 0 removes the random component, leaving a clean exponential ladder.
  const ladder = [0, 1, 2, 3, 4].map(a => computeBackoff(a, { baseMs: 500, capMs: 15000, jitter: 0 }));
  assert.deepEqual(ladder, [500, 1000, 2000, 4000, 8000]);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i] >= ladder[i - 1], 'backoff must be monotonic in attempt');
  }
  assert.equal(computeBackoff(99, { baseMs: 500, capMs: 15000, jitter: 0 }), 15000, 'capped at capMs');

  // Jitter varies the delay around the same ladder but never escapes the bounds.
  const spread = new Set(Array.from({ length: 40 }, () => computeBackoff(2, { baseMs: 500, jitter: 0.5 })));
  assert.ok(spread.size > 1, 'jitter must actually vary the delay');
  for (const value of spread) assert.ok(value >= 1000 && value <= 3000, `jittered value ${value} out of bounds`);

  // retryAfterMs wins over the ladder, but is still bounded by capMs so a hostile
  // one-hour Retry-After cannot wedge a turn.
  assert.equal(computeBackoff(0, { retryAfterMs: 2500 }), 2500);
  assert.equal(computeBackoff(0, { retryAfterMs: 3_600_000, capMs: 15000 }), 15000);
  assert.equal(computeBackoff(0, { jitter: 0 }), 500);
});

test('withRetry retries a transient failure then resolves', async () => {
  let calls = 0;
  const slept = [];
  const value = await withRetry(async () => {
    if (calls++ < 2) throw errorWith({ status: 503, message: 'service unavailable' });
    return 'ok';
  }, { attempts: 4, sleep: async ms => slept.push(ms), backoff: { jitter: 0 } });
  assert.equal(value, 'ok');
  assert.equal(calls, 3, 'two failures then a success');
  assert.deepEqual(slept, [500, 1000], 'delays follow the backoff ladder');
});

test('withRetry retries a 503 exactly as many times as configured', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => {
    calls += 1;
    throw errorWith({ status: 503 });
  }, { attempts: 3, sleep: instantSleep, backoff: { jitter: 0 } }), /boom/);
  assert.equal(calls, 3, 'attempts is a total attempt budget, not extra retries');
});

test('withRetry never retries auth, capability or fatal failures', async () => {
  for (const failure of [
    errorWith({ status: 401, message: 'invalid api key' }),
    errorWith({ status: 400, message: 'tools is not supported by this model' }),
    errorWith({ status: 404, message: 'unknown model' }),
    new Error('something unclassifiable'),
  ]) {
    let calls = 0;
    await assert.rejects(withRetry(async () => { calls += 1; throw failure; },
      { attempts: 4, sleep: instantSleep }), () => true);
    assert.equal(calls, 1, `${failure.message} must not be retried`);
  }
});

test('withRetry never retries an AbortError or a cancelled signal', async () => {
  let calls = 0;
  const abort = new DOMException('aborted', 'AbortError');
  await assert.rejects(withRetry(async () => { calls += 1; throw abort; },
    { attempts: 4, sleep: instantSleep }), err => err.name === 'AbortError');
  assert.equal(calls, 1, 'a user cancel must surface immediately');

  // An already-aborted signal means no attempt at all.
  calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; return 'never'; },
    { attempts: 4, signal: AbortSignal.abort(), sleep: instantSleep }));
  assert.equal(calls, 0);
});

test('withRetry reports each retry and passes the classified verdict', async () => {
  const retries = [];
  let calls = 0;
  await withRetry(async () => {
    if (calls++ < 1) throw errorWith({ status: 429, retryAfter: '3' });
    return 'ok';
  }, { attempts: 3, sleep: instantSleep, onRetry: info => retries.push(info) });
  assert.equal(retries.length, 1);
  assert.equal(retries[0].attempt, 1);
  assert.equal(retries[0].remaining, 2, '2 of the 3 attempts remain after the first retry');
  assert.equal(retries[0].kind, 'rate_limited');
  assert.equal(retries[0].delayMs, 3000, 'Retry-After drives the delay');
  assert.deepEqual(RETRY_KINDS, ['transient', 'rate_limited'], 'only these two kinds are retried');
});
test('CircuitBreaker opens after N transient failures, half-opens, then resets', () => {
  let clock = 1_000_000;
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000, maxCooldownMs: 300_000, now: () => clock });

  assert.ok(breaker.allow(), 'a fresh breaker allows traffic');
  breaker.onFailure({ kind: 'transient' });
  breaker.onFailure({ kind: 'transient' });
  assert.equal(breaker.snapshot().state, 'closed', 'two of three failures stay closed');
  breaker.onFailure({ kind: 'rate_limited' });
  const opened = breaker.snapshot();
  assert.equal(opened.state, 'open', 'the Nth consecutive transient failure opens it');
  assert.ok(opened.retryInMs > 0);
  assert.equal(breaker.allow(), false, 'open denies traffic');

  clock += 60_000; // the first open pays 2x baseCooldownMs, not 1x
  assert.equal(breaker.allow(), true, 'cooldown expiry admits a half-open probe');
  assert.equal(breaker.snapshot().state, 'half_open');
  breaker.onSuccess();
  const closed = breaker.snapshot();
  assert.equal(closed.state, 'closed');
  assert.equal(closed.failures, 0);
  assert.equal(closed.reopens, 0, 'a success resets the escalation ladder');
  assert.equal(breaker.allow(), true);
});

test('CircuitBreaker does not open on auth or capability failures', () => {
  for (const kind of ['auth', 'capability', 'model_missing', 'fatal']) {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => 0 });
    breaker.onFailure({ kind });
    breaker.onFailure({ kind });
    assert.equal(breaker.snapshot().state, 'closed', `${kind} must not open the breaker`);
    assert.ok(breaker.allow(), `${kind} must not block traffic`);
  }
});

test('CircuitBreaker reopens a half-open probe and escalates the cooldown', () => {
  let clock = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, maxCooldownMs: 4000, now: () => clock });
  breaker.onFailure({ kind: 'transient' });
  // Mirrors the server's escalating ladder: the first open already pays 2x base.
  assert.equal(breaker.snapshot().cooldownMs, 2000);
  clock += 2000;
  assert.ok(breaker.allow());
  breaker.onFailure({ kind: 'transient' });
  const escalated = breaker.snapshot();
  assert.equal(escalated.state, 'open', 'a failed probe reopens');
  assert.equal(escalated.cooldownMs, 4000, 'reopening doubles the cooldown');
  clock += 4000;
  breaker.allow();
  breaker.onFailure({ kind: 'transient' });
  assert.equal(breaker.snapshot().cooldownMs, 4000, 'escalation is capped at maxCooldownMs');
});

test('the shared providerHealth breaker is closed and reports a snapshot', () => {
  const snapshot = providerHealth.snapshot();
  assert.equal(typeof snapshot.state, 'string');
  assert.ok(providerHealth instanceof CircuitBreaker);
  // The circuit-open error is classified as transient so a caller that races the
  // breaker still gets a sane verdict rather than a fatal.
  const error = circuitOpenError(providerHealth);
  assert.equal(classifyError(error).kind, 'transient');
  assert.ok(Number.isFinite(error.retryAfterMs));
});