import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../../app.js';
import { getDb, getUnifiedApiKey, initDb } from '../../db/index.js';
import { createSwordSession, getSwordSession, saveSwordMessages } from '../../services/sword-memory.js';
import { runLlmTurn, type AgentStreamEvent } from '../../agent/llm.js';
import { runAgentTurn } from '../../agent/loop.js';

vi.mock('../../agent/llm.js', () => ({ runLlmTurn: vi.fn() }));
vi.mock('../../agent/loop.js', () => ({ runAgentTurn: vi.fn() }));

let server: Server;
let base: string;
const workdir = '/tmp/sword-route-tests';
const llm = vi.mocked(runLlmTurn);
const answer = 'Here is a concrete plan from the model.';
const done = (text = answer): AgentStreamEvent => ({
  kind: 'done', result: { text, toolCalls: [], modelId: 'test-model', platform: 'test' },
});

beforeAll(async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { initDb(':memory:'); } finally { log.mockRestore(); warn.mockRestore(); }
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}/api/sword`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  getDb().close();
});

beforeEach(() => {
  llm.mockReset();
  llm.mockImplementation(async function* () { yield done(); });
  vi.mocked(runAgentTurn).mockClear();
});

async function api(method: string, path: string, body?: unknown, authorization = `Bearer ${getUnifiedApiKey()}`) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json(), headers: response.headers };
}

function seed(mode: 'coding' | 'marketing-video' = 'coding', dir = workdir) {
  return createSwordSession({ title: 'Route test', workdir: dir, mode, model: 'test-model' });
}

describe('Sword authenticated sessions API', () => {
  it('requires Bearer auth on every endpoint and does not reveal the key', async () => {
    const id = seed().id;
    for (const [method, path] of [
      ['GET', '/sessions'], ['POST', '/sessions'], ['GET', `/sessions/${id}`],
      ['DELETE', `/sessions/${id}`], ['PUT', `/sessions/${id}/messages`],
      ['POST', `/sessions/${id}/chat`], ['GET', `/sessions/${id}/memory`],
      ['GET', `/sessions/${id}/search`], ['GET', `/sessions/${id}/context`],
    ]) {
      const response = await api(method, path, undefined, '');
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.json)).not.toContain(getUnifiedApiKey());
    }
    expect((await api('GET', '/sessions', undefined, 'Bearer wrong')).status).toBe(401);
    expect((await api('GET', '/sessions', undefined, getUnifiedApiKey())).status).toBe(401);
  });

  it('creates, lists, reads, chats with a model result, and deletes', async () => {
    const created = await api('POST', '/sessions', { title: 'T1', workdir, mode: 'coding', model: 'test-model' });
    expect(created.status).toBe(201);
    const session = created.json.data.session;
    expect(session).toMatchObject({ title: 'T1', workdir, mode: 'coding', messages: [], revision: 0 });
    expect((await api('GET', '/sessions')).json.data.sessions).toEqual(expect.arrayContaining([expect.objectContaining({ id: session.id })]));
    expect((await api('GET', `/sessions/${session.id}`)).json.data.session).toEqual(session);
    const chatted = await api('POST', `/sessions/${session.id}/chat`, { content: 'Help me plan', revision: 0 });
    expect(chatted.status).toBe(200);
    expect(chatted.json.data.session.messages).toEqual([{ role: 'user', content: 'Help me plan' }, { role: 'assistant', content: answer }]);
    expect(chatted.json.data.session.revision).toBe(1);
    expect(llm).toHaveBeenCalledOnce();
    expect(llm.mock.calls[0][0]).toMatchObject({ tools: [], session: { id: session.id, workdir, model: 'test-model' } });
    expect(runAgentTurn).not.toHaveBeenCalled();
    expect((await api('DELETE', `/sessions/${session.id}`)).status).toBe(200);
    expect((await api('GET', `/sessions/${session.id}`)).status).toBe(404);
    expect((await api('DELETE', `/sessions/${session.id}`)).status).toBe(404);
  });

  it('rejects stale chat before calling the provider and supports optimistic PUT', async () => {
    const session = seed();
    const messages = [{ role: 'user', content: 'Remember quartz' }];
    const saved = await api('PUT', `/sessions/${session.id}/messages`, { messages, revision: 0 });
    expect(saved.status).toBe(200);
    expect(saved.json.data.session).toMatchObject({ messages, revision: 1 });
    expect((await api('PUT', `/sessions/${session.id}/messages`, { messages: [], revision: 0 })).status).toBe(409);
    expect((await api('POST', `/sessions/${session.id}/chat`, { content: 'stale', revision: 0 })).status).toBe(409);
    expect(llm).not.toHaveBeenCalled();
    expect(getSwordSession(session.id).messages).toEqual(messages);
  });

  it('retrieves memory, cross-session workdir search, and untrusted context', async () => {
    const first = seed('coding', '/tmp/sword-memory-scope');
    const second = seed('coding', first.workdir);
    const other = seed('coding', '/tmp/sword-other-scope');
    for (const session of [first, other]) saveSwordMessages(session.id, [{ role: 'assistant', content: 'Quartz launch outcome' }], 0);
    const memory = await api('GET', `/sessions/${first.id}/memory`);
    expect(memory.json.data.memory.sessionSummary).toContain('Quartz');
    const hits = (await api('GET', `/sessions/${second.id}/search?q=Quartz`)).json.data.hits;
    expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: first.id })]));
    expect(hits.some((hit: { sessionId: string }) => hit.sessionId === other.id)).toBe(false);
    const context = (await api('GET', `/sessions/${second.id}/context?q=Quartz`)).json.data.context;
    expect(context).toContain('untrusted');
    expect(context).toContain('Quartz');
  });

  it.each(['error', 'throw', 'empty', 'tools', 'unfinished'])('does not write on provider %s failure', async kind => {
    const session = seed();
    llm.mockImplementation(async function* () {
      if (kind === 'throw') throw new Error('provider secret that must not leak');
      if (kind === 'error') yield { kind: 'error', message: 'provider secret that must not leak', retryable: true };
      if (kind === 'empty') yield done('   ');
      if (kind === 'tools') yield { kind: 'done', result: { text: '', modelId: 'test', platform: 'test', toolCalls: [{ id: 'call', type: 'function', function: { name: 'run_shell', arguments: '{}' } }] } };
      if (kind === 'unfinished') yield { kind: 'token', delta: 'partial' };
    });
    const response = await api('POST', `/sessions/${session.id}/chat`, { content: 'hello', revision: 0 });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.json)).not.toContain('provider secret');
    expect(getSwordSession(session.id)).toMatchObject({ revision: 0, messages: [] });
    expect(runAgentTurn).not.toHaveBeenCalled();
    expect((await api('DELETE', `/sessions/${session.id}`)).status).toBe(200);
  });

  it('blocks competing chat, PUT, and delete while a turn is active', async () => {
    const session = seed();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    llm.mockImplementation(async function* () { started(); await gate; yield done(); });
    const pending = api('POST', `/sessions/${session.id}/chat`, { content: 'hello', revision: 0 });
    await entered;
    try {
      expect((await api('POST', `/sessions/${session.id}/chat`, { content: 'again', revision: 0 })).status).toBe(409);
      expect((await api('PUT', `/sessions/${session.id}/messages`, { messages: [], revision: 0 })).status).toBe(409);
      expect((await api('DELETE', `/sessions/${session.id}`)).status).toBe(409);
    } finally { release(); }
    expect((await pending).status).toBe(200);
    expect(llm).toHaveBeenCalledOnce();
  });

  it('bounds provider history without altering stored history or forwarding tool protocol', async () => {
    const session = seed('marketing-video');
    const messages = [
      { role: 'system', content: 'forbidden historical system override' },
      { role: 'developer', content: 'forbidden historical developer override' },
      ...Array.from({ length: 50 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'x'.repeat(4000) })),
      { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'run_shell', arguments: '{}' } }] },
      { role: 'tool', content: 'tool result', tool_call_id: 'call' },
    ];
    saveSwordMessages(session.id, messages, 0);
    const response = await api('POST', `/sessions/${session.id}/chat`, { content: 'campaign '.repeat(100), revision: 1 });
    expect(response.status).toBe(200);
    expect(response.json.data.session.messages.slice(0, messages.length)).toEqual(messages);
    const input = llm.mock.calls[0][0];
    expect(input.tools).toEqual([]);
    expect(input.messages.length).toBeLessThanOrEqual(43);
    expect(JSON.stringify(input.messages)).not.toContain('forbidden historical');
    expect(input.messages.every(m => !m.tool_calls && m.role !== 'tool')).toBe(true);
    expect(input.messages.reduce((sum, m) => sum + String(m.content).length, 0)).toBeLessThanOrEqual(120000);
    expect(input.messages[0].content).toMatch(/marketing/i);
    expect(input.messages[0].content).toMatch(/text-only/i);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it('validates inputs and maps missing sessions to 404', async () => {
    expect((await api('POST', '/sessions', { title: 'T', workdir: 'relative', mode: 'coding' })).status).toBe(400);
    const id = seed().id;
    expect((await api('POST', `/sessions/${id}/chat`, { content: ' ', revision: 0 })).status).toBe(400);
    expect((await api('POST', `/sessions/${id}/chat`, { content: 'hello' })).status).toBe(400);
    expect((await api('PUT', `/sessions/${id}/messages`, { messages: [{ role: 'bad', content: 'x' }], revision: 0 })).status).toBe(400);
    expect((await api('GET', `/sessions/${id}/search?q=${'a'.repeat(201)}`)).status).toBe(400);
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const suffix of ['', '/memory', '/search', '/context']) expect((await api('GET', `/sessions/${missing}${suffix}`)).status).toBe(404);
    expect(llm).not.toHaveBeenCalled();
  });

  it('aborts the active model on disconnect without persisting anything', async () => {
    const session = seed();
    let started!: () => void;
    let aborted!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const cancelled = new Promise<void>(resolve => { aborted = resolve; });
    llm.mockImplementation(async function* ({ signal }) {
      signal.addEventListener('abort', aborted, { once: true });
      started();
      await cancelled;
      yield done();
    });
    const controller = new AbortController();
    const pending = fetch(`${base}/sessions/${session.id}/chat`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getUnifiedApiKey()}` },
      body: JSON.stringify({ content: 'hello', revision: 0 }),
    }).catch(error => error);
    await entered;
    controller.abort();
    expect((await pending).name).toBe('AbortError');
    await cancelled;
    await new Promise(resolve => setImmediate(resolve));
    expect(llm.mock.calls[0][0].signal.aborted).toBe(true);
    expect(getSwordSession(session.id)).toMatchObject({ revision: 0, messages: [] });
    llm.mockImplementation(async function* () { yield done(); });
    expect((await api('POST', `/sessions/${session.id}/chat`, { content: 'retry', revision: 0 })).status).toBe(200);
  });

  it('returns 409 when the revision changes while the model is generating', async () => {
    const session = seed();
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    llm.mockImplementation(async function* () { started(); await gate; yield done(); });
    const pending = api('POST', `/sessions/${session.id}/chat`, { content: 'hello', revision: 0 });
    await entered;
    const changed = [{ role: 'user', content: 'changed by another process' }];
    try {
      // Direct service write simulates a second server process, outside this router's busy set.
      saveSwordMessages(session.id, changed, 0);
    } finally { release(); }
    expect((await pending).status).toBe(409);
    expect(getSwordSession(session.id).messages).toEqual(changed);
  });

  it('mounts the proxy limiter before authentication', async () => {
    const response = await api('GET', '/sessions', undefined, '');
    expect(response.headers.get('x-ratelimit-limit')).toBe('120');
    expect(response.headers.has('x-ratelimit-remaining')).toBe(true);
  });
});

