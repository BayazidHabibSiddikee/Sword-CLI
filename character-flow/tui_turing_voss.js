#!/usr/bin/env node
/**
 * TUI for Turing Voss — Logic Puzzle Master & Algorithm Designer
 * Powered by LangGraph with real tool execution.
 */
import readline from 'readline';
import chalk from 'chalk';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LangGraphAgent } from './langgraph-agent.js';
import * as turingSkills from './brain/turing_voss.js';
import * as turingAgent from './skills/agents/turing.js';
import * as bridge from './skills/bridge.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ALL_TOOLS = [...bridge.TOOL_DEFINITIONS, ...turingAgent.TOOL_DEFINITIONS];

const C = {
  user: chalk.cyan, ai: chalk.hex('#7B68EE'), dim: chalk.gray,
  accent: chalk.hex('#9370DB'), error: chalk.red, tool: chalk.hex('#FFD700'), green: chalk.green,
};

async function main() {
  console.log(C.accent('╔══════════════════════════════════════════╗'));
  console.log(C.accent('║     🔮  Turing Voss — LangGraph Agent    ║'));
  console.log(C.accent('║   Logic · Algorithms · Code Judge        ║'));
  console.log(C.accent('╚══════════════════════════════════════════╝\n'));
  console.log(C.dim(`  LangGraph v1.4 | ${ALL_TOOLS.length} tools | Memory: ON`));
  console.log(C.dim('  Type /tools to see all capabilities\n'));

  const agent = new LangGraphAgent({
    systemPrompt: turingSkills.SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    characterName: 'Turing Voss',
    toolExecutor: async (name, args) => {
      // Try agent-specific first, then bridge
      try {
        const r = await turingAgent.execute(name, args);
        return typeof r === 'string' ? r : JSON.stringify(r);
      } catch (_) {
        return await bridge.execute(name, args);
      }
    },
    threadId: 'turing-lg',
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    console.log(C.dim('\n─'.repeat(45)));
    const ans = await ask(C.user('Turing> '));
    const input = ans.trim();

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
      for (const p of turingSkills.PUZZLES) {
        console.log(C.dim(`  ${p.title} [${p.difficulty}]`));
        console.log(C.dim(`     ${p.puzzle.slice(0, 80)}...\n`));
      }
    }
    else if (input === '/stats') {
      const s = turingSkills.getStats();
      console.log(C.accent(`\n📊 ${s.k} knowledge, ${s.p} puzzles, ${s.a} axioms\n`));
    }
    else if (input === '/clear') {
      agent.clear();
      console.log(C.dim('  Conversation cleared.'));
    }
    else if (input.startsWith('/stream')) {
      // Stream mode: show real-time chunks
      console.log(C.dim('\n📡 Streaming...\n'));
      let finalText = '';
      for await (const chunk of agent.stream(input.slice(7).trim() || input)) {
        const nodes = Object.keys(chunk);
        for (const node of nodes) {
          const data = chunk[node];
          if (node === 'llm' && data?.messages) {
            for (const m of data.messages) {
              if (m.content) {
                process.stdout.write(C.ai(m.content));
                finalText += m.content;
              }
              if (m.tool_calls) {
                console.log(C.tool('  ⚡ ' + m.tool_calls.map(t => t.name).join(', ')));
              }
            }
          }
          if (node === 'tools' && data?.messages) {
            for (const m of data.messages) {
              console.log(C.dim('  ✓ ' + String(m.content)?.slice(0, 150)));
            }
          }
        }
      }
      console.log(C.dim('\n  Turns: ' + (finalText ? 1 : 0)));
    }
    else {
      // Normal run mode
      const r = await agent.run(input);
      console.log(C.ai(r.response));
    }
  }
  rl.close();
}

main().catch(console.error);
