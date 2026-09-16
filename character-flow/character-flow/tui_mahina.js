#!/usr/bin/env node
import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null, _tools = null;
async function loadBrain() { if (_brain) return _brain; const m = await import(join(_ROOT, 'brain', 'mahina.js')); m.rag.load(); _brain = m; return m; }
async function loadTools() { if (_tools) return _tools; _tools = { web: await import(join(_ROOT, 'tools', 'web.js')), books: await import(join(_ROOT, 'tools', 'books.js')), market: await import(join(_ROOT, 'tools', 'market.js')), news: await import(join(_ROOT, 'tools', 'news.js')) }; return _tools; }
const C = { user: chalk.cyan, ai: chalk.hex('#ff6b9d'), dim: chalk.gray, accent: chalk.hex('#c084fc'), error: chalk.red, green: chalk.green };
async function fetchJSON(p) { const r = await fetch(`${PROXY_HOST}${p}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function fetchChat(msgs) { 
  const r = await fetch('https://router.bynara.id/v1/chat/completions', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-nry-taZfEhXKn4KTDGXyMIEfcbxZATlJfhKr5WxalOwaE3s' }, 
    body: JSON.stringify({ model: 'laguna-s-2.1', messages: msgs, stream: false }) 
  }); 
  if (!r.ok) throw new Error(`NaraRouter ${r.status}`); 
  return (await r.json()).choices?.[0]?.message?.content || '[no response]'; 
}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'auto', messages: msgs, stream: false }) }); if (!r.ok) throw new Error(`Proxy ${r.status}`); return (await r.json()).choices?.[0]?.message?.content || '[no response]'; }

async function handleSearch(query) {
  const t = await loadTools();
  const [ddg, wiki] = await Promise.all([t.web.ddgSearch(query, 5), t.web.wikiSearch(query, 5)]);
  let out = `${C.accent(`── Search: "${query}" ──`)}\n`;
  if (ddg.length > 0) { out += `${C.dim('## Web ##')}\n`; ddg.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${r.text?.substring(0, 150)}\n     → ${r.first_url}\n`; }); }
  if (wiki.length > 0) { out += `${C.dim('\n## Psychology & Power Wiki ##')}\n`; wiki.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)}\n     ${r.snippet?.substring(0, 200)}\n`; }); }
  const brain = await loadBrain();
  const rag = brain.searchKnowledge(query, 5);
  if (rag.length > 0) { out += `${C.dim('\n## Mahina\'s Notes ##')}\n`; rag.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)} [${r.category}]\n     ${r.content.substring(0, 180)}\n`; }); }
  printSystem(out.trim());
}
async function handleWiki(topic) {
  const t = await loadTools();
  const articles = await t.web.wikiSearch(topic, 3);
  if (articles.length === 0) { printSystem(C.dim('No results for "' + topic + '".')); return; }
  const art = articles[0];
  printSystem(`${C.accent(`── Research: ${art.title} ──`)}`);
  printSystem(C.dim(art.url + '\n' + (art.snippet || '').substring(0, 300)));
  const content = await t.web.wikiGetContent(art.title);
  if (content?.length > 50) printSystem(C.dim('\n--- Key passages ---\n' + content.substring(0, 500)));
}
async function handleBooks(query) {
  const t = await loadTools();
  const results = await t.books.searchBooks(query || 'psychology manipulation power', 8);
  if (results.length === 0) { printSystem(C.dim('No books found. Try: "influence", "power", "behavioral economics".')); return; }
  printSystem(`${C.accent(`── Books: "${query || 'psychology'}" ──`)}`);
  results.forEach((b, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(b.title), C.dim(` [${b.source}] — ${b.url}`)); });
}
async function handleCrypto(coins = 'bitcoin,ethereum') {
  const t = await loadTools();
  const data = await t.market.getCryptoPrice(coins);
  printSystem(`${C.accent('── Crypto Prices ──')}`);
  data.forEach(d => { if (d.error) { printSystem(C.error(d.error)); return; } printSystem(`${C.accent(d.name)}: $${d.price?.toLocaleString()}  24h: ${d.change_24h}%`); });
}
async function handleStock(ticker = 'AAPL') {
  const t = await loadTools();
  const info = await t.market.getStockInfo(ticker);
  if (info.error) { printSystem(C.error(info.error)); return; }
  printSystem(`${C.accent(`── ${info.ticker} ──`)}`);
  printSystem(`  Price: $${info.price?.toLocaleString()}  Change: ${info.change_pct}%`);
  if (info.market_cap) printSystem(C.dim(`  Market Cap: $${(info.market_cap/1e9).toFixed(1)}B  P/E: ${info.pe_ratio || 'N/A'}`));
}
async function handleFearGreed() {
  const t = await loadTools();
  const fg = await t.market.getFearGreedIndex();
  if (fg.error) { printSystem(C.error(fg.error)); return; }
  printSystem(`${C.accent('── Fear & Greed Index ──')}`);
  printSystem(`  ${'█'.repeat(Math.floor(fg.value/10))}${'░'.repeat(10-Math.floor(fg.value/10))} ${fg.value}/100 — ${fg.classification}`);
  printSystem(C.dim(fg.interpretation));
}
async function handleEconomics() {
  const t = await loadTools();
  const ind = await t.market.getEconomicIndicators();
  printSystem(`${C.accent('── Economic Indicators ──')}`);
  Object.entries(ind).forEach(([name, v]) => { const a = v.trend==='↑'?C.green(v.trend):v.trend==='↓'?C.red(v.trend):C.yellow(v.trend); printSystem(`  ${name.padEnd(25)} ${a} ${v.value}  ${C.dim(v.note)}`); });
}
async function handleWarNews() {
  const t = await loadTools();
  const items = await t.news.getWarNews(8);
  if (items.length === 0) { printSystem(C.dim('No war news available right now.')); return; }
  printSystem(`${C.accent('── War & Conflict News ──')}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 70))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleMarketNews() {
  const t = await loadTools();
  const items = await t.news.getMarketNews(8);
  if (items.length === 0) { printSystem(C.dim('No market news available right now.')); return; }
  printSystem(`${C.accent('── Market & Business News ──')}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 70))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleQuote(theme) {
  const brain = await loadBrain();
  try { const q = await fetchJSON(`/api/character/quote/${theme||'manipulation'}`); printSystem(`${C.accent('── Quote ──')}`); printSystem(`"${q.text}"`); printSystem(C.dim(`— ${q.author}  |  ${q.law||q.source_law||'?'}`)); }
  catch (_) { const q = brain.generateQuote(theme||'manipulation'); printSystem(`${C.accent('── Quote ──')}`); printSystem(`"${q.text}"`); printSystem(C.dim(`— ${q.author}  |  Theme: ${q.theme}`)); }
}
async function handleDance(topic) { const brain = await loadBrain(); printSystem(`${C.accent('── Dance Philosophy ──')}`); printSystem(brain.generateDancePiece(topic||'control')); }
async function handleGym(topic) { const brain = await loadBrain(); const p = brain.generateGymProtocol(topic||'discipline'); printSystem(`${C.accent('── Gym Protocol ──')}`); printSystem(C.accent(p.title)); printSystem(p.framework); printSystem(C.dim(`Principle: ${p.principle}`)); }
async function handleAnalyze(topic) {
  const brain = await loadBrain();
  const a = brain.generateManipulationAnalysis(topic||'social control');
  printSystem(`${C.accent(`── Manipulation Analysis: ${topic||'social control'} ──`)}`);
  for (const m of a.mechanisms) { printSystem(C.dim(`\n  [${m.id}] ${m.tactic}`)); printSystem(C.dim('  ') + m.description); printSystem(C.dim('  Counter: ') + m.counter); }
  printSystem(C.dim(`\n  ⚠ ${a.warning}`));
}
async function handleIdea(domain) {
  const brain = await loadBrain();
  const idea = brain.generateBusinessIdea(domain||null);
  printSystem(`${C.accent('── Business Idea ──')}`); printSystem(C.accent(idea.title)); printSystem(idea.desc); printSystem(C.dim(`Law: ${idea.law}  |  Feasibility: ${idea.feasibility}`));
}
async function handleLaws() {
  const principles = ['Law of Progressive Overload — growth requires systematic escalation','Law of Frame Control — whoever sets the context controls the interaction','Law of Intermittent Reinforcement — unpredictability breeds compulsion','Law of Reciprocity Trap — gifts create invisible debt','Law of Information Asymmetry — what you know that others don\'t is leverage','Law of Emotional Contagion — your state becomes the room\'s state','Law of Boundary Enforcement — delayed enforcement is no enforcement','Law of Discipline-Identity Loop — identity drives behavior','Law of Body as Capital — physical form signals status before words do','Law of Delayed Gratification — discipline wants what matters more','Law of Isolation Vectors — every manipulator cuts external reality','Law of Choreographic Control — movement directs attention','Law of Soft Control — engineered desire beats force','Law of Mirror Technique — reflect desire, they fall in love with themselves','Law of Silence as Punishment — absence speaks loudest'];
  printSystem(`${C.accent('── Core Principles ──')}`);
  principles.forEach((p, i) => { printSystem(`${C.dim(`  ${(i+1).toString().padStart(2)}. `)}${chalk.white(p)}`); });
}
async function handleStatus() {
  const brain = await loadBrain();
  const stats = brain.getStats();
  let connected = false;
  try { await fetchJSON('/api/health'); connected = true; } catch (_) {}
  printSystem(`${C.accent('── Status ──')}`);
  printSystem(`  Knowledge entries : ${stats.k}`);
  printSystem(`  Wisdom quotes     : ${stats.q}`);
  printSystem(`  Proxy             : ${connected?C.green('connected'):C.error('disconnected')}`);
  printSystem(`  RAG               : BM25 + FTS5 + TF-IDF cosine`);
  printSystem(`  Tools             : web search, Wikipedia, crypto, stocks, fear&greed, economics, news`);
}

