#!/usr/bin/env node
/**
 * tui.js — Unified Character Flow TUI (Opencode-style replacement)
 * Features: persistent sessions, auto-discovered skills, git ops, file editing, task tracking
 */
import readline from 'readline';
import chalk from 'chalk';
import { LangGraphAgent } from './langgraph-agent.js';
import * as bridge from './skills/bridge.js';
import * as gitSkill from './skills/git.js';
import * as fileEditSkill from './skills/file_edit.js';
import * as tasksSkill from './skills/tasks.js';
import { sessions } from './skills/sessions.js';

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
const TOOL_COLORS = {
  git: chalk.hex('#E06C75'),
  file: chalk.hex('#98C379'),
  bridge: chalk.hex('#61AFEF'),
  task: chalk.hex('#C678DD'),
};

// ── Skill Registry (auto-discover from skills/*.js) ──────────────────────────
const SKILL_MODULES = [
  { name: 'git', import: () => import('./skills/git.js') },
  { name: 'file_edit', import: () => import('./skills/file_edit.js') },
  { name: 'tasks', import: () => import('./skills/tasks.js') },
];

let skillRegistry = {};
async function discoverSkills() {
  for (const mod of SKILL_MODULES) {
    try {
      const m = await mod.import();
      if (m.TOOL_DEFINITIONS && m.execute) {
        skillRegistry[mod.name] = m;
      }
    } catch (_) {}
  }
}

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
const commandHistory = [];
let historyIndex  = -1;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAgent(charKey) {
  if (agents[charKey]) return agents[charKey];
  const char     = CHARACTERS[charKey];
  const brainMod = await char.brain();
  // Collect all tool definitions from bridge + registered skills
  let allTools   = [...bridge.TOOL_DEFINITIONS];
  if (char.agentSkills) {
    try { const s = await char.agentSkills(); allTools = [...allTools, ...(s.TOOL_DEFINITIONS || [])]; } catch (_) {}
  }
  // Merge skill tools (git, file_edit, tasks)
  for (const [skillName, skillMod] of Object.entries(skillRegistry)) {
    if (skillMod.TOOL_DEFINITIONS) {
      allTools = [...allTools, ...skillMod.TOOL_DEFINITIONS];
    }
  }

  // Build session context
  const session = sessions.load(charKey);
  const sessionContext = session.conversation.length > 0
    ? `\n\n## SESSION CONTEXT (previous conversation summary):\n${sessions.summarize(charKey, 1500)}\n---\nContinue the conversation naturally.`
    : '';

  agents[charKey] = new LangGraphAgent({
    systemPrompt: brainMod.SYSTEM_PROMPT + sessionContext,
    tools: allTools,
    characterName: char.name,
    modelName: currentModel,
    toolExecutor: async (name, args) => {
      // Route to appropriate executor based on tool name prefix
      if (skillRegistry.git && name.startsWith('git_')) {
        return await skillRegistry.git.execute(name, args);
      }
      if (skillRegistry.file_edit && name.startsWith('search_replace') || name.startsWith('insert_') || name.startsWith('append_file') || name.startsWith('replace_block') || name.startsWith('create_dir') || name.startsWith('delete_file') || name.startsWith('grep_search') || name.startsWith('count_lines')) {
        return await fileEditSkill.execute(name, args);
      }
      if (skillRegistry.tasks && name.startsWith('add_task') || name.startsWith('list_tasks') || name.startsWith('update_task') || name.startsWith('delete_task') || name.startsWith('stats_tasks')) {
        return await tasksSkill.execute(name, args);
      }
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
  for (const mod of Object.values(skillRegistry)) c += (mod.TOOL_DEFINITIONS?.length || 0);
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
  console.log(dim('   Commands: /character /model /team /tools /skills /tasks /stats /session /clear /help /exit'));
  console.log('');
}

function printHeader() {
  const char    = CHARACTERS[currentChar];
  const teamTag = teamMode ? red(' [TEAM]') : '';
  const sessionInfo = sessions.load(currentChar).message_count > 0
    ? ` | 💬 ${sessions.load(currentChar).message_count} msgs`
    : '';
  console.log(dim('   ' + '─'.repeat(58)));
  console.log(accent(char.color)(`   ${char.emoji} ${char.name}${teamTag}   |   🤖 ${currentModel.padEnd(18)} | 🔧 ${String(getToolCount()).padEnd(3)} tools | 💾 memory ON${sessionInfo}`));
  console.log(dim('   ' + '─'.repeat(58)));
}

// ── Command Handler ───────────────────────────────────────────────────────────
async function handleCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1).join(' ');

  if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') return 'EXIT';
  if (cmd === '/clear') {
    Object.keys(agents).forEach(k => delete agents[k]);
    sessions.clear(currentChar);
    console.log(dim('   Conversation cleared.\n'));
    return null;
  }

  if (cmd === '/help' || cmd === '/h' || cmd === '/') {
    console.log(dim(`
   📋 Commands:
   /character <name>   Switch character (${Object.keys(CHARACTERS).join(', ')})
   /model <name>       Change LLM model (${MODELS.join('/')}  )
   /team               Toggle team collaboration
   /team list          Show team members
   /team add <char>    Add to team
   /team remove <char> Remove from team
   /tools              List all available skills/tools
   /skills             Show skill registry status
   /tasks              Manage todos and subtasks
   /stats              Show knowledge base stats
   /history            Show conversation history
   /session            Session info (persisted across restarts)
   /brain              Show current character info
   /clear              Clear conversation
   /exit               Quit
   ↑↓                  Navigate command history
`));
    return null;
  }

  if (cmd === '/character' || cmd === '/char' || cmd === '/c') {
    const target = (args || '').toLowerCase().replace(/['"]/g, '');
    if (!target) { printSplash(); return null; }
    if (!CHARACTERS[target]) { console.log(red(`   Unknown: "${target}". Use /character to see all.`)); return null; }
    currentChar = target;
    delete agents[currentChar];
    const char = CHARACTERS[currentChar];
    const session = sessions.load(currentChar);
    const resumeMsg = session.message_count > 0
      ? ` (resuming ${session.message_count} messages)`
      : '';
    console.log(green(`   ✓ Switched to ${char.emoji} ${char.name}${resumeMsg}\n`));
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
    let tools = [...bridge.TOOL_DEFINITIONS];
    if (char.agentSkills) { try { const s = await char.agentSkills(); tools = [...tools, ...(s.TOOL_DEFINITIONS || [])]; } catch (_) {} }
    for (const [skName, skMod] of Object.entries(skillRegistry)) {
      if (skMod.TOOL_DEFINITIONS) tools = [...tools, ...skMod.TOOL_DEFINITIONS.map(t => ({...t, _skill: skName}))];
    }
    console.log(accent(char.color)(`\n   🔧 ${char.name}'s Skills (${tools.length}):\n`));
    // Group by skill source
    const bySkill = {};
    for (const t of tools) {
      const sk = t._skill || 'bridge';
      if (!bySkill[sk]) bySkill[sk] = [];
      bySkill[sk].push(t);
    }
    for (const [sk, toks] of Object.entries(bySkill)) {
      console.log(dim(`   ── ${sk.toUpperCase()} (${toks.length} tools) ──`));
      toks.forEach((t, i) => {
        console.log(accent(char.color)(`     ${(toks.indexOf(t)+1) + Object.keys(bySkill).slice(0,Object.keys(bySkill).indexOf(sk)).reduce((a,b)=>a+bySkill[b].length,0)}. ${t.function.name}`));
        console.log(dim(`        ${t.function.description}`));
      });
      console.log('');
    }
    return null;
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
    const session = sessions.load(currentChar);
    const char = CHARACTERS[currentChar];
    console.log(accent(char.color)(`\n   📜 ${char.name}'s History (${session.message_count} msgs):\n`));
    for (const m of session.conversation.slice(-20)) {
      const prefix = m.type === 'human' ? cyan('   You: ') : accent(char.color)('   AI:  ');
      console.log(prefix + String(m.content)?.slice(0, 120));
    }
    console.log(dim('\n')); return null;
  }

  if (cmd === '/session') {
    const session = sessions.load(currentChar);
    const char = CHARACTERS[currentChar];
    console.log(accent(char.color)(`
   💾 Session: ${char.name}
   ─────────────────────────────────────
   Messages:      ${session.message_count}
   Created:       ${new Date(session.created_at).toLocaleString()}
   Last active:   ${session.last_interaction ? new Date(session.last_interaction).toLocaleString() : 'never'}
   Persisted:     ${require('fs').existsSync(require('path').join('./data/sessions', `${currentChar}.json`)) ? 'yes' : 'no'}
   ─────────────────────────────────────
`));
    return null;
  }

  if (cmd === '/tasks') {
    const sub = args.toLowerCase();
    if (!sub) {
      console.log(dim('   Task commands:\n'));
      console.log(dim('   /tasks add <title> [--priority high] [--tag feature]'));
      console.log(dim('   /tasks list [--status pending|in_progress|completed]'));
      console.log(dim('   /tasks done <id>'));
      console.log(dim('   /tasks stats'));
      console.log(dim('\n')); return null;
    }
    if (sub === 'add' && parts[1]) {
      const title = parts.slice(1).join(' ');
      const r = await tasksSkill.execute('add_task', { title, tag: 'tui', priority: 'medium' });
      const parsed = JSON.parse(r);
      if (parsed.success) console.log(green(`   ✓ Task created: #${parsed.id} — ${parsed.title}`));
      else console.log(red(`   ✗ ${parsed.error}`));
      return null;
    }
    if (sub === 'list' || sub === 'ls') {
      const statusFilter = parts.find(p => p.startsWith('--status='))?.split('=')[1];
      const r = await tasksSkill.execute('list_tasks', { status: statusFilter || undefined });
      const parsed = JSON.parse(r);
      console.log(dim(`\n   📋 Tasks${statusFilter ? ` (${statusFilter})` : ''}:\n`));
      for (const t of parsed.tasks || []) {
        const priorityColor = t.priority === 'critical' ? red : t.priority === 'high' ? chalk.hex('#FF6B35') : t.priority === 'medium' ? yellow : dim;
        console.log(`${priorityColor(`[${t.priority}]`)} #${t.id} ${t.title}${t.status === 'completed' ? green(' ✓') : ''}`);
      }
      if (!parsed.tasks?.length) console.log(dim('   (no tasks)'));
      console.log(dim('\n')); return null;
    }
    if (sub === 'done' && parts[1]) {
      const id = parseInt(parts[1]);
      const r = await tasksSkill.execute('update_task', { id, status: 'completed' });
      const parsed = JSON.parse(r);
      console.log(parsed.success ? green(`   ✓ Task #${id} completed`) : red(`   ✗ ${parsed.error}`));
      return null;
    }
    if (sub === 'stats') {
      const r = await tasksSkill.execute('stats_tasks', {});
      const parsed = JSON.parse(r);
      console.log(accent(yellow)(`\n   📊 Task Stats:\n`));
      console.log(dim(`   Total: ${parsed.total}  Completed: ${parsed.by_status.completed || 0}  In-progress: ${parsed.by_status.in_progress || 0}  Pending: ${parsed.by_status.pending || 0}`));
      if (parsed.recent?.length) {
        console.log(dim('\n   Recent:'));
        for (const t of parsed.recent) console.log(dim(`     • ${t.title} [${t.status}]`));
      }
      console.log(dim('\n')); return null;
    }
    console.log(dim('   /tasks add <title> | /tasks list | /tasks done <id> | /tasks stats\n'));
    return null;
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
    ║  Skills: ${getToolCount().toString().padEnd(34)} ║
    ╚══════════════════════════════════════════╝
`));
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
      console.log(aiColor(char.color)(`   → ${r.response.slice(0, 300)}${r.response.length > 300 ? '...' : ''}`));
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
  // Discover skills on startup
  await discoverSkills();
  console.log(dim(`   🔌 Loaded ${Object.keys(skillRegistry).length} skill modules: ${Object.keys(skillRegistry).join(', ')}`));
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

    // Save to command history
    commandHistory.push(input);
    historyIndex = commandHistory.length;

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
          sessions.persist(currentChar, result, r);
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
      sessions.persist(currentChar, input, r);
      const char = CHARACTERS[currentChar];
      console.log(aiColor(char.color)(r.response));
    }
  }
  rl.close();
}

main().catch(console.error);
