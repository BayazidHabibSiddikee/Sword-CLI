import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { elapsed, summarizeResult } from './ui.js';
import { isMcpToolName, isMcpMutating } from './mcp/dispatch.js';
import { prepareCalls, partitionCalls, runReadonly, runMutation, foldResults } from './executor.js';

// Truncation + loop helpers moved to executor.js (single source). agent.js keeps
// only the request/turn orchestration; the fold there applies the same head+tail
// bound the executor uses.

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

// Three tiers, and only a genuine FAILURE climbs the stop ladder. The previous
// guard counted a call *before* its outcome was known, so three identical
// SUCCESSFUL calls tripped the "it keeps failing" stop, and the soft tier
// (`seen >= 5`) was unreachable because it sat behind `seen >= 3`.
//   - soft  / LOOP_SOFT   (consecutive identical failures >= 2): guidance, keep going
//   - hard  / LOOP_HARD   (consecutive identical failures >= 3): stop the turn
//   - repeat/ LOOP_REPEAT (consecutive identical successes >= 5): a note, never stops
// Loop thresholds live in executor.js now (single source of truth for the stop
// ladder); runTurn below delegates accounting to prepareCalls, so no local
// LOOP_*/callKey helpers remain. MISTAKE_LIMIT stays here: it counts consecutive
// failed STEPS (not identical calls) and is unrelated to the loop ladder.
const MISTAKE_LIMIT = 3;

export async function runTurn({ messages, request, execute, maxSteps = 20, onEvent = () => {}, onCheckpoint = () => {}, signal, maxParallel }) {
  let history = [...messages];
  const repeats = new Map();
  let mistakes = 0;
  // Read-only detection mirrors the safety gate: anything that can mutate the
  // tree or the knowledge base breaks the parallel run; only write/edit batches.
  const MUTATING = new Set(['write_file', 'edit_file', 'apply_patch', 'run_command', 'save_to_rag']);
  const BATCHABLE = new Set(['write_file', 'edit_file']);
  // Phase 4: MCP tools are arbitrary remote code — every call needs its own
  // explicit grant (permit gate in dispatch.js), so none are batchable. Reads
  // run with the readonly segment; destructive verbs run strictly sequential.
  const isMutatingCall = call => {
    const name = call?.function?.name ?? '';
    if (MUTATING.has(name)) return true;
    if (isMcpToolName(name)) return isMcpMutating(name);
    return false;
  };
  // A caller-supplied batch (tools.js execute.batch) runs consecutive same-name
  // edit segments with ONE approval + ONE checkpoint; without it mutations run
  // one by one. Function check, not truthiness.
  const batchFn = typeof execute?.batch === 'function' ? execute.batch : undefined;
  const mcpDispatch = typeof execute?.mcp === 'function' ? execute.mcp : null;
  const runOne = async entry => {
    if (entry.argsError) return { error: entry.argsError };
    // Phase 4: mcp__ tools route to the MCP dispatcher (permit gate + timeout
    // inside). Without a bound dispatcher this is a model-visible error, never
    // a connection attempt — no config means the SDK is never imported.
    if (isMcpToolName(entry.name)) {
      if (!mcpDispatch) return { error: `Unknown tool: ${entry.name} (no MCP servers configured)` };
      try {
        return await mcpDispatch(entry.name, entry.args);
      } catch (error) {
        return { error: error?.message ?? String(error) };
      }
    }
    return execute(entry.name, entry.args);
  };
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
    for (const call of calls) {
      if (!call?.id || !call.function?.name) throw new Error('Invalid tool call');
    }
    const segments = partitionCalls(calls, {
      isMutating: isMutatingCall,
      batchable: call => BATCHABLE.has(call?.function?.name),
    });
    const completed = [];
    let failure = null;
    for (const segment of segments) {
      if (signal?.aborted) { failure ??= signal.reason ?? new Error('aborted'); break; }
      if (segment.kind === 'readonly') {
        const outcomes = await runReadonly(segment.calls,
          { run: runOne, signal, onEvent, ...(maxParallel === undefined ? {} : { maxParallel }) });
        completed.push(...outcomes);
        failure ??= outcomes.failure ?? null;
      } else if (segment.kind === 'batch' && segment.calls.length > 1 && batchFn) {
        const startedAt = Date.now();
        for (const entry of segment.calls) {
          try { onEvent?.(entry.name); } catch { /* UI must not break execution */ }
        }
        try {
          const produced = await batchFn(segment.calls[0].name, segment.calls);
          const list = Array.isArray(produced) ? produced : [];
          segment.calls.forEach((entry, i) => {
            const result = list[i] ?? { error: 'batch produced no result' };
            completed.push({ id: entry.id, index: entry.index, name: entry.name,
              args: entry.args, ok: result?.error === undefined, result: result ?? null,
              ms: Math.max(0, Date.now() - startedAt) });
            try { onEvent?.(entry.name, { ok: result?.error === undefined,
              ms: elapsed(startedAt), summary: summarizeResult(result) || (entry.args?.path ?? '') }); } catch { /* ignore */ }
          });
        } catch (error) {
          if (signal?.aborted) { failure ??= error; break; }
          for (const entry of segment.calls) {
            const result = { error: error?.message ?? String(error) };
            completed.push({ id: entry.id, index: entry.index, name: entry.name,
              args: entry.args, ok: false, result, ms: Math.max(0, Date.now() - startedAt) });
            try { onEvent?.(entry.name, { ok: false, ms: elapsed(startedAt), summary: result.error }); } catch { /* ignore */ }
          }
        }
      } else {
        const outcomes = await runMutation(segment.calls, {
          run: async entry => runOne(entry),
          signal, onEvent,
          batch: batchFn ? async entries => {
            const results = await batchFn(entries[0]?.name ?? segment.calls[0]?.name, entries);
            return entries.map((entry, i) => ({ id: entry.id,
              ok: results?.[i]?.error === undefined, result: results?.[i] ?? null, ms: 0 }));
          } : undefined,
        });
        completed.push(...outcomes);
        failure ??= outcomes.failure ?? null;
      }
      if (failure) break;
    }
    if (failure) {
      checkpointRepair(history, calls, onCheckpoint);
      throw failure;
    }
    signal?.throwIfAborted();
    const { entries, hardStop, text } = prepareCalls(calls, repeats, {}, completed);
    history = foldResults(history, entries.map(entry => entry.outcome));
    onCheckpoint(history);
    const stepFailed = completed.some(outcome => outcome?.ok === false)
      || entries.some(entry => entry.outcome?.ok === false);
    if (hardStop) {
      const spoken = typeof msg.content === 'string' && msg.content.trim() ? msg.content.trim() : null;
      const pendingIds = new Set(history.filter(m => m.role === 'tool').map(m => m.tool_call_id));
      const missing = calls.filter(c => c.id && !pendingIds.has(c.id));
      if (missing.length) {
        history = [...history, ...missing.map(c => ({ role: 'tool', tool_call_id: c.id,
          content: JSON.stringify({ error: 'loop_detected' }) }))];
        onCheckpoint(history);
      }
      return { text: `${spoken ? `${spoken}\n\n` : ''}${text}`, messages: history };
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
