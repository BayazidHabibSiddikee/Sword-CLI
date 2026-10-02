import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { elapsed, summarizeResult } from './ui.js';

const TOOL_OUTPUT_CHARS = 48000;

// Elide the middle, keep head and tail — the end of a build or test log is the part
// that says what went wrong. Kept local rather than imported from tools.js to avoid
// a module cycle.
function truncateMiddle(body, max) {
  const notice = chars => `\n[truncated ${chars} chars — head and tail preserved]\n`;
  const half = Math.max(1, Math.floor((max - notice(body.length).length) / 2));
  return `${body.slice(0, half)}${notice(body.length - half * 2)}${body.slice(-half)}`;
}

export function providerConfig(env = process.env) {
  const base = new URL(env.OPENAI_BASE_URL || env.PROXY_HOST || 'http://localhost:3001/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Provider URL must not contain credentials, query or fragment');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
    throw new Error('Remote providers require HTTPS');
  }
  const root = base.href.replace(/\/+$/, '');
  return { url: `${root.endsWith('/v1') ? root : `${root}/v1`}/chat/completions`, key: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || 'auto' };
}

export function createRequest(config, tools, signal, onToken) {
  return async messages => {
    if (JSON.stringify(messages).length > 500000) throw new Error('Context limit reached; start a new session with /clear');
    const stream = typeof onToken === 'function';
    const timeout = stream ? 300000 : 120000;
    const response = await fetch(config.url, {
      method: 'POST', redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}),
        ...(stream ? { Accept: 'text/event-stream' } : {})
      },
      body: JSON.stringify({ model: config.model, messages, tools, stream }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}; check endpoint, model and credentials`);
    // Some endpoints ignore `stream`; keep the buffered path as the safe default.
    if (stream && (response.headers.get('content-type') || '').includes('text/event-stream')) {
      return readEventStream(response, onToken);
    }
    return readJsonBody(response);
  };
}

async function readJsonBody(response) {
  let text = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
    if (text.length > 1000000) throw new Error('Provider response too large');
  }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('Invalid provider response'); }
}

/**
 * Assemble an OpenAI-compatible SSE stream into the same shape as a buffered
 * completion, invoking onToken for each content delta. Tool-call deltas arrive
 * fragmented, so they are accumulated by index and returned as whole calls.
 */
export async function readEventStream(response, onToken) {
  if (!response.body) throw new Error('Invalid provider response');
  const decoder = new TextDecoder();
  const calls = new Map();
  let buffer = '';
  let content = '';
  let done = false;
  const consume = payload => {
    if (payload === '[DONE]') { done = true; return; }
    let data;
    try { data = JSON.parse(payload); } catch { return; }
    if (data?.error) throw new Error(data.error.message || 'Provider stream error');
    const delta = data?.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      if (content.length > 1000000) throw new Error('Provider response too large');
      onToken(delta.content);
    }
    for (const call of delta.tool_calls || []) {
      const index = Number.isSafeInteger(call.index) ? call.index : calls.size;
      const entry = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (call.id) entry.id = call.id;
      if (call.type) entry.type = call.type;
      if (call.function?.name) entry.function.name += call.function.name;
      if (typeof call.function?.arguments === 'string') entry.function.arguments += call.function.arguments;
      calls.set(index, entry);
    }
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 2000000) throw new Error('Provider response too large');
    let newline;
    while (!done && (newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data:')) consume(line.slice(5).trim());
    }
    if (done) break;
  }
  if (!done) {
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail.startsWith('data:')) consume(tail.slice(5).trim());
  }
  const message = { role: 'assistant', content: content || null };
  if (calls.size) message.tool_calls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
  return { choices: [{ message }] };
}

// Three tiers, matching cline: a repeated *failing* call hard-stops at 3, a
// repeated erroring call warns at 3 and stops at 5, and a merely repeated
// successful call warns at 5. Cheap, and it stops the model burning all 20 steps
// on the same mistake before the step-limit error discards the whole run.
const LOOP_HARD = 3, LOOP_SOFT = 5, MISTAKE_LIMIT = 3;

function callKey(name, args) {
  let stable;
  try { stable = JSON.stringify(args ?? {}, Object.keys(args ?? {}).sort()); } catch { stable = String(args); }
  return `${name}:${stable}`;
}

export async function runTurn({ messages, request, execute, maxSteps = 20, onEvent = () => {}, onCheckpoint = () => {}, signal }) {
  let history = [...messages];
  const repeats = new Map();
  let mistakes = 0;
  for (let step = 0; step < maxSteps; step++) {
    signal?.throwIfAborted();
    const data = await request(history);
    const msg = data?.choices?.[0]?.message;
    if (!msg || msg.role !== 'assistant') throw new Error('Invalid provider response');
    const calls = msg.tool_calls || [];
    if (!Array.isArray(calls) || calls.length > 16) throw new Error('Invalid tool calls');
    history = [...history, { role: 'assistant', content: msg.content || null, ...(calls.length ? { tool_calls: calls } : {}) }];
    onCheckpoint(history);
    if (!calls.length) {
      if (typeof msg.content !== 'string' || !msg.content.trim()) throw new Error('Empty provider response');
      return { text: msg.content, messages: history };
    }
    let stepFailed = false;
    for (const call of calls) {
      signal?.throwIfAborted();
      if (!call.id || !call.function?.name) throw new Error('Invalid tool call');
      const name = call.function.name;
      onEvent(name);
      const startedAt = performance.now();
      let args = null;
      let failure = null;
      let result = null;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (error) {
        if (signal?.aborted) failure = error;
        else {
          result = { error: `Malformed JSON arguments: ${error.message}` };
          onEvent(name, { ok: false, ms: elapsed(startedAt), summary: error.message });
        }
      }
      if (!failure) {
        const seen = (repeats.get(callKey(name, args)) ?? 0) + 1;
        repeats.set(callKey(name, args), seen);
        const hard = seen >= LOOP_HARD;
        const soft = seen >= LOOP_SOFT;
        if (hard || soft) {
          const detail = `You have called \`${name}\` with identical arguments ${seen} times in a row and it keeps failing. Stop retrying. Re-read the relevant file, reconsider the approach, or tell the user what is blocking you.`;
          if (hard) {
            // Answer with the model's own last words so the turn ends cleanly
            // instead of throwing away every step it already took.
            const spoken = typeof msg.content === 'string' && msg.content.trim() ? msg.content.trim() : null;
            const text = `${spoken ? `${spoken}\n\n` : ''}${detail}`;
            const failedIds = calls.filter(c => c.id).map(c => c.id);
            history = [...history, ...failedIds.map(id => ({ role: 'tool', tool_call_id: id, content: JSON.stringify({ error: 'loop_detected' }) }))];
            onCheckpoint(history);
            return { text, messages: history };
          }
          result = { error: `${detail} (repetition ${seen}/${LOOP_SOFT})` };
        }
      }
      if (!failure && result === null) {
        try {
          result = await execute(name, args);
        } catch (error) {
          if (signal?.aborted) failure = error;
          else {
            result = { error: error.message };
            onEvent(name, { ok: false, ms: elapsed(startedAt), summary: error.message });
          }
        }
      }
      if (failure) {
        checkpointRepair(history, calls, onCheckpoint);
        throw failure;
      }
      signal?.throwIfAborted();
      if (!failure) {
        const ok = result?.error === undefined;
        if (!ok) stepFailed = true;
        const summary = summarizeResult(result) || (args && typeof args.path === 'string' ? args.path : '');
        onEvent(name, { ok, ms: elapsed(startedAt), summary });
      }
      const serialized = JSON.stringify(result ?? null);
      const content = serialized.length > TOOL_OUTPUT_CHARS ? truncateMiddle(serialized, TOOL_OUTPUT_CHARS) : serialized;
      history = [...history, { role: 'tool', tool_call_id: call.id, content }];
      onCheckpoint(history);
    }
    if (stepFailed) {
      mistakes++;
      if (mistakes >= MISTAKE_LIMIT) {
        history = [...history, { role: 'user', content: 'Several tool calls in a row have failed. Stop, re-read the files you changed, and either fix the problem or report precisely what is blocked.' }];
        mistakes = 0;
      }
    } else mistakes = 0;
  }
  throw new Error(`Agent step limit (${maxSteps}) reached`);
}

function checkpointRepair(history, calls, onCheckpoint) {
  const answered = new Set(history.filter(m => m.role === 'tool').map(m => m.tool_call_id));
  const missing = calls.filter(call => call.id && !answered.has(call.id));
  if (!missing.length) return;
  let repaired = history;
  for (const call of missing) {
    repaired = [...repaired, { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'aborted' }) }];
  }
  onCheckpoint(repaired);
}

async function sessionPath(cwd, name) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('Invalid session name');
  const dir = join(cwd, '.flow');
  try { if ((await lstat(dir)).isSymbolicLink()) throw new Error('Unsafe session directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return join(dir, `${name}.json`);
}

export async function loadSession(cwd, name) {
  const file = await sessionPath(cwd, name);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1000000) throw new Error('Unsafe session file');
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (data.cwd !== cwd || !Array.isArray(data.messages) || data.messages.some(m => !['user', 'assistant', 'tool'].includes(m.role))) throw new Error('Invalid session');
    return data.messages;
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function saveSession(cwd, name, messages) {
  const file = await sessionPath(cwd, name);
  await mkdir(join(cwd, '.flow'), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ cwd, messages }), { mode: 0o600, flag: 'wx' });
  await rename(temp, file);
}
