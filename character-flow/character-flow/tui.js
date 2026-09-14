#!/usr/bin/env node
/**
 * tui.js — Unified Character Flow TUI (Opencode-style)
 * Single interface for ALL characters with selection grid, /model, /team, etc.
 */
import readline from 'readline';
import chalk from 'chalk';
import { LangGraphAgent } from './langgraph-agent.js';
import * as bridge from './skills/bridge.js';

// ── Colors ────────────────────────────────────────────────────────────────────
const yellow   = chalk.hex('#FFD700');
const red      = chalk.hex('#FF4444');
const dim      = chalk.gray;
const cyan     = chalk.cyan;
const green    = chalk.green;
const toolCol  = chalk.hex('#FFD700');
const magenta  = chalk.hex('#FF6BEB');
const white    = chalk.white;
function accent(hex) { return chalk.hex(hex || '#888888'); }
function aiColor(hex) { return chalk.hex(hex || '#00CED1'); }

// ── Character Registry ────────────────────────────────────────────────────────
const CHARACTERS = {
  izuku:  { name: 'Izuku Midoriya', emoji: '🦸', color: '#00CED1', brain: () => import('./brain/izuku.js'),              agentSkills: null, teamRole: 'Philosopher Hero — multi-laws wisdom' },
  mahina: { name: 'Mahina Artemis', emoji: '💜', color: '#DA70D6', brain: () => import('./brain/mahina.js'),             agentSkills: null, teamRole: 'Strategist — manipulation, psychology' },
  muhan:  { name: 'Muhan Haswaz',   emoji: '📊', color: '#FFD700', brain: () => import('./brain/muhan.js'),              agentSkills: null, teamRole: 'Math Professor & Trader — crypto, stocks' },
  plastos:{ name: 'Plastos Jiade',  emoji: '📰', color: '#FF4466', brain: () => import('./brain/plastos.js'),            agentSkills: null, teamRole: 'War Reporter — exposes false claims' },
  monk:   { name: 'Monk Maecenas',  emoji: '🧘', color: '#9370DB', brain: () => import('./brain/monk_maecenas.js'),      agentSkills: null, teamRole: 'Religious Scholar — story-first teaching' },
  rishad: { name: 'Prince Rishad',  emoji: '🎭', color: '#FF6B35', brain: () => import('./brain/prince_rishad.js'),      agentSkills: null, teamRole: 'Comedy Lover — manga & novels' },
  turing: { name: 'Turing Voss',    emoji: '🔮', color: '#7B68EE', brain: () => import('./brain/turing_voss.js'),        agentSkills: () => import('./skills/agents/turing.js'), teamRole: 'Logic Master — algorithms, CP, math' },
  sable:  { name: 'Sable Chen',     emoji: '🔧', color: '#FF6B35', brain: () => import('./brain/sable_chen.js'),         agentSkills: () => import('./skills/agents/sable.js'),  teamRole: 'Pragmatic Engineer — git, CI/CD, code review' },
  ada:    { name: 'Dr. Ada Vance',  emoji: '✨', color: '#00CED1', brain: () => import('./brain/ada_vance.js'),          agentSkills: () => import('./skills/agents/ada.js'),    teamRole: 'Computational Mathematician — symbolic math' },
  kael:   { name: 'Kael Vector',    emoji: '🤖', color: '#00FF7F', brain: () => import('./brain/kael_vector.js'),        agentSkills: () => import('./skills/agents/kael.js'),   teamRole: 'ML Engineer — train models, metrics' },
};

const MODELS = ['agnes-2.5-flash', 'auto'];

// ── State ─────────────────────────────────────────────────────────────────────
let currentChar   = 'izuku';
let currentModel  = 'agnes-2.5-flash';
let teamMode      = false;
let teamMembers   = [];
const agents      = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAgent(charKey) {
  if (agents[charKey]) return agents[charKey];
  const char     = CHARACTERS[charKey];
  const brainMod = await char.brain();
  let allTools   = [...bridge.TOOL_DEFINITIONS];
  if (char.agentSkills) {
    try { const s = await char.agentSkills(); allTools = [...allTools, ...(s.TOOL_DEFINITIONS || [])]; } catch (_) {}
  }
  agents[charKey] = new LangGraphAgent({
    systemPrompt: brainMod.SYSTEM_PROMPT,
    tools: allTools,
    characterName: char.name,
    modelName: currentModel,
    toolExecutor: async (name, args) => {
      if (char.agentSkills) {
        try { const s = await char.agentSkills(); const r = await s.execute(name, args); if (typeof r === 'string') return r; } catch (_) {}
      }
      return await bridge.execute(name, args);
    },
    threadId: `char-${charKey}`,
  });
  return agents[charKey];
}

