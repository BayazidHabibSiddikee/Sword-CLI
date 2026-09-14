#!/usr/bin/env node
/**
 * TUI for Turing Voss — Logic Puzzle Master & Algorithm Designer
 * AGENTIC: can execute code, solve math, run algorithms, read/write files.
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fileOps from './skills/shared/file_ops.js';
import * as shell from './skills/shared/shell.js';
import * as cryptoStock from './skills/shared/crypto_stock.js';
import * as turingSkills from './brain/turing_voss.js';
import * as turingAgent from './skills/agents/turing.js';

const PROXY = process.env.PROXY_HOST || 'http://localhost:3001';
const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [
  ...turingAgent.TOOL_DEFINITIONS,
  ...fileOps.TOOL_DEFINITIONS,
  ...shell.TOOL_DEFINITIONS,
  ...cryptoStock.TOOL_DEFINITIONS,
];

async function fetchChat(msgs) {
  const r = await fetch(`${PROXY}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'auto', messages: msgs, tools: ALL_TOOLS, stream: false }),
  });
  if (!r.ok) throw new Error(`Proxy ${r.status}`);
  return await r.json();
}

async function execTool(name, args) {
  try {
    if (name === 'judge_solution' || name === 'benchmark_algorithm' || name === 'solve_math' ||
        name === 'generate_problem' || name === 'analyze_complexity') {
      return await turingAgent.execute(name, args);
    }
    if (name === 'read_file' || name === 'write_file' || name === 'edit_file' ||
        name === 'list_dir' || name === 'search_files' || name === 'search_content' || name === 'get_file_info') {
      return fileOps.execute(name, args);
    }
    if (name === 'run_command' || name === 'run_python' || name === 'run_node') {
      return shell.execute(name, args);
    }
    if (name.startsWith('get_')) {
      return cryptoStock.execute(name, args);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) { return JSON.stringify({ error: e.message }); }
}

const C = { user: chalk.cyan, ai: chalk.hex('#7B68EE'), dim: chalk.gray, accent: chalk.hex('#9370DB'), error: chalk.red, tool: chalk.hex('#FFD700'), green: chalk.green };

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔮  Turing Voss — AGENTIC AI         ║'));
  console.log(C.accent('║   Logic · Algorithms · Code Judge        ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  Skills loaded: ${ALL_TOOLS.length} tools active`));
  console.log(C.dim('  Type /tools to see all capabilities\n\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  const brain = await import(join(ROOT, 'brain', 'turing_voss.js'));
  let msgs = [{ role: 'system', content: brain.SYSTEM_PROMPT }];
  msgs.push({ role: 'user', content: 'Hello Turing. Introduce yourself and tell me what you can do.' });

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Turing> '));
    const input = ans.trim().toLowerCase();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/tools' || input === '/skills') {
      console.log(C.dim('\n🔧 Available Skills (' + ALL_TOOLS.length + '):\n'));
      ALL_TOOLS.forEach((t, i) => {
        const fn = t.function;
        console.log(C.accent(`  ${i+1}. ${fn.name}`));
        console.log(C.dim(`     ${fn.description}\n`));
      });
    }
    else if (input === '/puzzles') {
      console.log(C.green('\n🧩 Challenge the AI:\n'));
      for (const p of brain.PUZZLES) {
        console.log(C.dim(`  ${p.title} [${p.difficulty}]`));
        console.log(C.dim(`     ${p.puzzle.slice(0, 80)}...\n`));
      }
    }
    else if (input === '/stats') {
      const s = brain.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge entries, ${s.p} puzzles, ${s.a} axioms\n`));
    }
    else if (input === '/clear') {
      msgs = [{ role: 'system', content: brain.SYSTEM_PROMPT }];
      console.log(C.dim('  Conversation cleared.'));
    }
    else {
      msgs.push({ role: 'user', content: ans });
      let iter = 0;
      while (iter++ < 5) {
        try {
          const result = await fetchChat(msgs);
          const msg = result.choices?.[0]?.message;
          if (msg?.tool_calls) {
            for (const tc of msg.tool_calls) {
              console.log(C.tool(`  ⚡ ${tc.function.name}(...)`));
              const out = await execTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'));
              console.log(C.dim('  → ' + String(out).slice(0, 300)));
              msgs.push({ role: 'tool', tool_call_id: tc.id, content: out });
            }
            continue;
          }
          const reply = msg?.content || '[no response]';
          console.log(C.ai(reply));
          msgs.push({ role: 'assistant', content: reply });
          break;
        } catch (e) { console.log(C.error(`  Error: ${e.message}`)); break; }
      }
    }
  }
  rl.close();
}

main().catch(console.error);
