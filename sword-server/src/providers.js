// Provider router — OpenAI-compatible fan-out with failover.
import { getDb, getSetting, setSetting } from './db.js';

function envProviders() {
  const list = [];
  for (let i = 1; i <= 10; i++) {
    const base = process.env[`SWORD_PROVIDER_${i}_BASE_URL`];
    const key = process.env[`SWORD_PROVIDER_${i}_KEY`];
    if (!base) continue;
    list.push({
      name: process.env[`SWORD_PROVIDER_${i}_NAME`] || `env${i}`,
      base_url: base.replace(/\/+$/, ''),
      api_key: key || '',
      model: process.env[`SWORD_PROVIDER_${i}_MODEL`] || '',
    });
  }
  return list;
}

export function listProviders() {
  const rows = getDb().prepare('SELECT * FROM providers WHERE enabled = 1 ORDER BY id').all();
  return [...envProviders().map((p, i) => ({ id: -1 - i, ...p, enabled: 1 })), ...rows];
}

export function addProvider({ name, base_url, api_key, model }) {
  if (!name?.trim()) throw new Error('name is required');
  if (!base_url?.trim()) throw new Error('base_url is required');
  const r = getDb().prepare(
    'INSERT INTO providers(name, base_url, api_key, model) VALUES(?, ?, ?, ?)'
  ).run(name.trim(), base_url.trim().replace(/\/+$/, ''), api_key || '', model || '');
  return getDb().prepare('SELECT * FROM providers WHERE id = ?').get(Number(r.lastInsertRowid));
}

export function deleteProvider(id) {
  getDb().prepare('DELETE FROM providers WHERE id = ?').run(Number(id));
}

function cursor() { return Number(getSetting('route_cursor') || 0); }
function setCursor(n) { setSetting('route_cursor', String(n)); }

export function routeProviders(preferredName) {
  const all = listProviders();
  if (!all.length) throw new Error('No providers configured. POST /api/providers or set SWORD_PROVIDER_1_BASE_URL/_KEY/_MODEL.');
  if (preferredName) {
    const hit = all.filter(p => p.name === preferredName);
    if (hit.length) return [...hit, ...all.filter(p => p.name !== preferredName)];
  }
  const start = cursor() % all.length;
  setCursor(start + 1);
  return [...all.slice(start), ...all.slice(0, start)];
}

