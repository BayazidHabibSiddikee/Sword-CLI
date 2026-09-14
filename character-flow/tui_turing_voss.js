#!/usr/bin/env node
/**
 * TUI for Turing Voss — Logic Puzzle Master & Algorithm Designer
 */
import readline from 'readline';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROXY_HOST = process.env.PROXY_HOST || 'http://localhost:3001';
const _ROOT = dirname(fileURLToPath(import.meta.url));
let _brain = null;

async function loadBrain() {
  if (_brain) return _brain;
  const m = await import(join(_ROOT, 'brain', 'turing_voss.js'));
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
  ai: chalk.hex('#7B68EE'),
  dim: chalk.gray,
  accent: chalk.hex('#9370DB'),
  error: chalk.red,
  green: chalk.green,
  puzzle: chalk.hex('#DDA0DD'),
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔮  Turing Voss — Logic & Algos      ║'));
  console.log(C.accent('║   First principles • Puzzle frames       ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.exit });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  while (true) {
    console.log(C.dim('\n─'.repeat(40)));
    const ans = await ask(C.user('Turing> '));
    const input = ans.trim().toLowerCase();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/puzzles') {
      const m = await loadBrain();
      const puzzles = m.listPuzzles();
      console.log(C.puzzle('\n🧩 Available Puzzles:\n'));
      puzzles.forEach((p, i) => {
        console.log(C.accent(`  ${i + 1}. ${p.title} [${p.difficulty}]`));
        console.log(C.dim(`     Concept: ${p.concept}`));
      });
      console.log(C.dim('\nType a number to attempt a puzzle.'));
      const sel = await ask(C.user('Pick #> '));
      const idx = parseInt(sel) - 1;
      if (!isNaN(idx) && puzzles[idx]) {
        const p = m.getPuzzle(puzzles[idx].id);
        console.log(C.puzzle(`\n🧩 ${p.title}\n`));
        console.log(C.white(p.puzzle));
        const reveal = await ask(C.dim('\nReveal solution? (yes/no) '));
        if (reveal.toLowerCase().startsWith('y')) {
          console.log(C.green(`\n✦ Solution:\n${p.solution}\n`));
        }
      }
    }
    else if (input === '/axioms') {
      const m = await loadBrain();
      const axioms = m.getAxioms();
      console.log(C.accent('\n📐 Axioms & Foundations:\n'));
      axioms.forEach((a) => console.log(C.dim(`  ▸ [${a.domain}] ${a.text}`)));
      if (axioms.length === 0) console.log(C.dim('  No custom axioms yet. Start reasoning to build them.'));
    }
    else if (input.startsWith('/search')) {
      const query = input.slice(7).trim();
      if (!query) { console.log(C.dim('  Usage: /search <topic>')); continue; }
      const m = await loadBrain();
      const results = m.searchKnowledge(query);
      if (results.length === 0) { console.log(C.dim('  No results found. Try a different term.')); continue; }
      console.log(C.accent(`\n🔍 Results for "${query}":\n`));
      results.forEach((r, i) => {
        console.log(C.green(`  ${i + 1}. ${r.title}`));
        console.log(C.dim(`     ${r.content.slice(0, 120)}...`));
      });
    }
    else if (input === '/stats') {
      const m = await loadBrain();
      const s = m.getStats();
      console.log(C.accent(`\n📊 Knowledge base: ${s.k} entries, ${s.p} puzzles, ${s.a} axioms\n`));
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
