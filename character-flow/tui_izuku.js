#!/usr/bin/env node
/**
 * tui_izuku.js — Izuku Midoriya TUI (BM25 + FTS5 + TF-IDF hybrid RAG)
 * Commands: /quote /poem /idea /laws /search /status /clear /help
 */

import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));

// ── Shared RAG engine + character module ───────────────────────────────────────

let _brain = null;
async function loadBrain() {
  if (_brain) return _brain;
  const m = await import(join(_ROOT, 'brain', 'izuku.js'));
  m.rag.load();
  _brain = m;
  return m;
}

// ── Colors ─────────────────────────────────────────────────────────────────────

const C = {
  user:   chalk.cyan,
  ai:     chalk.green,
  system: chalk.yellow,
  cmd:    chalk.magenta,
  dim:    chalk.gray,
  accent: chalk.blueBright,
  error:  chalk.red,
  green:  chalk.green,
};

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchJSON(path) {
  const res = await fetch(`${PROXY_HOST}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchChat(messages) {
  const res = await fetch(`${PROXY_HOST}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'auto', messages, stream: false }),
  });
  if (!res.ok) throw new Error(`Proxy ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '[no response]';
}

// ── Command Handlers ───────────────────────────────────────────────────────────

async function handleQuote(args) {
  const brain = await loadBrain();
  try {
    const q = await fetchJSON(`/api/character/quote/${args || 'universal'}`);
    printSystem(`${C.accent('── Quote ──')}`);
    printSystem(`"${q.text}"`);
    printSystem(C.dim(`— ${q.author}  |  Law: ${q.law || q.source_law || '?'}`));
  } catch (_) {
    const q = brain.generateQuote(args || 'universal');
    printSystem(`${C.accent('── Quote ──')}`);
    printSystem(`"${q.text}"`);
    printSystem(C.dim(`— ${q.author}  |  Theme: ${q.theme}  |  Law: ${q.source_law || 'Izuku'}`));
  }
}

async function handlePoem(topic) {
  const brain = await loadBrain();
  printSystem(`${C.accent('── Poem ──')}`);
  printSystem(brain.generatePoem(topic || 'life'));
}

async function handleIdea(domain) {
  const brain = await loadBrain();
  const idea = brain.generateBusinessIdea(domain || null);
  printSystem(`${C.accent('── Business Idea ──')}`);
  printSystem(C.accent(idea.title));
  printSystem(idea.description);
  printSystem(C.dim(`Law: ${idea.law_applied}  |  Feasibility: ${idea.feasibility}`));
}

async function handleLaws() {
  const brain = await loadBrain();
  const laws = brain.getLaws();
  printSystem(`${C.accent('── Universal Laws (' + laws.length + ') ──')}`);
  laws.forEach((l, i) => {
    const num = C.dim(`  ${(i+1).toString().padStart(2)}. `);
    printSystem(num + chalk.white(l));
  });
}

async function handleSearch(query) {
  const brain = await loadBrain();
  const results = brain.searchKnowledge(query, 8);
  if (results.length === 0) { printSystem(C.dim('No results found.')); return; }
  printSystem(`${C.accent(`── Search: "${query}" (${results.length} results) ──`)}`);
  results.forEach((r, i) => {
    const cat = r.category ? ` ${C.dim(`[${r.category}]`)}` : '';
    printSystem(`${C.dim(`  ${(i+1).toString().padStart(2)}.`)}${C.accent(r.title)}${cat}`);
    printSystem(C.dim('       ') + r.content.substring(0, 200) + (r.content.length > 200 ? '...' : ''));
  });
}

async function handleStatus() {
  const brain = await loadBrain();
  const stats = brain.getStats();
  let connected = false;
  try { await fetchJSON('/api/health'); connected = true; } catch (_) {}
  printSystem(`${C.accent('── Status ──')}`);
  printSystem(`  Knowledge entries : ${stats.k}`);
  printSystem(`  Wisdom quotes     : ${stats.q}`);
  printSystem(`  Business ideas    : ${stats.i}`);
  printSystem(`  Proxy             : ${connected ? C.green('connected') : C.error('disconnected')}`);
  printSystem(`  RAG               : BM25 + FTS5 + TF-IDF cosine`);
  printSystem(`  Commands          : type /help`);
}

// ── Chat ───────────────────────────────────────────────────────────────────────

const HISTORY = [];

async function runChat(input) {
  const brain = await loadBrain();
  let context = '';
  const hits = brain.searchKnowledge(input, 3);
  if (hits.length > 0) {
    context = '\n\n[Relevant knowledge from notebook:]\n' +
      hits.map(h => `  • ${h.title}: ${h.content.substring(0, 300)}`).join('\n');
  }
  let sysPrompt = '';
  try { const p = await fetchJSON('/api/character/prompt'); sysPrompt = p.content; } catch (_) {}
  const fullSys = context + '\n\n' + sysPrompt;

  HISTORY.push({ role: 'user', content: input });
  HISTORY.push({ role: 'system', content: fullSys });

  printUser(input);
  process.stdout.write(C.ai('Izuku: ') + C.dim('analysing...\n\n'));

  try {
    const reply = await fetchChat(HISTORY);
    HISTORY.pop();
    HISTORY.push({ role: 'assistant', content: reply });
    console.log('');
    printAI(reply);
    console.log('');
  } catch (e) {
    HISTORY.pop();
    console.log('');
    printError('Error: ' + e.message);
    console.log('');
  }
}

// ── Output Helpers ─────────────────────────────────────────────────────────────

function printUser(msg) { console.log(C.user('You: ') + msg); }
function printAI(msg) {
  msg.split('\n').forEach(line => {
    if (line.startsWith('  ')) console.log(C.dim(line));
    else console.log(C.ai(line));
  });
}
function printSystem(msg) { if (typeof msg === 'string') console.log(msg); }
function printError(msg) { console.log(C.error('  ⚠  ' + msg)); }

// ── Banner ─────────────────────────────────────────────────────────────────────

function showBanner() {
  console.log('');
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log(C.accent('  IZUKU — Philosopher Hero · Character Flow'));
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(C.dim('  Ask anything → gets a philosophical answer grounded in universal laws'));
  console.log(C.dim('  Type /help for commands'));
  console.log('');
}

function showHelp() {
  console.log(C.dim(`
  ╔══════════════════════════════════════════════════════════════╗
  ║              IZUKU — COMMAND PALETTE                        ║
  ╠══════════════════════════════════════════════════════════════╣
  │ /quote [theme]   — philosophical quote                       │
  │ /poem [topic]    — law-grounded poetry                       │
  │ /idea [domain]   — business idea based on a universal law    │
  │ /laws            — list all 20 universal laws                │
  │ /search <q>      — hybrid RAG search (BM25+FTS5+TF-IDF)     │
  │ /status          — DB stats + proxy connection               │
  │ /clear           — clear conversation history                │
  │ /help            — this message                              │
  ╚══════════════════════════════════════════════════════════════╝`));
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  showBanner();

  let proxyOk = false;
  try { await fetchJSON('/api/health'); proxyOk = true;
    console.log(C.dim('  ✓ Connected to freellmapi at ' + PROXY_HOST));
  } catch (_) {
    console.log(C.error('  ✗ Cannot reach freellmapi at ' + PROXY_HOST));
    console.log(C.dim('    Start it: cd ../freellmapi && npx tsx server/src/index.ts\n'));
  }

  const brain = await loadBrain();
  const stats = brain.getStats();
  console.log(C.dim(`  ✓ Brain loaded: ${stats.k} knowledge, ${stats.q} quotes`));
  console.log(C.dim('  ✓ RAG: BM25 + SQLite FTS5 + TF-IDF cosine similarity\n'));

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: C.dim('› ') });
  let pending = Promise.resolve();

  rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) return;
    pending = pending.then(async () => {
      if (raw === '/clear') { HISTORY.splice(0, HISTORY.length); console.log(C.dim('  History cleared.\n')); return; }
      if (raw === '/help') { showHelp(); return; }
      if (raw.startsWith('/')) {
        const parts = raw.slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        await (
          cmd === 'quote'   ? handleQuote(args)   :
          cmd === 'poem'    ? handlePoem(args)    :
          cmd === 'idea'    ? handleIdea(args)    :
          cmd === 'laws'    ? handleLaws()        :
          cmd === 'search'  ? handleSearch(args)  :
          cmd === 'status'  ? handleStatus()      :
          (() => { printError(`Unknown command: /${cmd}. Type /help for options.`); })()
        );
        await new Promise(r => setTimeout(r, 50));
        return;
      }
      await runChat(raw);
      await new Promise(r => setTimeout(r, 50));
    });
  });

  process.stdin.on('end', async () => {
    await pending;
    console.log(C.dim('\n  Plus ultra. Until next time.\n'));
    rl.close();
  });

  rl.prompt();
}

main().catch(e => { console.error(C.error('Fatal: ' + e.message)); process.exit(1); });
