// Provider failure classification, bounded retry and a shared circuit breaker.
//
// Why this exists: cli/agent.js turns every non-2xx into a generic
// `Provider HTTP ${status}` string and cli/providerFallback.js fires on the first
// failure. Status, body and Retry-After are discarded at the throw site, so
// nothing downstream can tell a 429 (wait, ask again) from a 401 (stop, the key
// is dead) — so every failure degrades to chat prose immediately and the user's
// turn is thrown away.
//
// Semantics are mirrored from the server router on purpose:
//   - swordcli/server/src/routes/proxy.ts `isRetryableError` — which upstream
//     classes are worth another attempt (429/5xx/network) versus which need a
//     config fix (401/403) or a different model (404, tools unsupported).
//   - swordcli/server/src/services/ratelimit.ts `getCooldownDurationForLimit` —
//     an upstream Retry-After is honoured, and a repeated failure escalates a
//     cooldown instead of retrying at the same short delay forever.
//
// Everything here is pure or clock-injectable: `sleep` and `now` are injected so
// tests never actually wait.

export const RETRY_KINDS = Object.freeze(['transient', 'rate_limited']);
export const ALL_KINDS = Object.freeze([
  'transient', 'rate_limited', 'auth', 'capability', 'model_missing', 'fatal'
]);
const DEFAULT_BACKOFF = Object.freeze({ baseMs: 500, capMs: 15000, jitter: 0.5 });

// Message patterns mirror proxy.ts isRetryableError, kept in one place so a new
// upstream failure class is classified once rather than per caller.
const CAPABILITY_RE = /\btools?\b[^.\n]{0,40}(not supported|unsupported|is not available|disabled|not enabled)|(does not|doesn't|cannot|can't) (support|handle)[^.\n]{0,20}\btools?\b|function calling (is )?not (supported|available)|tool_use[^.\n]{0,30}unsupported/i;
const MODEL_MISSING_RE = /model[_ ]?not[_ ]?found|unknown model|no such model|does not exist|is not (a )?(known|available) model|no endpoints found|removed or deprecated/i;
const RATE_RE = /rate limit|too many requests|quota|resource[_ ]?exhausted|capacity exceeded|overloaded/i;
const AUTH_RE = /\bunauthori[sz]ed\b|\bforbidden\b|invalid api key|incorrect api key|permission denied/i;
const NETWORK_RE = /fetch failed|network (error|request failed)|econnrefused|econnreset|etimedout|enotfound|eai_again|ehostunreach|enetunreach|epipe|socket hang up|other side closed|und_err|dns/i;
const TRANSIENT_TEXT_RE = /\b(500|502|503|504|520|522|524|525|526|527|529)\b|internal server error|bad gateway|service unavailable|gateway timeout|temporarily unavailable/i;


/**
 * Parse a Retry-After header (delta-seconds or an HTTP date) into milliseconds.
 * Returns undefined for anything unparseable so callers fall back to backoff.
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : undefined;
  const raw = String(value).trim();
  if (raw === '') return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

/** Retry-After in milliseconds from any shape a throw site might use. */
function retryAfterOf(err, now) {
  if (typeof err?.retryAfterMs === 'number' && Number.isFinite(err.retryAfterMs)) return err.retryAfterMs;
  const header = err?.retryAfter
    ?? err?.headers?.get?.('retry-after')
    ?? err?.response?.headers?.get?.('retry-after');
  return parseRetryAfter(header, now);
}

function statusOf(err) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.response?.status);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

const verdict = (kind, message, extra = {}) => ({ kind, message: message || kind, ...extra });

/**
 * Classify a provider failure into one of ALL_KINDS.
 *
 * Status-only classes win over message sniffing (a 401 is an auth failure even if
 * its body mentions rate limits), but the reverse is deliberate: a 400 whose body
 * says "tools is not supported" is a capability loss, not a fatal request bug.
 *
 * @param {unknown} err
 * @param {{now?: number}} [opts]
 * @returns {{kind: string, status?: number, retryAfterMs?: number, message: string}}
 */
