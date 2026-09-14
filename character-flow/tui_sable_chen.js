#!/usr/bin/env node
/**
 * TUI for Sable Chen — Pragmatic Full-Stack Engineer
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null;

async function loadBrain() {
  if (_brain) return _brain;
  const m = await import(join(_ROOT, 'brain', 'sable_chen.js'));
  _brain = m;
  return m;
}

async function fetchChat(msgs) {
  const r = await fetch(`${PROXY_HOST}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'auto', messages: msgs, stream: false }),
  });
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || '[no response]';
}

const C = {
  user: chalk.cyan,
  ai: chalk.hex('#FF6B35'),
  dim: chalk.gray,
  accent: chalk.hex('#FF8C42'),
  error: chalk.red,
  green: chalk.green,
  warn: chalk.hex('#FFD700'),
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔧  Sable Chen — Pragmatic Engineer  ║'));
  console.log(C.accent('║   Ship it. Break it. Fix it. Repeat.      ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.exit });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  while (true) {
    console.log(C.dim('\n─'.repeat(40)));
    const ans = await ask(C.user('Sable> '));
    const input = ans.trim().toLowerCase();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/postmortems') {
      const m = await loadBrain();
      const pms = m.listPostmortems();
      console.log(C.warn('\n💥 Postmortem Cases:\n'));
      pms.forEach((p, i) => {
        console.log(C.accent(`  ${i + 1}. ${p.incident} [${p.domain}]`));
      });
      console.log(C.dim('\nType a number to read the full case.'));
      const sel = await ask(C.user('Pick #> '));
      const idx = parseInt(sel) - 1;
      if (!isNaN(idx) && pms[idx]) {
        const pm = m.getPostmortem(pms[idx].id);
        console.log(C.warn(`\n💥 ${pm.incident}\n`));
        console.log(C.white(`Cause: ${pm.cause}\n`));
        console.log(C.green(`Lesson: ${pm.lesson}\n`));
      }
    }
    else if (input === '/axioms') {
      const m = await loadBrain();
      console.log(C.accent('\n⚙️ Engineering Axioms:\n'));
      m.ENGINEERING_AXIOMS.forEach((a, i) => console.log(C.dim(`  ${i + 1}. ${a}`)));
    }
    else if (input.startsWith('/search')) {
      const query = input.slice(7).trim();
      if (!query) { console.log(C.dim('  Usage: /search <topic>')); continue; }
      const m = await loadBrain();
      const results = m.searchKnowledge(query);
      if (results.length === 0) { console.log(C.dim('  No results found.')); continue; }
      console.log(C.accent(`\n🔍 Results for "${query}":\n`));
      results.forEach((r, i) => {
        console.log(C.green(`  ${i + 1}. ${r.title}`));
        console.log(C.dim(`     ${r.content.slice(0, 120)}...`));
      });
    }
    else if (input === '/stats') {
      const m = await loadBrain();
      const s = m.getStats();
      console.log(C.accent(`\n📊 Knowledge base: ${s.k} entries, ${s.pm} postmortems\n`));
    }
    else {
      const m = await loadBrain();
      let msgs = [{ role: 'system', content: m.SYSTEM_PROMPT }];
      msgs.push({ role: 'user', content: ans });
      try {
        const reply = await fetchChat(msgs);
        console.log(C.ai(reply));
      } catch (e) {
        console.log(C.error(`  Connection error: ${e.message}`));
      }
    }
  }
  rl.close();
}

main().catch(console.error);
