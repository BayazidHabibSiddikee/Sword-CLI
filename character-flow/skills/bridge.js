#!/usr/bin/env node
/**
 * bridge.js — Real tool bridge calling ~/Documents/projects/tools/ Python scripts.
 * Every character gets access to: crypto, stocks, PDF, math, search, translation, code execution.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

const BRIDGE = '/home/sword/Documents/projects/tools/tool_bridge.py';
const TOOLS_DIR = '/home/sword/Documents/projects/tools';
const RESULTS_DIR = '/home/sword/Documents/Characters/character-flow/data/results';
mkdirSync(RESULTS_DIR, { recursive: true });

// Resolve any path: absolute passes through, relative searches /home/sword/Documents/ and ./data/results/
function resolvePath(rel) {
  if (rel.startsWith('/')) return rel;
  const tries = [
    `/home/sword/Documents/${rel}`,
    `${RESULTS_DIR}/${rel}`,
    `./${rel}`,
  ];
  for (const p of tries) if (existsSync(p)) return p;
  return tries[0]; // return first attempt even if missing
}

function py(module, func, args) {
  try {
    const out = execSync(
      `python3 "${BRIDGE}" ${module} ${func} '${JSON.stringify(args || {}).replace(/'/g, "'\\''")}'`,
      { timeout: 30000, encoding: 'utf-8' }
    ).trim();
    return JSON.parse(out);
  } catch (e) {
    return { error: (e.stderr || e.message)?.slice(0, 500) };
  }
}

async function httpGet(url, opts = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: opts.headers || {} });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? await res.json() : await res.text();
  } catch (e) { return { error: e.message }; }
}

export const TOOL_DEFINITIONS = [
  // Finance
  { type: 'function', function: { name: 'get_crypto_price', description: 'Get live cryptocurrency price in USD from CoinGecko via Python stock_data.', parameters: { type: 'object', properties: { coin: { type: 'string', description: 'bitcoin, ethereum, solana, dogecoin' } }, required: ['coin'] } }},
  { type: 'function', function: { name: 'get_stock_quote', description: 'Get live stock price and day range from Yahoo Finance via Python stock_data.', parameters: { type: 'object', properties: { ticker: { type: 'string', description: 'Stock ticker like AAPL, TSLA, MSFT' } }, required: ['ticker'] } }},
  { type: 'function', function: { name: 'get_top_coins', description: 'Top 10 cryptos by market cap with prices and 24h change.', parameters: { type: 'object', properties: {} } }},
  // Math
  { type: 'function', function: { name: 'calculate', description: 'Evaluate math expressions using Python math module: sqrt(144), pow(2,8), sin(3.14), log(100).', parameters: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] } }},
  { type: 'function', function: { name: 'solve_math', description: 'Symbolic math with SymPy: simplify, factor, expand, differentiate, integrate equations.', parameters: { type: 'object', properties: { expr: { type: 'string' }, op: { type: 'string', enum: ['simplify','expand','factor','diff','integrate','solve'], default: 'simplify' }, var: { type: 'string', default: 'x' } }, required: ['expr'] } }},
  { type: 'function', function: { name: 'convert_units', description: 'Convert between units: km->mi, kg->lb, C->F, bytes->GB, meters->feet, hours->minutes.', parameters: { type: 'object', properties: { value: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' }, category: { type: 'string', enum: ['length','weight','temperature','data','time','speed'] } }, required: ['value','from','to'] } }},
  // Documents
  { type: 'function', function: { name: 'docx_to_pdf', description: 'Convert Word .docx to PDF using mammoth+pymupdf.', parameters: { type: 'object', properties: { input_path: { type: 'string' }, output_path: { type: 'string' } }, required: ['input_path'] } }},
  { type: 'function', function: { name: 'pdf_to_text', description: 'Extract text from any PDF file.', parameters: { type: 'object', properties: { input_path: { type: 'string' }, max_pages: { type: 'integer', default: 20 } }, required: ['input_path'] } }},
  { type: 'function', function: { name: 'xlsx_to_pdf', description: 'Convert Excel spreadsheet to multi-page PDF.', parameters: { type: 'object', properties: { input_path: { type: 'string' } }, required: ['input_path'] } }},
  { type: 'function', function: { name: 'merge_pdfs', description: 'Merge multiple PDF files into one document.', parameters: { type: 'object', properties: { input_paths: { type: 'array', items: { type: 'string' } }, output_path: { type: 'string' } }, required: ['input_paths'] } }},
  // Web
  { type: 'function', function: { name: 'search_web', description: 'Search the web via DuckDuckGo (Python knowledge_hub). Returns titles, URLs, snippets.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', default: 10 } }, required: ['query'] } }},
  { type: 'function', function: { name: 'scrape_url', description: 'Fetch webpage content as plain text. Strips JS/CSS for clean reading.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } }},
  { type: 'function', function: { name: 'download_file', description: 'Download a file from URL to local results directory.', parameters: { type: 'object', properties: { url: { type: 'string' }, filename: { type: 'string' } }, required: ['url'] } }},
  // Translation
  { type: 'function', function: { name: 'translate', description: 'Translate text to any language (100+ supported) via MyMemory API.', parameters: { type: 'object', properties: { text: { type: 'string' }, target_lang: { type: 'string', description: 'ISO code: es, fr, de, ja, ko, zh, ar, hi, bn, ru' } }, required: ['text','target_lang'] } }},
  // Code Execution
  { type: 'function', function: { name: 'run_python', description: 'Execute arbitrary Python code. Returns stdout. Great for data processing, algorithms, ML experiments.', parameters: { type: 'object', properties: { code: { type: 'string' }, timeout_sec: { type: 'integer', default: 30 } }, required: ['code'] } }},
  { type: 'function', function: { name: 'run_node', description: 'Execute arbitrary Node.js code. Returns stdout.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }},
  { type: 'function', function: { name: 'run_shell', description: 'Execute shell command (git, npm, find, grep, ls, python3, etc). Returns stdout/stderr.', parameters: { type: 'object', properties: { command: { type: 'string' }, timeout_sec: { type: 'integer', default: 30 } }, required: ['command'] } }},
  // File Operations
  { type: 'function', function: { name: 'read_file', description: 'Read file contents. Resolves paths relative to /home/sword/Documents/ automatically.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }},
  { type: 'function', function: { name: 'write_file', description: 'Write content to a file. Creates parent directories automatically.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path','content'] } }},
  { type: 'function', function: { name: 'list_dir', description: 'List files and directories recursively.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean', default: false } }, required: ['path'] } }},
  { type: 'function', function: { name: 'find_files', description: 'Find files matching a glob pattern like "*.py" or "**/*.js".', parameters: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' } }, required: ['root','pattern'] } }},
  { type: 'function', function: { name: 'grep_content', description: 'Search text patterns inside files (like grep -r). Returns file paths + line numbers + matches.', parameters: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' }, extension: { type: 'string', description: 'Filter by extension, e.g. ".js"' } }, required: ['root','pattern'] } }},
];

export async function execute(toolName, args) {
  try {
    // ── Finance ──
    if (toolName === 'get_crypto_price') {
      const r = py('crypto_data', 'fetch_crypto_price', { coin: args.coin || 'bitcoin' });
      if (r.error) {
        const d = await httpGet(`https://api.coingecko.com/api/v3/simple/price?ids=${args.coin}&vs_currencies=usd`);
        if (d.error) return JSON.stringify(d);
        const p = d[args.coin]?.usd;
        return JSON.stringify({ coin: args.coin, price_usd: p, time: new Date().toISOString() });
      }
      return JSON.stringify(r);
    }
    if (toolName === 'get_stock_quote') {
      const r = py('stock_data', 'fetch_stock_price', { company: args.ticker });
      if (r.error) {
        const d = await httpGet(`https://query1.finance.yahoo.com/v8/finance/chart/${args.ticker.toUpperCase()}`);
        if (d.error) return JSON.stringify(d);
        const meta = d?.chart?.result?.[0]?.meta || {};
        const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean);
        return JSON.stringify({ ticker: args.ticker, price: closes?.pop(), prev_close: meta.previousClose, time: new Date().toISOString() });
      }
      return JSON.stringify(r);
    }
    if (toolName === 'get_top_coins') {
      const d = await httpGet('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1');
      if (d.error) return JSON.stringify(d);
      return JSON.stringify({ coins: d.map((c,i) => ({ rank:i+1, name:c.name, symbol:c.symbol, price:c.current_price, change_24h:c.price_change_percentage_24h })) });
    }

    // ── Math ──
    if (toolName === 'calculate') {
      const expr = String(args.expr);
      try {
        const out = execSync(
          `python3 -c "import math; print(${expr.replace(/sqrt/g,'math.sqrt').replace(/log/g,'math.log').replace(/abs/g,'math.abs').replace(/pow/g,'math.pow').replace(/\be\b/g,'math.E')})"`,
          { timeout: 10000, encoding: 'utf-8' }
        );
        return JSON.stringify({ expression: expr, result: out.trim() });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }
    if (toolName === 'solve_math') {
      // Use Python to run sympy
      const varname = args.var || 'x';
      const code = `from sympy import *; ${varname}=symbols('${varname}'); print(${args.op||'simplify'}(${args.expr}))`;
      const tmp = `/tmp/sympy_${Date.now()}.py`;
      writeFileSync(tmp, code);
      try {
        const out = execSync(`python3 "${tmp}"`, { timeout: 15000, encoding: 'utf-8' });
        return JSON.stringify({ expression: args.expr, operation: args.op || 'simplify', variable: varname, result: out.trim() });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }
    if (toolName === 'convert_units') {
      const unitMap = { km:'kilometer', mi:'mile', m:'meter', ft:'foot', in:'inch', cm:'centimeter', mm:'millimeter', kg:'kilogram', lb:'pound', oz:'ounce', g:'gram', C:'celsius', F:'fahrenheit', K:'kelvin', byte:'byte', KB:'kilobyte', MB:'megabyte', GB:'gigabyte', TB:'terabyte', s:'second', min:'minute', hr:'hour', day:'day', week:'week', 'm/s':'meter_per_second', 'km/h':'kilometer_per_hour', mph:'mile_per_hour' };
      const fromNorm = unitMap[args.from] || args.from.toLowerCase();
      const toNorm = unitMap[args.to] || args.to.toLowerCase();
      const r = py('student_tools', 'convert_unit', { value: args.value, from_unit: fromNorm, to_unit: toNorm, category: args.category });
      return JSON.stringify({ from: args.value + ' ' + args.from, to: r.result + ' ' + args.to, category: args.category });
    }

    // ── Documents ──
    if (toolName === 'docx_to_pdf') return py('office_tools', 'docx_to_pdf', { docx_path: args.input_path, pdf_path: args.output_path });
    if (toolName === 'pdf_to_text') return py('office_tools', 'pdf_to_text', { pdf_path: args.input_path, max_pages: args.max_pages });
    if (toolName === 'xlsx_to_pdf') return py('office_tools', 'xlsx_to_pdf', { xlsx_path: args.input_path });
    if (toolName === 'merge_pdfs') return py('office_tools', 'merge_pdfs', { pdf_list: args.input_paths, output_path: args.output_path });

    // ── Web ──
    if (toolName === 'search_web') {
      const r = py('knowledge_hub', 'search_web', { query: args.query, max_results: args.max_results || 10 });
      if (r.result && r.result !== '[]') {
        try {
          const parsed = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
          return JSON.stringify({ query: args.query, results: parsed.slice(0, args.max_results || 10) });
        } catch(_) { return JSON.stringify({ query: args.query, raw: r.result }); }
      }
      return JSON.stringify({ query: args.query, results: [], note: 'Empty results' });
    }
    if (toolName === 'scrape_url') {
      try {
        const html = await (await fetch(args.url, { headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'} })).text();
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,3000);
        return JSON.stringify({ url: args.url, status: 'ok', text_preview: text });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }
    if (toolName === 'download_file') {
      try {
        const res = await fetch(args.url);
        if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
        const buf = Buffer.from(await res.arrayBuffer());
        const fname = args.filename || args.url.split('/').pop() || 'file';
        const dest = `${RESULTS_DIR}/${fname}`;
        writeFileSync(dest, buf);
        return JSON.stringify({ success: true, saved_to: dest, bytes: buf.length });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }

    // ── Translation ──
    if (toolName === 'translate') {
      try {
        const d = await httpGet(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(args.text.slice(0,500))}&langpair=en|${args.target_lang}`);
        if (d.responseStatus === 200) return JSON.stringify({ original: args.text.slice(0,100), translated: d.responseData?.translatedText, from: 'en', to: args.target_lang });
        return JSON.stringify({ error: 'Translation failed' });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }

    // ── Code Execution ──
    if (toolName === 'run_python') {
      const tmp = `/tmp/agent_py_${Date.now()}.py`;
      writeFileSync(tmp, args.code);
      try {
        const out = execSync(`python3 "${tmp}"`, { timeout: (args.timeout_sec||30)*1000, encoding:'utf-8' });
        return JSON.stringify({ success: true, stdout: out.trim().slice(0,5000) });
      } catch(e) {
        return JSON.stringify({ success: false, error: (e.stderr||e.message)?.slice(0,2000), exit_code: e.status });
      }
    }
    if (toolName === 'run_node') {
      const tmp = `/tmp/agent_node_${Date.now()}.js`;
      writeFileSync(tmp, args.code);
      try {
        const out = execSync(`node "${tmp}"`, { timeout: 15000, encoding:'utf-8' });
        return JSON.stringify({ success: true, stdout: out.trim().slice(0,5000) });
      } catch(e) {
        return JSON.stringify({ success: false, error: (e.stderr||e.message)?.slice(0,2000), exit_code: e.status });
      }
    }
    if (toolName === 'run_shell') {
      try {
        const out = execSync(args.command, { timeout: (args.timeout_sec||30)*1000, encoding:'utf-8' });
        return JSON.stringify({ success: true, stdout: out.trim().slice(0,5000) });
      } catch(e) {
        return JSON.stringify({ success: false, error: (e.stderr||e.message)?.slice(0,2000), exit_code: e.status });
      }
    }

    // ── File Ops ──
    if (toolName === 'read_file') {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return JSON.stringify({ error: `File not found: ${p}` });
      const sz = require('fs').statSync(p).size;
      const content = readFileSync(p, 'utf-8');
      return JSON.stringify({ path: p, size: sz, content: content.slice(0, 10000), truncated: sz > 10000 });
    }
    if (toolName === 'write_file') {
      const p = resolvePath(args.path);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, args.content, 'utf-8');
      return JSON.stringify({ success: true, path: p, bytes: Buffer.byteLength(args.content) });
    }
    if (toolName === 'list_dir') {
      const p = resolvePath(args.path);
      if (!existsSync(p)) return JSON.stringify({ error: `Directory not found: ${p}` });
      const entries = [];
      function walk(dir, depth=0) {
        if (depth > 5) return;
        for (const e of readdirSync(dir, {withFileTypes:true})) {
          const full = path.join(dir, e.name);
          entries.push({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', path: full });
          if (e.isDirectory() && args.recursive) walk(full, depth+1);
        }
      }
      walk(p);
      return JSON.stringify({ path: p, count: entries.length, entries: entries.slice(0,200) });
    }
    if (toolName === 'find_files') {
      const p = resolvePath(args.root);
      const results = [];
      const regex = new RegExp(args.pattern.replace(/\*/g,'.*').replace(/\?/g,'.'));
      function walk(dir) {
        for (const e of readdirSync(dir, {withFileTypes:true})) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          if (regex.test(e.name)) results.push(full);
        }
      }
      walk(p);
      return JSON.stringify({ root: p, pattern: args.pattern, count: results.length, files: results.slice(0,50) });
    }
    if (toolName === 'grep_content') {
      const p = resolvePath(args.root);
      const regex = new RegExp(args.pattern, 'i');
      const results = [];
      function walk(dir) {
        for (const e of readdirSync(dir, {withFileTypes:true})) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          if (args.extension && !e.name.endsWith(args.extension)) continue;
          try {
            const lines = readFileSync(full, 'utf-8').split('\n');
            for (let i=0; i<lines.length; i++) {
              if (regex.test(lines[i])) { results.push({ file: full, line: i+1, text: lines[i].trim().slice(0,200) }); if (results.length >= 50) return; }
            }
          } catch(_) {}
        }
      }
      walk(p);
      return JSON.stringify({ root: p, pattern: args.pattern, count: results.length, matches: results });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
