#!/usr/bin/env node
/**
 * TUI for Kael Vector — ML Engineer & Model Architect
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
  const m = await import(join(_ROOT, 'brain', 'kael_vector.js'));
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
  ai: chalk.hex('#00FF7F'),
  dim: chalk.gray,
  accent: chalk.hex('#32CD32'),
  error: chalk.red,
  green: chalk.green,
  purple: chalk.hex('#DA70D6'),
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🤖  Kael Vector — ML Architect       ║'));
  console.log(C.accent('║   Distributions · Gradients · Patterns   ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.exit });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  while (true) {
    console.log(C.dim('\n─'.repeat(40)));
    const ans = await ask(C.user('Kael> '));
    const input = ans.trim().toLowerCase();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/models') {
      const m = await loadBrain();
      console.log(C.purple('\n🏗️ Model Architecture Cards:\n'));
      const models = m.listModels();
      models.forEach((md, i) => {
        console.log(C.accent(`  ${i + 1}. ${md.name}`));
      });
      console.log(C.dim('\nType a number to inspect an architecture.'));
      const sel = await ask(C.user('Pick #> '));
      const idx = parseInt(sel) - 1;
      if (!isNaN(idx) && models[idx]) {
        const md = m.getModel(models[idx].name);
        if (md) {
          console.log(C.purple(`\n🏗️ ${md.name}\n`));
          console.log(C.white(`Architecture:\n  ${md.architecture}\n`));
          console.log(C.green(`Strength:\n  ${md.strength}\n`));
          console.log(C.dim(`Weakness:\n  ${md.weakness}\n`));
          console.log(C.accent(`Use case:\n  ${md.use_case}\n`));
        }
      }
    }
    else if (input === '/quote') {
      const m = await loadBrain();
      console.log(C.purple(`\n"${m.generateQuote()}"\n`));
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
      console.log(C.accent(`\n📊 Knowledge base: ${s.k} entries, ${s.m} model cards\n`));
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