export function classifyError(err, { now = Date.now() } = {}) {
  const message = typeof err?.message === 'string' ? err.message : String(err ?? 'unknown provider error');
  const status = statusOf(err);
  const retryAfterMs = retryAfterOf(err, now);

  if (status === 429) return verdict('rate_limited', message, { status, retryAfterMs });
  if (status === 401 || status === 403) return verdict('auth', message, { status, retryAfterMs });
  if (status === 404) return verdict('model_missing', message, { status, retryAfterMs });
  if (status !== undefined && status >= 500) return verdict('transient', message, { status, retryAfterMs });

  // A user cancel is never retried and never blamed on the provider. This is checked
  // before an explicit kind so a cancel can never be mislabelled retryable.
  if (err?.name === 'AbortError' || err?.abortedByUser === true) return verdict('fatal', message, { status });
  // A throw site that already knows its own class (cli/providerRetry's own
  // circuit-open error, a caller that inspected the body) wins over inference.
  if (ALL_KINDS.includes(err?.kind)) return verdict(err.kind, message, { status, retryAfterMs });
  // AbortSignal.timeout rejects with a TimeoutError DOMException: a hung provider
  // is worth another attempt, unlike a cancel.
  if (err?.name === 'TimeoutError') return verdict('transient', message, { status, retryAfterMs });

  if (CAPABILITY_RE.test(message)) return verdict('capability', message, { status, retryAfterMs });
  if (MODEL_MISSING_RE.test(message)) return verdict('model_missing', message, { status, retryAfterMs });
  if (RATE_RE.test(message)) return verdict('rate_limited', message, { status, retryAfterMs });
  if (AUTH_RE.test(message)) return verdict('auth', message, { status, retryAfterMs });
  if (status === undefined && NETWORK_RE.test(message)) return verdict('transient', message, { status, retryAfterMs });
  if (TRANSIENT_TEXT_RE.test(message)) return verdict('transient', message, { status, retryAfterMs });
  // A 429/401/5xx hiding inside the generic `Provider HTTP <status>` string that
  // cli/agent.js throws today, where status and body are still unavailable.
  const generic = /\bhttp\s*(\d{3})\b/i.exec(message);
  if (generic) {
    const code = Number(generic[1]);
    if (code === 429) return verdict('rate_limited', message, { status: code, retryAfterMs });
    if (code === 401 || code === 403) return verdict('auth', message, { status: code, retryAfterMs });
    if (code >= 500) return verdict('transient', message, { status: code, retryAfterMs });
  }
  return verdict('fatal', message, { status, retryAfterMs });
}

/**
 * Exponential backoff with jitter, capped and monotonic in `attempt`.
 *
 * `attempt` is 0-based (0 → baseMs, 1 → 2·baseMs, …). Jitter is a ±fraction
 * multiplier so a fleet of clients does not resynchronise on the same provider
 * after a shared outage; `jitter: 0` (or an injected `random`) makes it
 * deterministic for tests. The exponential sequence itself is monotonic — only
 * the per-call jitter spreads it around that sequence.
 *
 * An upstream Retry-After wins outright when present (mirroring
 * getCooldownDurationForLimit's "extend when the provider asks for longer"),
 * still bounded by capMs so a hostile one-hour Retry-After cannot wedge a turn.
 */
export function computeBackoff(attempt, opts = {}) {
  const { baseMs, capMs, jitter } = { ...DEFAULT_BACKOFF, ...opts };
  const { random = Math.random } = opts;
  const retryAfterMs = Number.isFinite(opts.retryAfterMs) && opts.retryAfterMs >= 0 ? opts.retryAfterMs : null;
  if (retryAfterMs !== null) return Math.min(retryAfterMs, capMs);
  const step = Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
  const exponential = Math.min(baseMs * 2 ** step, capMs);
  const spread = Math.min(Math.max(jitter, 0), 1);
  const factor = spread === 0 ? 1 : 1 + (random() * 2 - 1) * spread;
  return Math.min(Math.max(Math.round(exponential * factor), 0), capMs);
}

/** Default sleep; abort-aware so a cancel during backoff is immediate. */
function defaultSleep(ms, { signal } = {}) {
  if (!signal) return new Promise(resolve => { setTimeout(resolve, ms); });
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const isAbort = err => err?.name === 'AbortError' || err?.abortedByUser === true;

/**
 * Run `fn` with bounded retries on transient/rate_limited failures only.
 *
 * Never retries an AbortError or a user cancellation, and never retries auth,
 * capability, model_missing or fatal failures — those need a config change, and
 * hammering them only burns quota and delays the real error the user must see.
 *
 * `sleep` and `classify` are injectable, so tests are instant and deterministic.
 *
 * @param {(attempt: number) => Promise<any>} fn
 * @param {{attempts?: number, signal?: AbortSignal, onRetry?: Function,
 *          classify?: Function, sleep?: Function, backoff?: object}} [options]
 */
export async function withRetry(fn, options = {}) {
  const {
    attempts = 4, signal, onRetry, classify = classifyError,
    sleep = defaultSleep, backoff = {},
  } = options;
  const total = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;
  let lastError;
  for (let attempt = 0; attempt < total; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (isAbort(error)) throw error;
      if (signal?.aborted) throw error;
      const result = classify(error) ?? { kind: 'fatal', message: String(error) };
      if (attempt === total - 1 || !RETRY_KINDS.includes(result.kind)) throw error;
      const delayMs = computeBackoff(attempt, { ...backoff, retryAfterMs: result.retryAfterMs });
      onRetry?.({ attempt: attempt + 1, remaining: total - attempt - 1, delayMs, error, kind: result.kind, verdict: result });
      await sleep(delayMs, { signal });
    }
  }
  throw lastError;
}