function getToolCount() {
  const char = CHARACTERS[currentChar];
  let c = bridge.TOOL_DEFINITIONS.length;
  if (char.agentSkills) c += 5;
  return c;
}

// ── Splash Screen ─────────────────────────────────────────────────────────────
function printSplash() {
  const W = 62;
  const pad = (s, n) => s.padEnd(n);
  console.log(yellow('╔' + '═'.repeat(W-2) + '╗'));
  console.log(yellow('║') + pad('  🌀  CHARACTER FLOW', W-4) + yellow('║'));
  console.log(yellow('║') + pad('   Multi-Agent AI System', W-4) + yellow('║'));
  console.log(yellow('╚' + '═'.repeat(W-2) + '╝'));
  console.log('');
  console.log(dim('   Select a character to begin:'));
  console.log(dim('   ' + '─'.repeat(58)));

  const keys = Object.keys(CHARACTERS);
  const cols = 3;
  const rows = Math.ceil(keys.length / cols);
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= keys.length) break;
      const key = keys[idx];
      const char = CHARACTERS[key];
      const isActive = key === currentChar ? green(' ✓') : '   ';
      const label = `${char.emoji} ${key.padEnd(8)}${isActive}`;
      line.push(accent(char.color)(label));
    }
    console.log(dim('   ') + line.join('   '));
  }

  console.log(dim('   ' + '─'.repeat(58)));
  console.log(dim('   Commands: /character /model /team /tools /stats /clear /help /exit'));
  console.log('');
}

function printHeader() {
  const char    = CHARACTERS[currentChar];
  const teamTag = teamMode ? red(' [TEAM]') : '';
  console.log(dim('   ' + '─'.repeat(58)));
  console.log(accent(char.color)(`   ${char.emoji} ${char.name}${teamTag}   |   🤖 ${currentModel.padEnd(18)} | 🔧 ${String(getToolCount()).padEnd(3)} tools | 💾 memory ON`));
  console.log(dim('   ' + '─'.repeat(58)));
}

