// OpenAI-compatible shim so the existing SwordCLI works unchanged:
// POST /v1/chat/completions, GET /v1/models
import { Router } from 'express';
import { chat, listModels, routeProviders } from '../providers.js';
import { getSetting } from '../db.js';

export const openai = Router();

openai.get('/models', async (req, res) => {
  try {
    const models = await listModels();
    res.json({ object: 'list', data: models.map(m => ({ id: m.id, object: 'model', created: 0, owned_by: m.provider || 'sword', name: m.name })) });
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

openai.post('/chat/completions', async (req, res) => {
  const { messages, tools, model, stream } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: { message: 'messages[] required' } });
  if (stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const id = `chatcmpl-${Date.now()}`;
    try {
      const r = await chat({ messages, tools: tools || [], model,
        onToken: (delta) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: delta } }] })}\n\n`); } });
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: r.toolCalls.map((t, i) => ({ index: i, id: t.id, type: 'function', function: t.function })) } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
      }
    } catch (e) { console.error(`[openai] chat failed: ${e?.stack || e}`); if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: { message: e.message } })}\n\n`); }
    res.end();
    return;
  }
  try {
    const r = await chat({ messages, tools: tools || [], model });
    res.json({ id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: r.model,
      choices: [{ index: 0, message: { role: 'assistant', content: r.text, ...(r.toolCalls.length ? { tool_calls: r.toolCalls } : {}) }, finish_reason: r.toolCalls.length ? 'tool_calls' : 'stop' }],
      _routed_via: { provider: r.provider } });
  } catch (e) { res.status(502).json({ error: { message: e.message } }); }
});
