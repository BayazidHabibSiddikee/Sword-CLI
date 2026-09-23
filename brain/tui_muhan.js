#!/usr/bin/env node
import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null, _tools = null;
async function loadBrain() { if (_brain) return _brain; const m = await import(join(_ROOT, 'brain', 'muhan.js')); m.rag.load(); _brain = m; return m; }
async function loadTools() { if (_tools) return _tools; _tools = { web: await import(join(_ROOT, 'tools', 'web.js')), books: await import(join(_ROOT, 'tools', 'books.js')), market: await import(join(_ROOT, 'tools', 'market.js')), news: await import(join(_ROOT, 'tools', 'news.js')) }; return _tools; }
const C = { user: chalk.cyan, ai: chalk.hex('#ffd700'), dim: chalk.gray, accent: chalk.hex('#ffaa00'), error: chalk.red, green: chalk.green };
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
  if (rag.length > 0) { out += `${C.dim('\n## Muhan\'s Notes ##')}\n`; rag.forEach((r, i) => { out += `  ${(i+1).toString().padStart(2)}. ${C.accent(r.title)} [${r.category}]\n     ${r.content.substring(0, 180)}\n`; }); }
  printSystem(out.trim());
}
async function handleWiki(topic) {
  const t = await loadTools();
  const articles = await t.web.wikiSearch(topic, 3);
  if (articles.length === 0) { printSystem(C.dim('No results for "' + topic + '" on Wikipedia.')); return; }
  const art = articles[0];
  printSystem(`${C.accent(`── Research: ${art.title} ──`)}`);
  printSystem(C.dim(art.url + '\n' + (art.snippet || '').substring(0, 300)));
  const content = await t.web.wikiGetContent(art.title);
  if (content?.length > 50) printSystem(C.dim('\n' + content.substring(0, 500)));
}
async function handleBooks(query) {
  const t = await loadTools();
  const results = await t.books.searchBooks(query || 'business marketing trading', 8);
  if (results.length === 0) { printSystem(C.dim('No books found. Try: "marketing", "trading", "psychology".')); return; }
  printSystem(`${C.accent(`── Business & Finance Books ──`)}`);
  results.forEach((b, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(b.title), C.dim(` [${b.source}]`)); });
}
async function handleCrypto(coins = 'bitcoin,ethereum,solana') {
  const t = await loadTools();
  const data = await t.market.getCryptoPrice(coins);
  printSystem(`${C.accent('── Crypto Markets ──')}`);
  data.forEach(d => { if (d.error) { printSystem(C.error(d.error)); return; } const chg = d.change_24h !== 'N/A' ? (parseFloat(d.change_24h) >= 0 ? C.green('+') + d.change_24h + '%' : C.red(d.change_24h + '%')) : ''; printSystem(`${C.accent(d.name)}: $${d.price?.toLocaleString()}  ${chg}`); });
}
async function handleStock(ticker = 'AAPL') {
  const t = await loadTools();
  const info = await t.market.getStockInfo(ticker);
  if (info.error) { printSystem(C.error(info.error)); return; }
  const chgColor = (info.change_pct || '0').startsWith('-') ? C.red : C.green;
  printSystem(`${C.accent(`── ${info.ticker} ──`)}`);
  printSystem(`  Price: $${info.price?.toLocaleString()}  ${chgColor(info.change_pct + '%')}`);
  if (info.market_cap) printSystem(C.dim(`  Market Cap: $${(info.market_cap/1e9).toFixed(1)}B  P/E: ${info.pe_ratio || 'N/A'}`));
  printSystem(C.dim(`  52W: $${info.fifty_two_week_low?.toFixed(2)} — $${info.fifty_two_week_high?.toFixed(2)}`));
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
  Object.entries(ind).forEach(([name, v]) => { const a = v.trend==='↑'?chalk.green(v.trend):v.trend==='↓'?chalk.red(v.trend):chalk.yellow(v.trend); printSystem(`  ${name.padEnd(25)} ${a} ${v.value}  ${C.dim(v.note)}`); });
}
async function handleScreener(sector = 'Technology') {
  const t = await loadTools();
  const stocks = await t.market.screenerSector(sector);
  if (stocks.length === 0) { printSystem(C.error('Could not fetch screener data.')); return; }
  printSystem(`${C.accent(`── ${sector} Sector Leaders ──`)}`);
  stocks.forEach((s, i) => { const c = (s.change||'0%').startsWith('-')?C.red:C.green; printSystem(`${C.dim(`  ${(i+1).toString().padStart(2)}.`)} ${C.accent(s.ticker)}  $${s.price?.toFixed(2)}  ${c(s.change||'0%')}`); });
}
async function handleNews(source = 'business') {
  const t = await loadTools();
  const items = source === 'war' ? await t.news.getWarNews(8) : await t.news.getMarketNews(8);
  if (items.length === 0) { printSystem(C.dim('No news available right now.')); return; }
  printSystem(`${C.accent(`── ${source === 'war' ? 'War' : 'Market'} News ──`)}`);
  items.forEach((item, i) => { printSystem(C.dim(`  ${(i+1).toString().padStart(2)}.`), C.accent(item.title.substring(0, 65))); if (item.description) printSystem(C.dim(`     ${item.description.substring(0, 150)}`)); });
}
async function handleInsight(domain) {
  const brain = await loadBrain();
  printSystem(`${C.accent('── Insight ──')}`);
  printSystem(C.accent(brain.generateInsight(domain || 'business')));
}
async function handleVerdict(topic) {
  const brain = await loadBrain();
  const v = brain.getSpecialVerdict(topic);
  printSystem(`${C.accent('── Special Verdict ──')}`);
  printSystem(C.dim(`Thursday Class · ${v.topic}`));
  printSystem(C.dim(v.format));
  printSystem('');
  printSystem(C.yellow('We deconstruct product anatomy, marketing psychology, and growth math.'));
  printSystem(C.yellow('The verdict is always based on numbers, never opinions.'));
}
async function handleAdvice(problem) {
  const brain = await loadBrain();
  const a = brain.generateBusinessAdvice(problem);
  printSystem(`${C.accent('── Business Advice ──')}`);
  printSystem(C.dim(`Problem: ${a.problem}`));
  printSystem(C.yellow(`Principle: ${a.principle}`));
  printSystem(C.dim(`Action: ${a.action}`));
}
async function handleSpecial() { handleVerdict(null); }
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
  printSystem(`  Tools             : web search, Wikipedia, books, crypto, stocks, fear&greed, screener, news`);
}

