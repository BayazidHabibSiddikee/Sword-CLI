#!/usr/bin/env node
/**
 * server.js — Character Flow Web Server
 * Serves the web UI + proxies LLM API calls to freellmapi
 * Usage: node server.js [--port 3002]
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || process.env.PORT || '3002');
const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// ── Proxy handler ─────────────────────────────────────────────────────────────
async function proxyRequest(req, res) {
  const targetUrl = `${PROXY_HOST}${req.url}`;
  try {
    const fetchOpts = {
      method: req.method,
      headers: { ...req.headers, host: new URL(PROXY_HOST).host },
    };
    if (req.body) fetchOpts.body = req.body;
    const proxyRes = await fetch(targetUrl, fetchOpts);
    res.writeHead(proxyRes.status, proxyRes.headers);
    proxyRes.body?.pipe(res);
  } catch (e) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: `Proxy error: ${e.message}` }));
  }
}

// ── Static file serve ─────────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext = join(filePath, '').slice(filePath.lastIndexOf('.'));
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
    res.end(content);
  } catch (_) {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ── Build server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // API proxy — forward everything under /v1 and /api to freellmapi
  if (pathname.startsWith('/v1/') || pathname.startsWith('/api/')) {
    return proxyRequest(req, res);
  }

  // Character data endpoint
  if (pathname === '/api/characters') {
    const chars = [
      { id: 'izuku', name: 'Izuku Midoriya', emoji: '🦸', color: '#00CED1', role: 'Philosopher Hero' },
      { id: 'mahina', name: 'Mahina Artemis', emoji: '💜', color: '#DA70D6', role: 'Strategist' },
      { id: 'muhan', name: 'Muhan Haswaz', emoji: '📊', color: '#FFD700', role: 'Math Professor & Trader' },
      { id: 'plastos', name: 'Plastos Jiade', emoji: '📰', color: '#FF4466', role: 'War Reporter' },
      { id: 'monk', name: 'Monk Maecenas', emoji: '🧘', color: '#9370DB', role: 'Religious Scholar' },
      { id: 'rishad', name: 'Prince Rishad', emoji: '🎭', color: '#FF6B35', role: 'Comedy Lover' },
      { id: 'turing', name: 'Turing Voss', emoji: '🔮', color: '#7B68EE', role: 'Logic & Algorithms' },
      { id: 'sable', name: 'Sable Chen', emoji: '🔧', color: '#FF6B35', role: 'Pragmatic Engineer' },
      { id: 'ada', name: 'Dr. Ada Vance', emoji: '✨', color: '#00CED1', role: 'Computational Math' },
      { id: 'kael', name: 'Kael Vector', emoji: '🤖', color: '#00FF7F', role: 'ML Engineer' },
    ];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(chars));
    return;
  }

  // Models endpoint
  if (pathname === '/api/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash', provider: 'ByNara' }, { id: 'auto', name: 'Auto (proxy default)', provider: 'freellmapi' }]));
    return;
  }

  // Health check
  if (pathname === '/api/health') {
    try {
      const r = await fetch(`${PROXY_HOST}/v1/models`);
      const data = await r.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', proxy: PROXY_HOST, models: data.data?.length || 0 }));
    } catch (e) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: e.message }));
    }
    return;
  }

  // SPA fallback — serve index.html for all other routes
  const indexPath = join(__dirname, 'web', 'dist', 'index.html');
  if (existsSync(indexPath)) {
    serveStatic(res, indexPath);
    return;
  }

  // Dev mode — serve from source
  const devPath = join(__dirname, 'web', 'src', 'index.html');
  if (existsSync(devPath)) {
    serveStatic(res, devPath);
    return;
  }

  res.writeHead(404);
  res.end('Character Flow — select a character to begin');
});

server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║     🌀  CHARACTER FLOW — WEB UI         ║`);
  console.log(`  ╚══════════════════════════════════════════╝`);
  console.log(`\n  👉 http://localhost:${PORT}`);
  console.log(`  🔌 Proxy: ${PROXY_HOST}`);
  console.log(`\n`);
});
