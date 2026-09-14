#!/usr/bin/env node
/**
 * TUI for Sable Chen — Pragmatic Full-Stack Engineer (LangGraph)
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangGraphAgent } from './langgraph-agent.js';
import * as sableSkills from './brain/sable_chen.js';
import * as sableAgent from './skills/agents/sable.js';
import * as bridge from './skills/bridge.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [...bridge.TOOL_DEFINITIONS, ...sableAgent.TOOL_DEFINITIONS];

const C = {
  user: chalk.cyan, ai: chalk.hex('#FF6B35'), dim: chalk.gray,
  accent: chalk.hex('#FF8C42'), error: chalk.red, tool: chalk.hex('#FFD700'),
  green: chalk.green, warn: chalk.hex('#FFD700'),
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔧  Sable Chen — LangGraph Engineer  ║'));
  console.log(C.accent('║   Git · Logs · CI/CD · Code Review       ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  LangGraph v1.4 | ${ALL_TOOLS.length} tools | Memory: ON`));
  console.log(C.dim('  Type /tools to see all capabilities\n'));

  const agent = new LangGraphAgent({
    systemPrompt: sableSkills.SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    characterName: 'Sable Chen',
    toolExecutor: async (name, args) => {
      try {
        const r = await sableAgent.execute(name, args);
        return typeof r === 'string' ? r : JSON.stringify(r);
      } catch (_) {
        return await bridge.execute(name, args);
      }
    },
    threadId: 'sable-lg',
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    const ans = await ask(C.user('Sable> '));
    const input = ans.trim();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/tools' || input === '/skills') {
      console.log(C.dim('\n🔧 Available Skills (' + ALL_TOOLS.length + '):\n'));
      ALL_TOOLS.forEach((t, i) => {
        console.log(C.accent(`  ${i+1}. ${t.function.name}`));
        console.log(C.dim(`     ${t.function.description}\n`));
      });
    }
    else if (input === '/postmortems') {
      console.log(C.warn('\n💥 Postmortem Cases:\n'));
      for (const p of sableSkills.listPostmortems()) {
        console.log(C.accent(`  ${p.incident} [${p.domain}]`));
      }
    }
    else if (input === '/axioms') {
      console.log(C.accent('\n⚙️ Engineering Axioms:\n'));
      sableSkills.ENGINEERING_AXIOMS.forEach((a, i) => console.log(C.dim(`  ${i+1}. ${a}`)));
    }
    else if (input === '/stats') {
      const s = sableSkills.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge, ${s.pm} postmortems\n`));
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
              const tc = String(m.content)?.slice(0, 150); if (!/^─+$/.test(tc)) console.log(C.dim('  ✓ ' + tc));
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