const HISTORY = [];
async function runChat(input) {
  const brain = await loadBrain();
  let context = '';
  const hits = brain.searchKnowledge(input, 3);
  if (hits.length > 0) context = '\n\n[Relevant analysis from Muhan\'s notes:]\n' + hits.map(h => `  • ${h.title}: ${h.content.substring(0,300)}`).join('\n');
  let sysPrompt = '';
  try { const p = await fetchJSON('/api/character/prompt'); sysPrompt = p.content; } catch (_) {}
  HISTORY.push({role:'user',content:input}); HISTORY.push({role:'system',content:context+'\n\n'+sysPrompt});
  printUser(input); process.stdout.write(C.ai('Muhan: ') + C.dim('crunching numbers...\n\n')); process.stdout.flush();
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
  console.log(C.accent('  MUHAN HASWAZ — Business · Crypto · Stocks · Math Professor'));
  console.log(C.accent('═══════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log(C.dim('  Let me show you the numbers. Math doesn\'t lie.'));
  console.log(C.dim('  Type /help for commands\n'));
}
function showHelp() {
  console.log(C.dim(`
  ╔══════════════════════════════════════════════════════════════╗
  ║           MUHAN HASWAZ — COMMAND PALETTE                    ║
  ╠══════════════════════════════════════════════════════════════╣
  │ RESEARCH                                                      │
  │ /search <q>          — web + wiki + knowledge base           │
  │ /wiki <topic>        — Wikipedia deep dive                  │
  │ /books [topic]       — find business/marketing books        │
  │                                                       │
  │ MARKETS                                                       │
  │ /crypto [coins]      — live crypto prices                   │
  │ /stock [ticker]      — stock data                           │
  │ /fng                 — Fear & Greed Index                   │
  │ /econ                — economic indicators (leading/coincident/lagging)│
  │ /screener [sector]   — sector leaders                       │
  │ /news [war|biz]      — latest headlines                     │
  │                                                       │
  │ SPECIAL VERDICT (Thursday Class)                              │
  │ /insight [domain]    — business insight (seo/crypto/stocks/ │
  │                        psychology/math/marketing)           │
  │ /verdict [topic]     — special verdict deep dive           │
  │ /advice [problem]    — math-backed advice                   │
  │ /special             — random Thursday topic                │
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
  try { await fetchJSON('/api/health'); connected = true; console.log(C.dim('  ✓ Connected to swordcli at ' + PROXY_HOST)); }
  catch (_) { console.log(C.error('  ✗ Cannot reach swordcli. Start it: cd ../swordcli && npx tsx server/src/index.ts\n')); }
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
        await (cmd==='search'?handleSearch(args):cmd==='wiki'?handleWiki(args):cmd==='books'?handleBooks(args):cmd==='crypto'?handleCrypto(args):cmd==='stock'?handleStock(args):cmd==='fng'?handleFearGreed():cmd==='econ'?handleEconomics():cmd==='screener'?handleScreener(args):cmd==='news'?handleNews(args):cmd==='insight'?handleInsight(args):cmd==='verdict'?handleVerdict(args):cmd==='advice'?handleAdvice(args):cmd==='special'?handleSpecial():cmd==='status'?handleStatus():(()=>{printError(`Unknown command: /${cmd}. Type /help for options.`);})());
        await new Promise(r => setTimeout(r, 50)); return;
      }
      await runChat(raw); await new Promise(r => setTimeout(r, 50));
    });
  });
  process.stdin.on('end', async () => { await pending; console.log(C.dim('\n  The numbers don\'t lie. See you next time.\n')); rl.close(); });
  rl.prompt();
}
main().catch(e => { console.error(C.error('Fatal: ' + e.message)); process.exit(1); });