/**
 * Escalating circuit breaker, mirroring the server's cooldown ladder: the first
 * open costs `cooldownMs` and every reopen doubles it up to `maxCooldownMs`, so a
 * provider that is genuinely down is not re-probed on every single turn.
 *
 * Only transient/rate_limited failures count. An auth or capability failure is a
 * configuration fact, not provider health — opening on those would hide a fixable
 * 401 behind "try again later".
 */
export class CircuitBreaker {
  #state = 'closed';
  #failures = 0;
  #reopens = 0;
  #cooldownMs;
  #openedAt = 0;
  #probeInFlight = false;

  constructor({ failureThreshold = 5, cooldownMs = 30000, maxCooldownMs = 300000, now = Date.now } = {}) {
    this.failureThreshold = failureThreshold;
    this.baseCooldownMs = cooldownMs;
    this.maxCooldownMs = maxCooldownMs;
    this.now = now;
    this.#cooldownMs = cooldownMs;
  }

  get state() { return this.#state; }

  /** True when a request may be attempted; promotes open → half_open on expiry. */
  allow() {
    if (this.#state === 'closed') return true;
    if (this.#state === 'half_open') {
      // One probe at a time: a half-open breaker that admits the whole queue has
      // not limited anything.
      if (this.#probeInFlight) return false;
      this.#probeInFlight = true;
      return true;
    }
    if (this.now() - this.#openedAt < this.#cooldownMs) return false;
    this.#state = 'half_open';
    this.#probeInFlight = true;
    return true;
  }

  onSuccess() {
    this.#state = 'closed';
    this.#failures = 0;
    this.#reopens = 0;
    this.#cooldownMs = this.baseCooldownMs;
    this.#probeInFlight = false;
  }

  /** @param {string|{kind?: string}} failure a classifyError verdict (or its kind). */
  onFailure(failure) {
    const kind = typeof failure === 'string' ? failure : failure?.kind;
    if (!RETRY_KINDS.includes(kind)) {
      // Not the provider being unhealthy: release any probe, keep the state, so an
      // auth failure during a half-open probe is not mistaken for a lost cause.
      this.#probeInFlight = false;
      return this.snapshot();
    }
    this.#probeInFlight = false;
    if (this.#state === 'half_open') return this.#open();
    this.#failures += 1;
    if (this.#failures >= this.failureThreshold) this.#open();
    return this.snapshot();
  }

  #open() {
    this.#reopens += 1;
    this.#state = 'open';
    this.#failures = 0;
    this.#openedAt = this.now();
    this.#cooldownMs = Math.min(this.baseCooldownMs * 2 ** this.#reopens, this.maxCooldownMs);
  }

  reset() {
    this.#state = 'closed';
    this.#failures = 0;
    this.#reopens = 0;
    this.#cooldownMs = this.baseCooldownMs;
    this.#openedAt = 0;
    this.#probeInFlight = false;
  }

  snapshot() {
    const now = this.now();
    return Object.freeze({
      state: this.#state,
      failures: this.#failures,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.#cooldownMs,
      reopens: this.#reopens,
      openedAt: this.#openedAt || null,
      retryInMs: this.#state === 'open' ? Math.max(0, this.#cooldownMs - (now - this.#openedAt)) : 0,
      now
    });
  }
}

/** The process-wide breaker, shared by the request path and the fallback path. */
export const providerHealth = new CircuitBreaker();

/** Error thrown when the breaker is open; classifies as transient with a Retry-After. */
export function circuitOpenError(breaker = providerHealth) {
  const { retryInMs } = breaker.snapshot();
  const error = new Error(`Provider circuit open after repeated failures; retry in ${Math.ceil(retryInMs / 1000)}s`);
  error.name = 'ProviderCircuitOpenError';
  error.retryAfterMs = retryInMs;
  error.kind = 'transient';
  return error;
}

