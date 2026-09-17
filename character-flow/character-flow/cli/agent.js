import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import { join } from 'node:path';

export function providerConfig(env = process.env) {
  const base = new URL(env.OPENAI_BASE_URL || env.PROXY_HOST || 'http://localhost:3001/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('Provider URL must not contain credentials, query or fragment');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
    throw new Error('Remote providers require HTTPS');
  }
  const root = base.href.replace(/\/+$/, '');
  return { url: `${root.endsWith('/v1') ? root : `${root}/v1`}/chat/completions`, key: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || 'auto' };
}

export function createRequest(config, tools, signal) {
  return async messages => {
    if (JSON.stringify(messages).length > 500000) throw new Error('Context limit reached; start a new session with /clear');
    const response = await fetch(config.url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
      body: JSON.stringify({ model: config.model, messages, tools, stream: false }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}; check endpoint, model and credentials`);
    let text = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      text += decoder.decode(chunk, { stream: true });
      if (text.length > 1000000) throw new Error('Provider response too large');
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('Invalid provider response'); }
  };
}

export async function runTurn({ messages, request, execute, maxSteps = 20, onEvent = () => {}, onCheckpoint = () => {}, signal }) {
  let history = [...messages];
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
      signal?.throwIfAborted();
      if (!call.id || !call.function?.name) throw new Error('Invalid tool call');
      onEvent(call.function.name);
      let result;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        result = await execute(call.function.name, args);
      } catch (error) {
        signal?.throwIfAborted();
        result = { error: error.message };
      }
      const serialized = JSON.stringify(result ?? null);
      const content = serialized.length > 16384 ? `${serialized.slice(0, 8000)}\n[truncated]\n${serialized.slice(-8000)}` : serialized;
      history = [...history, { role: 'tool', tool_call_id: call.id, content }];
      onCheckpoint(history);
    }
  }
  throw new Error(`Agent step limit (${maxSteps}) reached`);
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
