#!/usr/bin/env node
/**
 * TUI for Dr. Ada Vance — Computational Mathematician (LangGraph)
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangGraphAgent } from './langgraph-agent.js';
import * as adaSkills from './brain/ada_vance.js';
import * as adaAgent from './skills/agents/ada.js';
import * as bridge from './skills/bridge.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [...bridge.TOOL_DEFINITIONS, ...adaAgent.TOOL_DEFINITIONS];

const C = {
  user: chalk.cyan, ai: chalk.hex('#00CED1'), dim: chalk.gray,
  accent: chalk.hex('#20B2AA'), error: chalk.red, tool: chalk.hex('#FFD700'),
  gold: chalk.hex('#FFD700'), green: chalk.green,
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     ✨  Dr. Ada Vance — LangGraph Math   ║'));
  console.log(C.accent('║   Symbolic Compute · LaTeX · Proofs      ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  LangGraph v1.4 | ${ALL_TOOLS.length} tools | Memory: ON`));
  console.log(C.dim('  Type /tools to see all capabilities\n'));

  const agent = new LangGraphAgent({
    systemPrompt: adaSkills.SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    characterName: 'Dr. Ada Vance',
    toolExecutor: async (name, args) => {
      try {
        const r = await adaAgent.execute(name, args);
        return typeof r === 'string' ? r : JSON.stringify(r);
      } catch (_) {
        return await bridge.execute(name, args);
      }
    },
    threadId: 'ada-lg',
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Ada> '));
    const input = ans.trim();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/tools' || input === '/skills') {
      console.log(C.dim('\n🔧 Available Skills (' + ALL_TOOLS.length + '):\n'));
      ALL_TOOLS.forEach((t, i) => {
        console.log(C.accent(`  ${i+1}. ${t.function.name}`));
        console.log(C.dim(`     ${t.function.description}\n`));
      });
    }
    else if (input === '/theorems') {
      console.log(C.gold('\n📐 Theorems of Beauty:\n'));
      for (const t of adaSkills.listTheorems()) {
        console.log(C.accent(`  ▸ ${t.name}`));
        console.log(C.dim(`     "${t.intuition.slice(0, 80)}..."`));
      }
    }
    else if (input === '/quote') {
      console.log(C.gold(`\n"${adaSkills.generateQuote()}"\n`));
    }
    else if (input === '/stats') {
      const s = adaSkills.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge, ${s.t} theorems\n`));
    }
    else if (input === '/clear') {
      agent.clear();
      console.log(C.dim('  Conversation cleared.'));
    }
    else if (input.startsWith('/stream')) {
      console.log(C.dim('\n📡 Streaming...\n'));
      for await (const chunk of agent.stream(input.slice(7).trim() || input)) {
        for (const [node, data] of Object.entries(chunk)) {
          if (node === 'llm' && data?.messages) {
            for (const m of data.messages) {
              if (m.content) process.stdout.write(C.ai(m.content));
              if (m.tool_calls) console.log(C.tool('  ⚡ ' + m.tool_calls.map(t=>t.name).join(', ')));
            }
          }
          if (node === 'tools' && data?.messages) {
            for (const m of data.messages) {
              console.log(C.dim('  ✓ ' + String(m.content)?.slice(0, 150)));
            }
          }
        }
      }
    }
    else {
      const r = await agent.run(input);
      console.log(C.ai(r.response));
    }
  }
  rl.close();
}

main().catch(console.error);
