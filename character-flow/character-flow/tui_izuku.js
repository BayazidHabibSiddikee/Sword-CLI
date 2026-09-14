#!/usr/bin/env node
/**
 * tui_izuku.js — Izuku Midoriya: Philosopher Hero + Researcher
 * Skills: web search, Wikipedia, books, news, RAG, quotes, poetry, ideas
 */
import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null, _tools = null;
async function loadBrain() { if (_brain) return _brain; const m = await import(join(_ROOT, 'brain', 'izuku.js')); m.rag.load(); _brain = m; return m; }
async function loadTools() { if (_tools) return _tools; _tools = { web: await import(join(_ROOT, 'tools', 'web.js')), books: await import(join(_ROOT, 'tools', 'books.js')) }; return _tools; }
const C = { user: chalk.cyan, ai: chalk.green, dim: chalk.gray, accent: chalk.blueBright, error: chalk.red, green: chalk.green };

async function fetchJSON(p) { const r = await fetch(`${PROXY_HOST}${p}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function fetchChat(msgs) { const r = await fetch(`${PROXY_HOST}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: msgs, stream: false }) }); if (!r.ok) throw new Error(`Proxy ${r.status}`); return (await r.json()).choices?.[0]?.message?.content || '[no response]'; }

async function handleSearch(query) {
  const t = await loadTools();
  const [ddg, wiki] = await Promise.all([t.web.ddgSearch(query, 5), t.web.wikiSearch(query, 5)]);
  let out = `${C.accent(`── Search: "${query}" ──`)}\n`;
  if (ddg.length > 0) { out += `${C.dim('## Web Results ##')}\n`; ddg.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${r.text?.substring(0, 150) || ''}\n     → ${r.first_url || ''}\n`; }); }
  if (wiki.length > 0) { out += `${C.dim('\n## Wikipedia ##')}\n`; wiki.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)}\n     ${r.snippet?.substring(0, 200)}\n     → ${r.url}\n`; }); }
  const brain = await loadBrain();
  const rag = brain.searchKnowledge(query, 5);
  if (rag.length > 0) { out += `${C.dim('\n## Knowledge Base ##')}\n`; rag.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)} [${r.category}]\n     ${r.content.substring(0, 200)}\n`; }); }
  printSystem(out.trim());
}

async function handleWiki(topic) {
  const t = await loadTools();
  const articles = await t.web.wikiSearch(topic, 3);
  if (articles.length === 0) { printSystem(C.dim('No Wikipedia results for "' + topic + '".')); return; }
  const art = articles[0];
  printSystem(`${C.accent(`── Wikipedia: ${art.title} ──`)}`);
  printSystem(C.dim(art.url));
  printSystem(C.dim((art.snippet || '').substring(0, 300)));
  const content = await t.web.wikiGetContent(art.title);
  if (content?.length > 50) printSystem(C.dim('\n--- Excerpt ---\n' + content.substring(0, 600)));
}

async function handleBooks(query) {
  const t = await loadTools();
  const results = await t.books.searchBooks(query || 'philosophy', 8);
  if (results.length === 0) { printSystem(C.dim('No books found. Try: "philosophy", "heroism", "psychology".')); return; }
  printSystem(`${C.accent(`── Books: "${query || 'philosophy'}" ──`)}`);
  results.forEach((b, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(b.title), C.dim(` [${b.source}] — ${b.url}`)); });
}

async function handleNews(category = 'all') {
  const t = await loadTools();
  try {
    const src = category === 'war' ? 'Reuters' : category === 'business' ? 'Bloomberg' : 'BBC_World';
    const items = await t.web.fetchNewsFeed(src, 8);
    if (items.length === 0) { printSystem(C.dim('No news available right now.')); return; }
    const label = category === 'war' ? 'War & Conflict' : category === 'business' ? 'Business & Markets' : 'Latest News';
    printSystem(`${C.accent(`── ${label} ──`)}`);
    items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 70))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
  } catch (e) { printSystem(C.error('News fetch failed: ' + e.message)); }
}

async function handleQuote(theme) {
  const brain = await loadBrain();
  try {
    const q = await fetchJSON(`/api/character/quote/${theme || 'universal'}`);
    printSystem(`${C.accent('── Quote ──')}`); printSystem(`"${q.text}"`); printSystem(C.dim(`— ${q.author}  |  Law: ${q.law || q.source_law || '?'}`));
  } catch (_) {
    const q = brain.generateQuote(theme || 'universal');
    printSystem(`${C.accent('── Quote ──')}`); printSystem(`"${q.text}"`); printSystem(C.dim(`— ${q.author}  |  Theme: ${q.theme}`));
  }
}

async function handlePoem(topic) {
  const brain = await loadBrain();
  printSystem(`${C.accent('── Poem ──')}`); printSystem(brain.generatePoem(topic || 'life'));
}

async function handleIdea(domain) {
  const brain = await loadBrain();
  const idea = brain.generateBusinessIdea(domain || null);
  printSystem(`${C.accent('── Business Idea ──')}`); printSystem(C.accent(idea.title)); printSystem(idea.description); printSystem(C.dim(`Law: ${idea.law_applied}  |  Feasibility: ${idea.feasibility}`));
}

async function handleLaws() {
  const brain = await loadBrain();
  const laws = brain.getLaws();
  printSystem(`${C.accent('── Universal Laws (' + laws.length + ') ──')}`);
  laws.forEach((l, i) => { const num = C.dim(`  ${(i+1).toString().padStart(2)}. `); printSystem(num + chalk.white(l)); });
}

async function handleStatus() {
  const brain = await loadBrain();
  const stats = brain.getStats();
  let connected = false;
  try { await fetchJSON('/api/health'); connected = true; } catch (_) {}
  printSystem(`${C.accent('── Status ──')}`);
  printSystem(`  Knowledge entries : ${stats.k}`);
  printSystem(`  Wisdom quotes     : ${stats.q}`);
  printSystem(`  Proxy             : ${connected ? C.green('connected') : C.error('disconnected')}`);
  printSystem(`  RAG               : BM25 + FTS5 + TF-IDF cosine`);
  printSystem(`  Tools             : web search, Wikipedia, books, news`);
}

const HISTORY = [];
async function runChat(input) {
  const brain = await loadBrain();
  let context = '';
  const hits = brain.searchKnowledge(input, 3);
  if (hits.length > 0) context = '\n\n[Relevant knowledge from notebook:]\n' + hits.map(h => `  • ${h.title}: ${h.content.substring(0, 300)}`).join('\n');
  let sysPrompt = '';
  try { const p = await fetchJSON('/api/character/prompt'); sysPrompt = p.content; } catch (_) {}
  HISTORY.push({ role: 'user', content: input });
  HISTORY.push({ role: 'system', content: context + '\n\n' + sysPrompt });
  printUser(input); process.stdout.write(C.ai('Izuku: ') + C.dim('analysing...\n\n'));
  try {
    const reply = await fetchChat(HISTORY);
    HISTORY.pop(); HISTORY.push({ role: 'assistant', content: reply });
    console.log(''); printAI(reply); console.log('');
  } catch (e) { HISTORY.pop(); console.log(''); printError('Error: ' + e.message); console.log(''); }
}

function printUser(m) { console.log(C.user('You: ') + m); }
function printAI(m) { m.split('\n').forEach(l => l.startsWith('  ') ? console.log(C.dim(l)) : console.log(C.ai(l))); }
function printSystem(m) { if (typeof m === 'string') console.log(m); }
function printError(m) { console.log(C.error('  ⚠  ' + m)); }

function showBanner() {
  console.log('');
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log(C.accent('  IZUKU — Philosopher Hero · Researcher'));
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(C.dim('  Ask anything, search the web, discover books, track the laws of reality.'));
  console.log(C.dim('  Type /help for commands\n'));
}

function showHelp() {
  console.log(C.dim(`
  ╔══════════════════════════════════════════════════════════════╗
  ║              IZUKU — COMMAND PALETTE                        ║
  ╠══════════════════════════════════════════════════════════════╣
  │ SEARCH & RESEARCH                                           │
  │ /search <q>         — web + wiki + knowledge base search     │
  │ /wiki <topic>       — Wikipedia article summary              │
  │ /books [topic]      — find free books (Gutenberg, IA)       │
  │ /news [cat]         — latest news (all/war/business)        │
  │                                                       │
  │ CHARACTER                                                   │
  │ /quote [theme]      — philosophical quote                   │
  │ /poem [topic]       — law-grounded poetry                  │
  │ /idea [domain]      — business idea from universal laws     │
  │ /laws               — 20 universal laws                     │
  │                                                       │
  │ SYSTEM                                                        │
  │ /status             — DB stats + proxy + tools             │
  │ /clear              — clear conversation history            │
  │ /help               — this message                          │
  ╚══════════════════════════════════════════════════════════════╝`));
}

async function main() {
  showBanner();
  let connected = false;
  try { await fetchJSON('/api/health'); connected = true;
    console.log(C.dim('  ✓ Connected to freellmapi at ' + PROXY_HOST));
  } catch (_) { console.log(C.error('  ✗ Cannot reach freellmapi. Start it: cd ../freellmapi && npx tsx server/src/index.ts\n')); }
  const brain = await loadBrain();
  const stats = brain.getStats();
  console.log(C.dim(`  ✓ Brain loaded: ${stats.k} knowledge, ${stats.q} quotes`));
  console.log(C.dim('  ✓ RAG: BM25 + SQLite FTS5 + TF-IDF cosine\n'));

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: C.dim('› ') });
  let pending = Promise.resolve();
  rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) return;
    pending = pending.then(async () => {
      if (raw === '/clear') { HISTORY.splice(0, HISTORY.length); console.log(C.dim('  History cleared.\n')); return; }
      if (raw === '/help') { showHelp(); return; }
      if (raw.startsWith('/')) {
        const parts = raw.slice(1).split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1).join(' ');
        await (cmd === 'search' ? handleSearch(args) : cmd === 'wiki' ? handleWiki(args) : cmd === 'books' ? handleBooks(args) : cmd === 'news' ? handleNews(args) : cmd === 'quote' ? handleQuote(args) : cmd === 'poem' ? handlePoem(args) : cmd === 'idea' ? handleIdea(args) : cmd === 'laws' ? handleLaws() : cmd === 'status' ? handleStatus() : (() => { printError(`Unknown command: /${cmd}. Type /help for options.`); })());
        await new Promise(r => setTimeout(r, 50));
        return;
      }
      await runChat(raw);
      await new Promise(r => setTimeout(r, 50));
    });
  });
  process.stdin.on('end', async () => { await pending; console.log(C.dim('\n  Plus ultra. Until next time.\n')); rl.close(); });
  rl.prompt();
}
main().catch(e => { console.error(C.error('Fatal: ' + e.message)); process.exit(1); });