// ── Command Handler ───────────────────────────────────────────────────────────
async function handleCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1).join(' ');

  if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') return 'EXIT';
  if (cmd === '/clear') { Object.keys(agents).forEach(k => delete agents[k]); console.log(dim('   Conversation cleared.\n')); return null; }

  if (cmd === '/help' || cmd === '/h' || cmd === '/') {
    console.log(dim(`
   📋 Commands:
   /character <name>   Switch character (${Object.keys(CHARACTERS).join(', ')})
   /model <name>       Change LLM model (${MODELS.join('/')}  )
   /team               Toggle team collaboration
   /team list          Show team members
   /team add <char>    Add to team
   /team remove <char> Remove from team
   /tools              List skills for current character
   /stats              Show knowledge base stats
   /history            Show conversation history
   /brain              Show current character info
   /clear              Clear conversation
   /exit               Quit
`));
    return null;
  }

  if (cmd === '/character' || cmd === '/char' || cmd === '/c') {
    const target = (args || '').toLowerCase().replace(/['"]/g, '');
    if (!target) {
      printSplash();
      return null;
    }
    if (!CHARACTERS[target]) { console.log(red(`   Unknown: "${target}". Use /character to see all.`)); return null; }
    currentChar = target;
    delete agents[currentChar];
    const char = CHARACTERS[currentChar];
    console.log(green(`   ✓ Switched to ${char.emoji} ${char.name}\n`));
    return null;
  }

  if (cmd === '/model' || cmd === '/m') {
    const target = (args || '').toLowerCase();
    if (!target) {
      console.log(dim('\n   🤖 Models:\n'));
      for (const m of MODELS) {
        const isActive = m === currentModel ? green(' ✓') : '   ';
        console.log(accent(currentModel === m ? '#FFD700' : '#888')(`   ${m}${isActive}`));
      }
      console.log(dim('\n   Usage: /model <name>\n'));
      return null;
    }
    if (!MODELS.includes(target)) { console.log(red(`   Unknown model: "${target}"`)); return null; }
    currentModel = target;
    Object.keys(agents).forEach(k => delete agents[k]);
    console.log(dim(`   ✓ Model: ${currentModel}\n`));
    return null;
  }

  if (cmd === '/team') {
    if (!args) {
      teamMode = !teamMode;
      if (teamMode && teamMembers.length === 0) teamMembers = [currentChar];
      if (teamMode) { console.log(red('\n   🚨 TEAM MODE ON\n')); console.log(dim('   All characters collaborate. Use /team add/list/remove.\n')); }
      else { teamMembers = []; console.log(dim('\n   Team mode off.\n')); }
      return null;
    }
    const sub = args.toLowerCase();
    if (sub === 'list' || sub === 'ls') {
      console.log(dim('\n   👥 Team:\n'));
      for (const m of teamMembers) { const c = CHARACTERS[m]; console.log(accent(c.color)(`     ${c.emoji} ${m} — ${c.teamRole}`)); }
      if (!teamMembers.length) console.log(dim('     (none)'));
      console.log(dim('\n')); return null;
    }
    if (sub === 'add' && parts[1]) {
      const m = parts[1].toLowerCase();
      if (!CHARACTERS[m]) { console.log(red(`   Unknown: "${m}"`)); return null; }
      if (teamMembers.includes(m)) { console.log(dim(`   ${m} already in team.`)); return null; }
      teamMembers.push(m); console.log(green(`   ✓ Added ${CHARACTERS[m].emoji} ${m}`)); return null;
    }
    if ((sub === 'remove' || sub === 'rm') && parts[1]) {
      const m = parts[1].toLowerCase();
      const idx = teamMembers.indexOf(m);
      if (idx === -1) { console.log(red(`   ${m} not in team.`)); return null; }
      teamMembers.splice(idx, 1); console.log(dim(`   ✓ Removed ${m}`)); return null;
    }
    console.log(dim('   /team toggle | /team list | /team add <char> | /team remove <char>\n'));
    return null;
  }

  if (cmd === '/tools' || cmd === '/skills') {
    const char = CHARACTERS[currentChar];
    const brainMod = await char.brain();
    let tools = [...bridge.TOOL_DEFINITIONS];
    if (char.agentSkills) { try { const s = await char.agentSkills(); tools = [...tools, ...(s.TOOL_DEFINITIONS || [])]; } catch (_) {} }
    console.log(accent(char.color)(`\n   🔧 ${char.name}'s Skills (${tools.length}):\n`));
    tools.forEach((t, i) => { console.log(accent(char.color)(`     ${i+1}. ${t.function.name}`)); console.log(dim(`        ${t.function.description}`)); });
    console.log(dim('\n')); return null;
  }

  if (cmd === '/stats') {
    const char = CHARACTERS[currentChar];
    const brainMod = await char.brain();
    if (typeof brainMod.getStats === 'function') {
      const s = brainMod.getStats();
      console.log(accent(char.color)(`\n   📊 ${char.name}:\n`));
      for (const [k, v] of Object.entries(s)) console.log(dim(`     ${k}: ${v}`));
    }
    console.log(dim('\n')); return null;
  }

  if (cmd === '/history') {
    const agent = await getAgent(currentChar);
    const hist = agent.getHistory();
    const char = CHARACTERS[currentChar];
    console.log(accent(char.color)(`\n   📜 ${char.name}'s History (${hist.length} msgs):\n`));
    for (const m of hist.slice(-15)) {
      const type = m._getType?.() || m.constructor?.name || '?';
      const content = String(m.content)?.slice(0, 100);
      if (type === 'human') console.log(cyan('   You: ') + content);
      else if (type === 'ai') console.log(accent(char.color)('   AI:  ') + content);
      else if (type === 'tool') console.log(dim('   Tool: ') + content);
      else console.log(dim('   ' + content));
    }
    console.log(dim('\n')); return null;
  }

  if (cmd === '/brain' || cmd === '/info') {
    const char = CHARACTERS[currentChar];
    console.log(accent(char.color)(`
   ╔══════════════════════════════════════════╗
   ║  ${char.emoji} ${char.name.padEnd(26)} ║
   ╠══════════════════════════════════════════╣
   ║  Role: ${char.teamRole.padEnd(34)} ║
   ║  Model: ${currentModel.padEnd(36)} ║
   ║  Team: ${(teamMode ? 'ON ('+teamMembers.length+')' : 'OFF').padEnd(32)} ║
   ╚══════════════════════════════════════════╝
`));
    return null;
  }

  if (cmd === '/stream') {
    const userInput = args || input;
    console.log(dim('\n   📡 Streaming...\n'));
    const agent = await getAgent(currentChar);
    let finalText = '';
    for await (const chunk of agent.stream(userInput)) {
      for (const [node, data] of Object.entries(chunk)) {
        if (node === 'llm' && data?.messages) {
          for (const m of data.messages) {
            const content = String(m.content);
            if (content && !/^─+$/.test(content)) { process.stdout.write(aiColor(CHARACTERS[currentChar].color)(content)); finalText += content; }
            if (m.tool_calls) console.log(toolCol('   ⚡ ' + m.tool_calls.map(t => t.name).join(', ')));
          }
        }
        if (node === 'tools' && data?.messages) {
          for (const m of data.messages) {
            const tc = String(m.content)?.slice(0, 150);
            if (tc && !/^─+$/.test(tc)) console.log(dim('   ✓ ' + tc));
          }
        }
      }
    }
    console.log(dim(`\n   Turns: ${finalText ? 1 : 0}\n`));
    return null;
  }

  return input;
}

// ── Team Coordinator ──────────────────────────────────────────────────────────
async function runTeam(userInput) {
  const results = [];
  for (const member of teamMembers) {
    const char = CHARACTERS[member];
    const agent = await getAgent(member);
    console.log(accent(char.color)(`\n   ${char.emoji} ${char.name} is working...`));
    try {
      const r = await agent.run(`${userInput} — Respond as ${char.name}. Focus on your expertise.`);
      results.push({ character: member, response: r.response, turns: r.turns });
      console.log(accent(char.color)(`   → ${r.response.slice(0, 300)}${r.response.length > 300 ? '...' : ''}`));
    } catch (e) { console.log(red(`   ✗ ${member}: ${e.message?.slice(0,100)}`)); }
  }
  const char = CHARACTERS[currentChar];
  console.log(accent(char.color)('\n   📋 Team Summary:'));
  for (const r of results) {
    const c = CHARACTERS[r.character];
    console.log(dim(`   ${c.emoji} ${c.name}: ${r.response.slice(0,200)}${r.response.length > 200 ? '...' : ''}`));
  }
  return results.map(r => `${CHARACTERS[r.character].name}: ${r.response}`).join('\n\n---\n\n');
}

// ── Main Loop ─────────────────────────────────────────────────────────────────
async function main() {
  printSplash();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));
  rl.on('close', () => process.exit(0));

  while (true) {
    printHeader();
    const ans = await ask(cyan(`   [${currentChar.toUpperCase()}]> `)).catch(() => null);
    if (!ans) break;
    const input = ans.trim();
    if (!input) continue;

    if (input.startsWith('/')) {
      const result = await handleCommand(input);
      if (result === 'EXIT') break;
      if (result !== null) {
        if (teamMode && teamMembers.length > 1) {
          await runTeam(result);
          console.log(dim('\n   ' + '─'.repeat(58) + '\n'));
        } else {
          const agent = await getAgent(currentChar);
          const r = await agent.run(result);
          const char = CHARACTERS[currentChar];
          console.log(aiColor(char.color)(r.response));
        }
      }
      continue;
    }

    if (teamMode && teamMembers.length > 1) {
      await runTeam(input);
      console.log(dim('\n   ' + '─'.repeat(58) + '\n'));
    } else {
      const agent = await getAgent(currentChar);
      const r = await agent.run(input);
      const char = CHARACTERS[currentChar];
      console.log(aiColor(char.color)(r.response));
    }
  }
  rl.close();
}

main().catch(console.error);
