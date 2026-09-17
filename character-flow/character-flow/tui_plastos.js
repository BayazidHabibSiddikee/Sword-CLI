#!/usr/bin/env node
import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null, _tools = null;
async function loadBrain() { if (_brain) return _brain; const m = await import(join(_ROOT, 'brain', 'plastos.js')); m.rag.load(); _brain = m; return m; }
async function loadTools() { if (_tools) return _tools; _tools = { web: await import(join(_ROOT, 'tools', 'web.js')), books: await import(join(_ROOT, 'tools', 'books.js')), market: await import(join(_ROOT, 'tools', 'market.js')), news: await import(join(_ROOT, 'tools', 'news.js')) }; return _tools; }
const C = { user: chalk.cyan, ai: chalk.hex('#ff4466'), dim: chalk.gray, accent: chalk.hex('#ff6b9d'), error: chalk.red, green: chalk.green };
async function fetchJSON(p) { const r = await fetch(`${PROXY_HOST}${p}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'http://localhost:3001/v1').replace(/\/+$/, '').replace(/\/v1$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'auto';
async function fetchChat(msgs) {
  const r = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(OPENAI_API_KEY ? { 'Authorization': `Bearer ${OPENAI_API_KEY}` } : {}) },
    body: JSON.stringify({ model: MODEL, messages: msgs, stream: false })
  });
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || '[no response]';
}

async function handleSearch(query) {
  const t = await loadTools();
  const [ddg, wiki] = await Promise.all([t.web.ddgSearch(query, 5), t.web.wikiSearch(query, 5)]);
  let out = `${C.accent(`── Search: "${query}" ──`)}\n`;
  if (ddg.length > 0) { out += `${C.dim('## Web ##')}\n`; ddg.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${r.text?.substring(0, 150)}\n     → ${r.first_url}\n`; }); }
  if (wiki.length > 0) { out += `${C.dim('\n## Reference ##')}\n`; wiki.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)}\n     ${r.snippet?.substring(0, 200)}\n`; }); }
  const brain = await loadBrain();
  const rag = brain.searchKnowledge(query, 5);
  if (rag.length > 0) { out += `${C.dim('\n## Plastos\' Research ##')}\n`; rag.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)} [${r.category}]\n     ${r.content.substring(0, 180)}\n`; }); }
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
  if (content?.length > 50) printSystem(C.dim('\n--- Excerpt ---\n' + content.substring(0, 500)));
}
async function handleBooks(query) {
  const t = await loadTools();
  const results = await t.books.searchBooks(query || 'war economy history', 8);
  if (results.length === 0) { printSystem(C.dim('No books found. Try: "war", "economy", "history".')); return; }
  printSystem(`${C.accent(`── Books: "${query || 'war/economy'}" ──`)}`);
  results.forEach((b, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(b.title), C.dim(` [${b.source}]`)); });
}
async function handleWarNews() {
  const t = await loadTools();
  const items = await t.news.getWarNews(10);
  if (items.length === 0) { printSystem(C.dim('No war news available right now.')); return; }
  printSystem(`${C.accent('── War & Conflict Reporting ──')}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 70))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleMarketNews() {
  const t = await loadTools();
  const items = await t.news.getMarketNews(10);
  if (items.length === 0) { printSystem(C.dim('No market news available right now.')); return; }
  printSystem(`${C.accent('── Markets & Economy News ──')}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 70))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleAllNews() {
  const t = await loadTools();
  const items = await t.news.getAllNews(12);
  if (items.length === 0) { printSystem(C.dim('No news available right now.')); return; }
  printSystem(`${C.accent('── Global News Wire ──')}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}. [${item.source}]`), C.accent(item.title.substring(0, 65))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleEconomy() {
  const t = await loadTools();
  const ind = await t.market.getEconomicIndicators();
  printSystem(`${C.accent('── Economic Indicators ──')}`);
  Object.entries(ind).forEach(([name, v]) => { const a = v.trend==='↑'?chalk.green(v.trend):v.trend==='↓'?chalk.red(v.trend):chalk.yellow(v.trend); printSystem(`  ${name.padEnd(25)} ${a} ${v.value}  ${C.dim(v.note)}`); });
  printSystem(C.dim('\n' + (ind.warning || '')));
}
async function handleWar(conflict) {
  const brain = await loadBrain();
  const report = brain.getWarReport(conflict || 'ukraine_russia');
  printSystem(`${C.accent('── War Report ──')}`);
  printSystem(C.accent(report.title));
  if (report.key_factors) { printSystem(C.dim('Key Factors:')); report.key_factors.forEach(f => printSystem(C.dim('  • ' + f))); }
  if (report.second_order) printSystem(C.dim('\nSecond-Order Effects: ' + report.second_order));
  if (report.verdict) printSystem(C.dim('\nVerdict: ' + report.verdict));
}
async function handleCrash(year) {
  const brain = await loadBrain();
  const analysis = brain.getCrashAnalysis(year);
  printSystem(`${C.accent('── Market Crash Analysis ──')}`);
  if (Array.isArray(analysis)) {
    analysis.slice(0, 3).forEach(a => { printSystem(C.accent(`${a.year} — ${a.trigger}`)); printSystem(C.dim('  Lesson: ' + a.lesson)); printSystem(C.dim('  Impact: ' + a.magnitude)); printSystem(''); });
  } else { printSystem(C.accent(`${analysis.year} — ${analysis.trigger}`)); printSystem(C.dim('  Lesson: ' + analysis.lesson)); printSystem(C.dim('  Impact: ' + analysis.magnitude)); }
}
async function handleExpose(target, claim, correction) {
  const brain = await loadBrain();
  const expose = brain.exposeFalseClaim(target, claim, correction);
  printSystem(`${C.accent('── Exposing False Claims ──')}`);
  printSystem(C.dim(`Target: ${expose.target}`));
  printSystem(C.dim(`False Claim: ${expose.false_claim}`));
  printSystem(C.dim(`Correction: ${expose.correction}`));
  printSystem(C.dim(`Evidence: ${expose.evidence}`));
}
async function handleQuote(type) {
  const brain = await loadBrain();
  printSystem(`${C.accent('── Quote ──')}`);
  printSystem(C.yellow(brain.generateQuote(type || 'truth')));
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
  printSystem(`  Tools             : web search, Wikipedia, books, war news, market news, economics`);
}

const HISTORY = [];
async function runChat(input) {
  const brain = await loadBrain();
  let context = '';
  const hits = brain.searchKnowledge(input, 3);
  if (hits.length > 0) context = '\n\n[Relevant reporting from Plastos\'s research:]\n' + hits.map(h => `  • ${h.title}: ${h.content.substring(0,300)}`).join('\n');
  let sysPrompt = '';
  try { const p = await fetchJSON('/api/character/prompt'); sysPrompt = p.content; } catch (_) {}
  HISTORY.push({role:'user',content:input}); HISTORY.push({role:'system',content:context+'\n\n'+sysPrompt});
  printUser(input); process.stdout.write(C.ai('Plastos: ') + C.dim('investigating...\n\n')); process.stdout.flush();
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
  console.log(C.accent('  PLASTOS JIADE — War · Economy · Market Crashes · Truth'));
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(C.dim('  I track the money. I expose the lies. I report what others miss.'));
  console.log(C.dim('  Type /help for commands\n'));
}
function showHelp() {
  console.log(C.dim(`
  ╔══════════════════════════════════════════════════════════════╗
  ║         PLASTOS JIADE — COMMAND PALETTE                     ║
  ╠══════════════════════════════════════════════════════════════╣
  │ RESEARCH                                                      │
  │ /search <q>          — web + wiki + knowledge base           │
  │ /wiki <topic>        — Wikipedia article summary             │
  │ /books [topic]       — find war/economy books               │
  │                                                       │
  │ NEWS REPORTING                                                │
  │ /warnews             — war & conflict headlines              │
  │ /marketnews          — business & market headlines           │
  │ /news                — global news wire (all sources)        │
  │                                                       │
  │ ANALYSIS                                                        │
  │ /war [conflict]      — strategic war report                 │
  │                        (ukraine_russia, gaza_israel, sudan)  │
  │ /crash [year]        — market crash history                  │
  │ /econ                — economic indicators (leading/coincident/lagging) │
  │ /expose [who] [claim] [correction]  — debunk false claims   │
  │                                                       │
  │ QUOTES                                                          │
  │ /quote [type]        — quote (truth/war/economy)            │
  │                                                       │
  │ SYSTEM                                                            │
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
        await (cmd==='search'?handleSearch(args):cmd==='wiki'?handleWiki(args):cmd==='books'?handleBooks(args):cmd==='warnews'?handleWarNews():cmd==='marketnews'?handleMarketNews():cmd==='news'?handleAllNews():cmd==='war'?handleWar(args):cmd==='crash'?handleCrash(args):cmd==='econ'?handleEconomy():cmd==='expose'?handleExpose(...args.split(' ',3)):cmd==='quote'?handleQuote(args):cmd==='status'?handleStatus():(()=>{printError(`Unknown command: /${cmd}. Type /help for options.`);})());
        await new Promise(r => setTimeout(r, 50)); return;
      }
      await runChat(raw); await new Promise(r => setTimeout(r, 50));
    });
  });
  process.stdin.on('end', async () => { await pending; console.log(C.dim('\n  The truth isn\'t always comfortable. See you next time.\n')); rl.close(); });
  rl.prompt();
}
main().catch(e => { console.error(C.error('Fatal: ' + e.message)); process.exit(1); });
