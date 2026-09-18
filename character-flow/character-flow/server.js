/**
 * server.js — Character Flow Web API Server
 * Serves the React web UI + provides REST endpoints for character chat, skills, sessions, tasks.
 */
import { createServer, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangGraphAgent } from './langgraph-agent.js';
import * as bridge from './skills/bridge.js';
import * as gitSkill from './skills/git.js';
import * as fileEditSkill from './skills/file_edit.js';
import * as tasksSkill from './skills/tasks.js';
import { sessions } from './skills/sessions.js';

const PORT = parseInt(process.env.PORT || '3002');
const PROXY_BASE = process.env.PROXY_HOST || 'http://localhost:3001';
const FREELLMAPI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'freellmapi');
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Character Registry ────────────────────────────────────────────────────────
const CHARACTERS = {
  izuku:  { name: 'Izuku Midoriya', emoji: '🦸', color: '#00CED1', brainPath: './brain/izuku.js',              agentSkills: null, teamRole: 'Philosopher Hero' },
  mahina: { name: 'Mahina Artemis', emoji: '💜', color: '#DA70D6', brainPath: './brain/mahina.js',             agentSkills: null, teamRole: 'Strategist' },
  muhan:  { name: 'Muhan Haswaz',   emoji: '📊', color: '#FFD700', brainPath: './brain/muhan.js',              agentSkills: null, teamRole: 'Math & Trader' },
  plastos:{ name: 'Plastos Jiade',  emoji: '📰', color: '#FF4466', brainPath: './brain/plastos.js',            agentSkills: null, teamRole: 'War Reporter' },
  monk:   { name: 'Monk Maecenas',  emoji: '🧘', color: '#9370DB', brainPath: './brain/monk_maecenas.js',      agentSkills: null, teamRole: 'Religious Scholar' },
  rishad: { name: 'Prince Rishad',  emoji: '🎭', color: '#FF6B35', brainPath: './brain/prince_rishad.js',      agentSkills: null, teamRole: 'Comedy Lover' },
  turing: { name: 'Turing Voss',    emoji: '🔮', color: '#7B68EE', brainPath: './brain/turing_voss.js',        agentSkills: () => import('./skills/agents/turing.js'), teamRole: 'Logic Master' },
  sable:  { name: 'Sable Chen',     emoji: '🔧', color: '#FF6B35', brainPath: './brain/sable_chen.js',         agentSkills: () => import('./skills/agents/sable.js'),  teamRole: 'Pragmatic Engineer' },
  ada:    { name: 'Dr. Ada Vance',  emoji: '✨', color: '#00CED1', brainPath: './brain/ada_vance.js',          agentSkills: () => import('./skills/agents/ada.js'),    teamRole: 'Computational Mathematician' },
  kael:   { name: 'Kael Vector',    emoji: '🤖', color: '#00FF7F', brainPath: './brain/kael_vector.js',        agentSkills: () => import('./skills/agents/kael.js'),   teamRole: 'ML Engineer' },
};

// In-memory agent cache
const agents = {};
const models = ['auto', 'auto'];

async function getWebAgent(charKey) {
  if (agents[charKey]) return agents[charKey];
  const char = CHARACTERS[charKey];
  if (!char) return null;
  const brainMod = await import(char.brainPath);
  let allTools = [...bridge.TOOL_DEFINITIONS, ...gitSkill.TOOL_DEFINITIONS, ...fileEditSkill.TOOL_DEFINITIONS, ...tasksSkill.TOOL_DEFINITIONS];
  if (char.agentSkills) {
    try { const s = await char.agentSkills(); allTools = [...allTools, ...(s.TOOL_DEFINITIONS || [])]; } catch (_) {}
  }

  const executor = async (name, args) => {
    if (name.startsWith('git_')) return await gitSkill.execute(name, args);
    if (['search_replace','insert_after','insert_before','append_file','replace_block','create_dir','delete_file','grep_search','count_lines'].includes(name)) return await fileEditSkill.execute(name, args);
    if (['add_task','list_tasks','update_task','delete_task','stats_tasks'].includes(name)) return await tasksSkill.execute(name, args);
    if (char.agentSkills) { try { const s = await char.agentSkills(); const r = await s.execute(name, args); if (typeof r === 'string') return r; } catch (_) {} }
    return await bridge.execute(name, args);
  };

  agents[charKey] = new LangGraphAgent({
    systemPrompt: brainMod.SYSTEM_PROMPT,
    tools: allTools,
    characterName: char.name,
    modelName: 'auto',
    toolExecutor: executor,
    threadId: `web-${charKey}`,
  });
  return agents[charKey];
}

