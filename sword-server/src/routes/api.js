// REST: providers, models, sessions, agent chat (SSE).
import { Router } from 'express';
import path from 'node:path';
import { listProviders, addProvider, deleteProvider, listModels } from '../providers.js';
import { createSession, getSession, listSessions, deleteSession, runTurn } from '../agent/loop.js';
import { toolDefs } from '../agent/tools.js';

export const api = Router();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, error: { message, ...extra } });

// ---- providers ----
api.get('/providers', (req, res) => ok(res, { providers: listProviders().map(p => ({ ...p, api_key: p.api_key ? '***' : '' })) }));
api.post('/providers', (req, res) => {
  try { ok(res, { provider: { ...addProvider(req.body || {}), api_key: '***' } }, 201); }
  catch (e) { fail(res, 400, e.message); }
});
api.delete('/providers/:id', (req, res) => { deleteProvider(req.params.id); ok(res, { deleted: req.params.id }); });

// ---- models ----
api.get('/models', async (req, res) => { try { ok(res, { models: await listModels() }); } catch (e) { fail(res, 500, e.message); } });

// ---- tools ----
api.get('/tools', (req, res) => ok(res, { tools: toolDefs.map(t => ({ name: t.function.name, description: t.function.description })) }));

// ---- sessions ----
api.get('/sessions', (req, res) => ok(res, { sessions: listSessions() }));
api.post('/sessions', (req, res) => {
  try {
    const { title, workdir, model } = req.body || {};
    if (!workdir || typeof workdir !== 'string' || !path.isAbsolute(workdir)) return fail(res, 400, 'workdir must be an absolute path');
    ok(res, { session: createSession({ title, workdir, model }) }, 201);
  } catch (e) { fail(res, 400, e.message); }
});
api.get('/sessions/:id', (req, res) => {
  try { ok(res, { session: getSession(req.params.id) }); } catch (e) { fail(res, e.status || 500, e.message); }
});
api.delete('/sessions/:id', (req, res) => { deleteSession(req.params.id); ok(res, { deleted: req.params.id }); });

// ---- chat (SSE) ----
api.post('/sessions/:id/chat', async (req, res) => {
  const content = req.body?.content;
  if (typeof content !== 'string' || !content.trim() || content.length > 32000) return fail(res, 400, 'content must be 1..32000 chars');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const emit = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  const timer = setTimeout(() => abort.abort(), 300000); timer.unref?.();
  try {
    await runTurn({ sessionId: req.params.id, userMessage: content, model: req.body?.model, signal: abort.signal, onEvent: emit });
  } catch (e) { emit({ type: 'error', error: e.status === 404 ? 'session not found' : String(e?.message ?? e) }); }
  finally { clearTimeout(timer); res.end(); }
});
