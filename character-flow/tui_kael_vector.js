#!/usr/bin/env node
/**
 * TUI for Kael Vector — ML Engineer & Model Architect (LangGraph)
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangGraphAgent } from './langgraph-agent.js';
import * as kaelSkills from './brain/kael_vector.js';
import * as kaelAgent from './skills/agents/kael.js';
import * as bridge from './skills/bridge.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [...bridge.TOOL_DEFINITIONS, ...kaelAgent.TOOL_DEFINITIONS];

const C = {
  user: chalk.cyan, ai: chalk.hex('#00FF7F'), dim: chalk.gray,
  accent: chalk.hex('#32CD32'), error: chalk.red, tool: chalk.hex('#FFD700'),
  purple: chalk.hex('#DA70D6'), green: chalk.green,
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🤖  Kael Vector — LangGraph ML Eng.  ║'));
  console.log(C.accent('║   Train · Evaluate · Deploy Models       ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  LangGraph v1.4 | ${ALL_TOOLS.length} tools | Memory: ON`));
  console.log(C.dim('  Type /tools to see all capabilities\n'));

  const agent = new LangGraphAgent({
    systemPrompt: kaelSkills.SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    characterName: 'Kael Vector',
    toolExecutor: async (name, args) => {
      try {
        const r = await kaelAgent.execute(name, args);
        return typeof r === 'string' ? r : JSON.stringify(r);
      } catch (_) {
        return await bridge.execute(name, args);
      }
    },
    threadId: 'kael-lg',
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Kael> '));
    const input = ans.trim();

    if (!input || input === 'exit' || input === 'quit') break;
    else if (input === '/tools' || input === '/skills') {
      console.log(C.dim('\n🔧 Available Skills (' + ALL_TOOLS.length + '):\n'));
      ALL_TOOLS.forEach((t, i) => {
        console.log(C.accent(`  ${i+1}. ${t.function.name}`));
        console.log(C.dim(`     ${t.function.description}\n`));
      });
    }
    else if (input === '/models') {
      console.log(C.purple('\n🏗️ Model Architecture Cards:\n'));
      for (const md of kaelSkills.listModels()) {
        console.log(C.accent(`  ▸ ${md.name}`));
      }
    }
    else if (input === '/quote') {
      console.log(C.purple(`\n"${kaelSkills.generateQuote()}"\n`));
    }
    else if (input === '/stats') {
      const s = kaelSkills.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge, ${s.m} model cards\n`));
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