const HISTORY = [];
async function runChat(input) {
  const brain = await loadBrain();
  let context = '';
  const hits = brain.searchKnowledge(input, 3);
  if (hits.length > 0) context = '\n\n[Relevant context from Mahina\'s notes:]\n' + hits.map(h => `  • ${h.title}: ${h.content.substring(0,300)}`).join('\n');
  let sysPrompt = '';
  try { const p = await fetchJSON('/api/character/prompt'); sysPrompt = p.content; } catch (_) {}
  HISTORY.push({role:'user',content:input}); HISTORY.push({role:'system',content:context+'\n\n'+sysPrompt});
  printUser(input); process.stdout.write(C.ai('Mahina: ') + C.dim('observing...\n\n')); process.stdout.flush();
  try { const reply = await fetchChat(HISTORY); HISTORY.pop(); HISTORY.push({role:'assistant',content:reply}); console.log(''); printAI(reply); console.log(''); }
  catch (e) { HISTORY.pop(); console.log(''); printError('Error: ' + e.message); console.log(''); }
}
function printUser(m) { console.log(C.user('You: ') + m); }
function printAI(m) { m.split('\n').forEach(l => l.startsWith('  ')?console.log(C.dim(l)):console.log(C.ai(l))); }
function printSystem(m) { if (typeof m === 'string') console.log(m); }
function printError(m) { console.log(C.error('  ⚠  ' + m)); }