function endpointFor(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  // Native Ollama serves /api/chat (non-OpenAI shape); everything else is
  // assumed OpenAI-compatible under .../v1/chat/completions.
  if (/(^|\/)api$/.test(base) && base.includes('11434')) return { url: `${base}/chat`, native: 'ollama' };
  return { url: base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`, native: null };
}

/** First available model on a local Ollama — used when the caller sends model "auto". */
async function firstOllamaModel(p) {
  try {
    const base = p.base_url.replace(/\/api$/, '').replace(/\/+$/, '');
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return '';
    const b = await r.json().catch(() => null);
    return b?.models?.[0]?.name ?? '';
  } catch { return ''; }
}

export async function chat({ messages, tools = [], model, preferredProvider, signal, onToken, timeoutMs = 600000 }) {
  const ordered = routeProviders(preferredProvider);
  const errors = [];
  for (const p of ordered) {
    // Model ids may be pinned as "provider:model"; strip the prefix only when
    // it actually matches a provider name (ollama tags like "qwen2.5:1.5b" keep their colon).
    let useModel = model || p.model || 'auto';
    if (typeof useModel === 'string' && useModel.includes(':')) {
      const [prefix, ...rest] = useModel.split(':');
      if (prefix === p.name) useModel = rest.join(':');
    }
    // "auto" (or empty) means "the provider's own default model".
    if (!useModel || useModel === 'auto') useModel = p.model || (native === 'ollama' ? await firstOllamaModel(p) : '') || 'auto';
    const { url, native } = endpointFor(p.base_url);
    try {
      if (native === 'ollama') {
        // Native Ollama /api/chat: supports tools + NDJSON streaming, but its
        // tool_calls shape differs from OpenAI's (arguments must be an object).
        const ollamaMessages = messages.map(m => {
          if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
            return {
              role: m.role,
              content: m.content ?? '',
              tool_calls: m.tool_calls.map(tc => {
                let args = {};
                try { args = JSON.parse(tc?.function?.arguments || '{}'); } catch { args = {}; }
                return { function: { name: tc?.function?.name ?? '', arguments: args } };
              }),
            };
          }
          return { role: m.role, content: m.content ?? '' };
        });
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: useModel, messages: ollamaMessages, ...(tools.length ? { tools } : {}), stream: Boolean(onToken) }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) { const body = await res.text().catch(() => ''); errors.push(`${p.name}: HTTP ${res.status} ${body.slice(0, 200)}`); continue; }
        if (onToken && (res.headers.get('content-type') || '').includes('application/x-ndjson')) {
          const out = await readOllamaStream(res, onToken);
          return { ...out, provider: p.name, model: useModel };
        }
        const data = await res.json().catch(() => null);
        const msg = data?.message;
        if (!msg) { errors.push(`${p.name}: malformed ollama response`); continue; }
        const toolCalls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : []).map((tc, i) => ({
          id: `call_${i}_${Date.now().toString(36)}`,
          type: 'function',
          function: { name: tc?.function?.name ?? '', arguments: JSON.stringify(tc?.function?.arguments ?? {}) },
        }));
        return { text: msg.content ?? '', toolCalls, provider: p.name, model: useModel };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(p.api_key ? { Authorization: `Bearer ${p.api_key}` } : {}) },
        body: JSON.stringify({ model: useModel || 'auto', messages, ...(tools.length ? { tools } : {}), stream: Boolean(onToken) }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) { const body = await res.text().catch(() => ''); errors.push(`${p.name}: HTTP ${res.status} ${body.slice(0, 200)}`); continue; }
      if (onToken && (res.headers.get('content-type') || '').includes('text/event-stream')) {
        const out = await readSSE(res, onToken);
        return { ...out, provider: p.name, model: useModel };
      }
      const data = await res.json().catch(() => null);
      const msg = data?.choices?.[0]?.message;
      if (!msg) { errors.push(`${p.name}: malformed response`); continue; }
      return { text: msg.content ?? '', toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [], provider: p.name, model: useModel };
    } catch (e) { errors.push(`${p.name}: ${e?.message ?? e}`); }
  }
  throw new Error(`All providers failed:\n- ${errors.join('\n- ')}`);
}

async function readSSE(res, onToken) {
  const decoder = new TextDecoder();
  let buf = '', text = '';
  const calls = new Map();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of event.split('\n')) {
        const payload = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!payload || payload === '[DONE]') continue;
        let d; try { d = JSON.parse(payload); } catch { continue; }
        const delta = d?.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === 'string' && delta.content) { text += delta.content; onToken(delta.content); }
        for (const tc of delta.tool_calls || []) {
          const i = tc.index ?? 0;
          const prev = calls.get(i) || { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) prev.id = tc.id;
          if (tc.function?.name) prev.function.name += tc.function.name;
          if (tc.function?.arguments) prev.function.arguments += tc.function.arguments;
          calls.set(i, prev);
        }
      }
    }
  }
  return { text, toolCalls: [...calls.values()] };
}

// Native Ollama streams NDJSON lines: {"message":{"content":"...","tool_calls":[...]},...}
async function readOllamaStream(res, onToken) {
  const decoder = new TextDecoder();
  let buf = '', text = '';
  const calls = [];
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const msg = d?.message;
      if (!msg) continue;
      if (typeof msg.content === 'string' && msg.content) { text += msg.content; onToken(msg.content); }
      for (const tc of msg.tool_calls || []) {
        calls.push({
          id: `call_${calls.length}_${Date.now().toString(36)}`,
          type: 'function',
          function: { name: tc?.function?.name ?? '', arguments: JSON.stringify(tc?.function?.arguments ?? {}) },
        });
      }
    }
  }
  return { text, toolCalls: calls };
}

export async function listModels() {
  const models = new Map();
  models.set('auto', { id: 'auto', name: 'Auto (first working provider)', provider: '' });
  for (const p of listProviders()) {
    if (p.model) models.set(p.model, { id: p.model, name: `${p.model} (${p.name})`, provider: p.name });
    try {
      const base = p.base_url.replace(/\/+$/, '');
      const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      const r = await fetch(url, { headers: p.api_key ? { Authorization: `Bearer ${p.api_key}` } : {}, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const b = await r.json().catch(() => null);
        for (const m of b?.data ?? []) {
          if (typeof m?.id === 'string' && !models.has(m.id))
            models.set(m.id, { id: m.id, name: m.name || `${m.id} (${p.name})`, provider: p.name });
        }
      }
    } catch {}
  }
  return [...models.values()];
}