// ── Skill Discovery ───────────────────────────────────────────────────────────
async function getAllSkills() {
  const skills = [];
  for (const [name, mod] of Object.entries({ bridge, git: gitSkill, file_edit: fileEditSkill, tasks: tasksSkill })) {
    if (mod.TOOL_DEFINITIONS) {
      skills.push({ name, tools: mod.TOOL_DEFINITIONS.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) });
    }
  }
  return skills;
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // ── CORS headers ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── API Routes ──
  if (path === '/api/characters' && method === 'GET') {
    const chars = Object.entries(CHARACTERS).map(([key, c]) => ({
      key, name: c.name, emoji: c.emoji, color: c.color, role: c.teamRole,
      brain: c.brainPath, hasAgentSkills: !!c.agentSkills,
    }));
    sendJson(res, 200, { characters: chars });
    return;
  }

  if (path === '/api/skills' && method === 'GET') {
    const skills = await getAllSkills();
    sendJson(res, 200, { skills });
    return;
  }

  if (path === '/api/models' && method === 'GET') {
    sendJson(res, 200, { models });
    return;
  }

  if (path === '/api/sessions' && method === 'GET') {
    sendJson(res, 200, { sessions: sessions.list() });
    return;
  }

  if (path === '/api/chat' && method === 'POST') {
    const body = await readBody(req);
    const { character, message, model } = body || {};
    if (!character || !message) {
      sendJson(res, 400, { error: 'Missing character or message' });
      return;
    }
    const agent = await getWebAgent(character);
    if (!agent) { sendJson(res, 404, { error: `Character "${character}" not found` }); return; }
    try {
      const result = await agent.run(message);
      sessions.persist(character, message, result);
      sendJson(res, 200, { character, response: result.response, turns: result.turns, hasToolCalls: result.hasToolCalls });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  if (path === '/api/tasks' && method === 'GET') {
    const statusFilter = url.searchParams.get('status');
    const r = await tasksSkill.execute('list_tasks', statusFilter ? { status: statusFilter } : {});
    sendJson(res, 200, JSON.parse(r));
    return;
  }

  if (path === '/api/tasks' && method === 'POST') {
    const body = await readBody(req);
    const r = await tasksSkill.execute('add_task', body || {});
    sendJson(res, 200, JSON.parse(r));
    return;
  }

  if (path === '/api/stats' && method === 'GET') {
    const charKey = url.searchParams.get('character');
    if (charKey && CHARACTERS[charKey]) {
      const brainMod = await import(CHARACTERS[charKey].brainPath);
      if (brainMod.getStats) sendJson(res, 200, brainMod.getStats());
      else sendJson(res, 200, { note: 'No stats available' });
    } else {
      // Aggregate stats
      const allSessions = sessions.list();
      const totalMsgs = Object.values(allSessions).reduce((a, s) => a + (s.message_count || 0), 0);
      sendJson(res, 200, { total_sessions: Object.keys(allSessions).length, total_messages: totalMsgs, characters: Object.keys(CHARACTERS).length });
    }
    return;
  }

  if (path === '/api/session/clear' && method === 'POST') {
    const body = await readBody(req);
    const charKey = body?.character;
    if (charKey) { sessions.clear(charKey); delete agents[charKey]; }
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Proxy /v1/* to freellmapi ──
  if (path.startsWith('/v1/')) {
    try {
      const targetUrl = new URL(path + url.search, PROXY_BASE);
      const isHttps = targetUrl.protocol === 'https:';
      const reqFn = isHttps ? httpsRequest : httpRequest;

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      const proxyReq = reqFn(targetUrl, {
        method,
        headers: {
          ...req.headers,
          host: targetUrl.host,
          'content-length': body.length,
        },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error(`[proxy] Error forwarding ${path}:`, err.message);
        sendJson(res, 502, { error: `Proxy error: ${err.message}` });
      });

      if (body.length > 0) proxyReq.write(body);
      proxyReq.end();
    } catch (err) {
      sendJson(res, 502, { error: `Proxy error: ${err.message}` });
    }
    return;
  }

  // ── Serve static files (dist + public) ──
  const publicPath = join(__dirname, 'web', 'public');
  const staticPath = join(__dirname, 'web', 'dist');
  const candidates = [
    join(publicPath, path === '/' ? 'index.html' : path),
    join(staticPath, path === '/' ? 'index.html' : path),
  ];
  let filePath = candidates.find(p => existsSync(p));
  if (!filePath) {
    // SPA fallback: serve index.html for any non-file route
    filePath = join(staticPath, 'index.html');
  }
  if (!existsSync(filePath)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  const ext = filePath.split('.').pop();
  const types = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  readFileSync(filePath).pipe ? readFileSync(filePath).pipe(res) : res.end(readFileSync(filePath));
});

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(`   🌐 SwordCLI API:       http://localhost:${PORT}`);
  console.log(`   💬 Chat API:          POST /api/chat {character, message}`);
  console.log(`   🤖 Characters:        GET  /api/characters`);
  console.log(`   🔧 Skills:            GET  /api/skills`);
  console.log(`   💾 Tasks:             GET  /api/tasks | POST /api/tasks`);
  console.log(`   📊 Stats:             GET  /api/stats`);
  console.log(`   💬 Sessions:          GET  /api/sessions`);
  console.log(`   🔗 Proxy (freellmapi): /v1/* → ${PROXY_BASE}`);
  console.log('');
  console.log('   Web UI: http://localhost:3002');
  console.log('   Freellmapi: run "cd freellmapi && npm run dev" on port 3001');
});