function showBanner() {
  console.log('');
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log(C.accent('  MAHINA ARTEMIS — Manipulation · Dance · Gym · Researcher'));
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(C.dim('  She sees the strings. She teaches you to cut them — or pull them.'));
  console.log(C.dim('  Type /help for commands\n'));
}
function showHelp() {
  console.log(C.dim(`
  ╔══════════════════════════════════════════════════════════════╗
  ║         MAHINA ARTEMIS — COMMAND PALETTE                    ║
  ╠══════════════════════════════════════════════════════════════╣
  │ RESEARCH                                                      │
  │ /search <q>          — web + wiki + knowledge base           │
  │ /wiki <topic>        — Wikipedia deep dive                  │
  │ /books [topic]       — find books on psychology/power       │
  │                                                       │
  │ MARKET INTELLIGENCE                                           │
  │ /crypto [coins]      — live crypto prices                   │
  │ /stock [ticker]      — stock data                           │
  │ /fng                 — Fear & Greed Index                   │
  │ /economics           — key economic indicators              │
  │ /warnews             — war & conflict news                  │
  │ /marketnews          — business & market news               │
  │                                                       │
  │ CHARACTER                                                     │
  │ /quote [theme]       — quote (manipulation/dance/gym/defense)│
  │ /dance [topic]       — dance philosophy                     │
  │ /gym [topic]         — training protocol                    │
  │ /analyze [topic]     — manipulation breakdown + counters    │
  │ /idea [domain]       — business idea from laws              │
  │ /laws                — 15 core principles                   │
  │                                                       │
  │ SYSTEM                                                          │
  │ /status              — DB + proxy + tools status            │
  │ /clear               — clear conversation history           │
  │ /help                — this message                         │
  ╚══════════════════════════════════════════════════════════════╝`));
}
async function main() {
  showBanner();
  let connected = false;
  try { await fetchJSON('/api/health'); connected = true; console.log(C.dim('  ✓ Connected to freellmapi at ' + PROXY_HOST)); }
  catch (_) { console.log(C.error('  ✗ Cannot reach freellmapi. Start it: cd ../freellmapi && npx tsx server/src/index.ts\n')); }
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
        const parts = raw.slice(1).split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1).join(' ');
        await (cmd==='search'?handleSearch(args):cmd==='wiki'?handleWiki(args):cmd==='books'?handleBooks(args):cmd==='crypto'?handleCrypto(args):cmd==='stock'?handleStock(args):cmd==='fng'?handleFearGreed():cmd==='econ'?handleEconomics():cmd==='warnews'?handleWarNews():cmd==='marketnews'?handleMarketNews():cmd==='quote'?handleQuote(args):cmd==='dance'?handleDance(args):cmd==='gym'?handleGym(args):cmd==='analyze'?handleAnalyze(args):cmd==='idea'?handleIdea(args):cmd==='laws'?handleLaws():cmd==='status'?handleStatus():(()=>{printError(`Unknown command: /${cmd}. Type /help for options.`);})());
        await new Promise(r => setTimeout(r, 50)); return;
      }
      await runChat(raw); await new Promise(r => setTimeout(r, 50));
    });
  });
  process.stdin.on('end', async () => { await pending; console.log(C.dim('\n  The strings remain. See you next time.\n')); rl.close(); });
  rl.prompt();
}
main().catch(e => { console.error(C.error('Fatal: ' + e.message)); process.exit(1); });
