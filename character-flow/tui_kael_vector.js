#!/usr/bin/env node
/**
 * TUI for Kael Vector — ML Engineer & Model Architect (AGENTIC)
 * Can train models, calculate metrics, preprocess data, compare architectures.
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as fileOps from './skills/shared/file_ops.js';
import * as shell from './skills/shared/shell.js';
import * as kaelSkills from './skills/agents/kael.js';
import * as bridge from './skills/bridge.js';

const PROXY = process.env.PROXY_HOST || 'http://localhost:3001';
const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [
  ...bridge.TOOL_DEFINITIONS,
  ...kaelSkills.TOOL_DEFINITIONS,
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
    // Delegate shared real tools to bridge
    const sharedTools = new Set(['get_crypto_price','get_stock_quote','get_top_coins','calculate','solve_math','convert_units','docx_to_pdf','pdf_to_text','xlsx_to_pdf','merge_pdfs','search_web','scrape_url','download_file','translate','run_python','run_node','run_shell','read_file','write_file','list_dir','find_files','grep_content']);
    if (sharedTools.has(name)) return await bridge.execute(name, args);
    if (name === 'train_model_script' || name === 'calculate_metrics' ||
        name === 'preprocess_data' || name === 'analyze_dataset' || name === 'compare_architectures') {
      return await kaelSkills.execute(name, args);
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

const C = { user: chalk.cyan, ai: chalk.hex('#00FF7F'), dim: chalk.gray, accent: chalk.hex('#32CD32'), error: chalk.red, tool: chalk.hex('#FFD700'), purple: chalk.hex('#DA70D6'), green: chalk.green };

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🤖  Kael Vector — AGENTIC ML Eng.    ║'));
  console.log(C.accent('║   Train · Evaluate · Deploy Models       ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  Skills loaded: ${ALL_TOOLS.length} tools active\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  const brain = await import(join(ROOT, 'brain', 'kael_vector.js'));
  let msgs = [{ role: 'system', content: brain.SYSTEM_PROMPT }];
  msgs.push({ role: 'user', content: 'Hello Kael. Walk me through your engineering capabilities — what can you build or analyze?' });

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Kael> '));
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
    else if (input === '/models') {
      console.log(C.purple('\n🏗️ Model Architecture Cards:\n'));
      for (const md of brain.listModels()) {
        console.log(C.accent(`  ▸ ${md.name}`));
      }
      console.log(C.dim('\nAsk me to compare or explain any architecture.\n'));
    }
    else if (input === '/quote') {
      console.log(C.purple(`\n"${brain.generateQuote()}"\n`));
    }
    else if (input === '/stats') {
      const s = brain.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge entries, ${s.m} model cards\n`));
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
