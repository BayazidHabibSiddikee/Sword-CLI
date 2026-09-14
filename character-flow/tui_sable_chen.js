#!/usr/bin/env node
/**
 * TUI for Sable Chen — Pragmatic Full-Stack Engineer (AGENTIC)
 * Can run git commands, analyze logs, generate CI/CD configs, review code.
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fileOps from './skills/shared/file_ops.js';
import * as shell from './skills/shared/shell.js';
import * as sableSkills from './skills/agents/sable.js';

const PROXY = process.env.PROXY_HOST || 'http://localhost:3001';
const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [
  ...sableSkills.TOOL_DEFINITIONS,
  ...fileOps.TOOL_DEFINITIONS,
  ...shell.TOOL_DEFINITIONS,
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
    if (name === 'git_log' || name === 'git_diff' || name === 'analyze_log' ||
        name === 'generate_cicd' || name === 'code_review' || name === 'project_structure') {
      return await sableSkills.execute(name, args);
    }
    if (name === 'read_file' || name === 'write_file' || name === 'edit_file' ||
        name === 'list_dir' || name === 'search_files' || name === 'search_content' || name === 'get_file_info') {
      return fileOps.execute(name, args);
    }
    if (name === 'run_command' || name === 'run_python' || name === 'run_node') {
      return shell.execute(name, args);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e) { return JSON.stringify({ error: e.message }); }
}

const C = { user: chalk.cyan, ai: chalk.hex('#FF6B35'), dim: chalk.gray, accent: chalk.hex('#FF8C42'), error: chalk.red, tool: chalk.hex('#FFD700'), green: chalk.green, warn: chalk.hex('#FFD700') };

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔧  Sable Chen — AGENTIC Engineer    ║'));
  console.log(C.accent('║   Git · Logs · CI/CD · Code Review       ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  Skills loaded: ${ALL_TOOLS.length} tools active\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  const brain = await import(join(ROOT, 'brain', 'sable_chen.js'));
  let msgs = [{ role: 'system', content: brain.SYSTEM_PROMPT }];
  msgs.push({ role: 'user', content: 'Hey, what can you actually do? Show me your capabilities.' });

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Sable> '));
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
    else if (input === '/postmortems') {
      console.log(C.warn('\n💥 Postmortem Cases:\n'));
      for (const p of brain.listPostmortems()) {
        console.log(C.accent(`  ${p.incident} [${p.domain}]`));
      }
      console.log(C.dim('\nAsk me about any incident.\n'));
    }
    else if (input === '/axioms') {
      console.log(C.accent('\n⚙️ Engineering Axioms:\n'));
      brain.ENGINEERING_AXIOMS.forEach((a, i) => console.log(C.dim(`  ${i+1}. ${a}`)));
    }
    else if (input === '/stats') {
      const s = brain.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge entries, ${s.pm} postmortems\n`));
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
          console.log(C.ai(msg?.content || ''));
          msgs.push({ role: 'assistant', content: msg?.content });
          break;
        } catch (e) { console.log(C.error(`  Error: ${e.message}`)); break; }
      }
    }
  }
  rl.close();
}

main().catch(console.error);
