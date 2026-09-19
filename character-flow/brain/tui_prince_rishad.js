#!/usr/bin/env node
/**
 * TUI for Prince Rishad Gazi — Addicted comedy lover, manga & novel enthusiast
 */
import inquirer from 'inquirer';
import chalk from 'chalk';
import { SYSTEM_PROMPT, rag, getManga, getNovel, generateQuote } from './brain/prince_rishad.js';

const MODEL = process.env.OPENAI_MODEL || 'auto';
const BASE_URL = process.env.FREELLM_BASE_URL || 'http://localhost:3001';

async function callLLM(messages) {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 2048 }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(no response)';
}

const MANGA_LIST = Object.keys({
  one_piece: 1, attack_on_titan: 2, naruto: 3
});
const NOVEL_LIST = Object.keys({
  notes_underground: 1, kafka_metamorphosis: 2, hitchhikers_guide: 3
});

async function chat(topic = null) {
  let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (topic) messages.push({ role: 'user', content: topic });
  else messages.push({ role: 'user', content: 'Hey man... *lights cigarette* what\'s on your mind tonight?' });

  while (true) {
    console.log(chalk.hex('#FF6B35')('\n🎭 Rishad:'));
    const answer = await callLLM(messages);
    console.log(chalk.white(answer));
    messages.push({ role: 'assistant', content: answer });

    const { action } = await inquirer.prompt([{
      name: 'action', type: "rawlist", message: 'What next?',
      choices: ['💬 Keep talking', '📺 Discuss a manga', '📚 Discuss a novel', '😂 Random observation', '🚬 Take a break (exit)', '💾 Save note to knowledge']
    }]);

    if (action === '🚬 Take a break (exit)') break;
    else if (action === '😂 Random observation') {
      console.log(chalk.hex('#FFD700')('\n' + generateQuote('life')));
      const q = await inquirer.prompt([{ name: 'back', type: 'confirm', message: 'Continue chatting?', default: true }]);
      if (!q.back) break;
    }
    else if (action === '📺 Discuss a manga') {
      const { sel } = await inquirer.prompt([{
        name: 'sel', type: "rawlist", message: 'Which manga?',
        choices: [...MANGA_LIST, '🔙 Back']
      }]);
      if (sel === '🔙 Back') continue;
      const info = getManga(sel.toLowerCase());
      if (info) {
        console.log(chalk.cyan(`\n📺 ${info.title}\n`));
        console.log(chalk.white(info.premise));
        console.log(chalk.hex('#9370DB')('\nRishad\'s take:\n' + info.rishad_take));
        console.log(chalk.yellow('\nThemes: ' + info.themes.join(', ')));
        if (info.characters) {
          console.log(chalk.green('\nCharacters:\n'));
          for (const [name, desc] of Object.entries(info.characters)) {
            console.log(chalk.magenta(`  ${name}: ${desc}`));
          }
        }
      }
      messages.push({ role: 'user', content: `Let's talk about ${sel}. What do you think of it?` });
    }
    else if (action === '📚 Discuss a novel') {
      const { sel } = await inquirer.prompt([{
        name: 'sel', type: "rawlist", message: 'Which novel?',
        choices: [...NOVEL_LIST, '🔙 Back']
      }]);
      if (sel === '🔙 Back') continue;
      const info = getNovel(sel.toLowerCase());
      if (info) {
        console.log(chalk.cyan(`\n📚 ${info.title}\n`));
        console.log(chalk.white(info.premise));
        console.log(chalk.hex('#9370DB')('\nRishad\'s take:\n' + info.rishad_take));
        console.log(chalk.yellow('\nKey insight: ' + info.key_insight));
      }
      messages.push({ role: 'user', content: `Let's discuss ${sel}. What are your thoughts?` });
    }
    else if (action === '💾 Save note to knowledge') {
      const { note } = await inquirer.prompt([{ name: 'note', type: 'input', message: 'Your reflection:' }]);
      rag.insertKnowledge('personal', 'Rishad note', note);
      console.log(chalk.green('\n✅ Note saved to knowledge base.'));
    }
    else messages.push({ role: 'user', content: 'Tell me more about that.' });
  }
}

async function main() {
  console.log(chalk.hex('#FF6B35')('╔══════════════════════════════════════════╗'));
  console.log(chalk.hex('#FF6B35')('║     🎭  Prince Rishad Gazi              ║'));
  console.log(chalk.hex('#FF6B35')('║  Addicted to alcohol, cigarettes & good ║'));
  console.log(chalk.hex('#FF6B35')('║  stories. Let\'s talk about manga & novels.║'));
  console.log(chalk.hex('#FF6B35')('╚══════════════════════════════════════════╝\n'));

  const { mode } = await inquirer.prompt([{
    name: 'mode', type: "rawlist", message: 'What kind of night is this?',
    choices: ['💬 Just chilling, let\'s talk', '📺 Dive into a manga discussion', '📚 Read a novel together', '📊 Check knowledge stats']
  }]);

  if (mode === '📊 Check knowledge stats') {
    const s = rag.getStats();
    console.log(chalk.cyan(`\n📊 Knowledge base: ${s.k} entries, ${s.q} quotes\n`));
    return;
  }
  else if (mode === '📺 Dive into a manga discussion') {
    const { sel } = await inquirer.prompt([{
      name: 'sel', type: "rawlist", message: 'Pick a manga:',
      choices: MANGA_LIST
    }]);
    const info = getManga(sel.toLowerCase());
    if (info) {
      console.log(chalk.cyan(`\n📺 ${info.title}\n`));
      console.log(chalk.white(info.premise));
      console.log(chalk.hex('#9370DB')('\nRishad\'s take:\n' + info.rishad_take));
    }
    console.log('\n');
  }
  else if (mode === '📚 Read a novel together') {
    const { sel } = await inquirer.prompt([{
      name: 'sel', type: "rawlist", message: 'Pick a novel:',
      choices: NOVEL_LIST
    }]);
    const info = getNovel(sel.toLowerCase());
    if (info) {
      console.log(chalk.cyan(`\n📚 ${info.title}\n`));
      console.log(chalk.white(info.premise));
      console.log(chalk.hex('#9370DB')('\nRishad\'s take:\n' + info.rishad_take));
    }
    console.log('\n');
  }

  await chat(mode === '💬 Just chilling, let\'s talk' ? null : null);
}

main().catch(console.error);
