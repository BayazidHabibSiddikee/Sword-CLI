#!/usr/bin/env node
/**
 * TUI for Monk Maecenas — Buddhist-Christian religious scholar
 */
import inquirer from 'inquirer';
import chalk from 'chalk';
import { SYSTEM_PROMPT, searchKnowledge, getStory, listTopics, getQuote, getStats } from './brain/monk_maecenas.js';

const MODEL = process.env.OPENAI_MODEL || 'agnes-2.5-flash';
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

async function chat(topic = null) {
  let messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (topic) messages.push({ role: 'user', content: `Begin our study with topic: ${topic}` });
  else messages.push({ role: 'user', content: 'Guru, I come seeking understanding. Where shall we begin today?' });

  while (true) {
    console.log(chalk.magenta('\n🧘 Monk Maecenas:'));
    const answer = await callLLM(messages);
    console.log(chalk.cyan(answer));
    messages.push({ role: 'assistant', content: answer });

    const { action } = await inquirer.prompt([{
      name: 'action', type: 'rawlist', message: 'What next?',
      choices: ['💬 Continue conversation', '📖 Study a new chapter', '💭 Reflection quote', '📚 Explore religions', '👋 Exit']
    }]);

    if (action === '👋 Exit') break;
    else if (action === '💭 Reflection quote') {
      console.log(chalk.yellow('\n" ' + getQuote('universal') + ' "\n'));
      const q = await inquirer.prompt([{ name: 'back', type: 'confirm', message: 'Return to chat?', default: true }]);
      if (!q.back) break;
    }
    else if (action === '📚 Explore religions') {
      console.log(chalk.cyan('\nAvailable traditions and chapters:'));
      for (const t of listTopics()) console.log(`  • [${t.religion}] ${t.title}`);
      const { sel } = await inquirer.prompt([{ name: 'sel', type: 'input', message: 'Pick one (e.g. buddhism.dhammapada_1):' }]);
      const [rel, key] = sel.split('.');
      const story = getStory(rel, key);
      if (story) {
        console.log(chalk.green(`\n📜 ${story.title}\n`));
        console.log(chalk.white(story.story));
        console.log(chalk.blue('\n🔗 Analogy: ' + story.analogy));
        if (story.cross_reference) console.log(chalk.magenta('\n🌍 Cross-reference: ' + story.cross_reference));
        console.log(chalk.yellow('\n💭 Reflect: ' + story.reflection));
      }
      messages.push({ role: 'user', content: `I just read about "${story?.title || sel}". What do you make of it?` });
    }
    else if (action === '📖 Study a new chapter') {
      const topics = listTopics();
      const { chosen } = await inquirer.prompt([{
        name: 'chosen', type: 'rawlist', message: 'Choose a chapter:',
        choices: topics.map(t => `${t.title} (${t.religion})`)
      }]);
      const key = topics.find(t => t.title === chosen.split(' (')[0])?.key;
      const rel = topics.find(t => t.key === key)?.religion;
      if (key && rel) {
        const story = getStory(rel, key);
        messages.push({ role: 'user', content: `Teach me: ${story?.title || key}` });
      }
    }
    else messages.push({ role: 'user', content: 'Tell me more.' });
  }
}

async function main() {
  console.log(chalk.magenta('╔══════════════════════════════════════════╗'));
  console.log(chalk.magenta('║     🧘  Monk Maecenas — Wisdom Guide     ║'));
  console.log(chalk.magenta('║  Buddhist-Christian Syncretic Scholar   ║'));
  console.log(chalk.magenta('║   Story-first • Chapter-by-chapter       ║'));
  console.log(chalk.magenta('╚══════════════════════════════════════════╝\n'));

  const { mode } = await inquirer.prompt([{
    name: 'mode', type: 'rawlist', message: 'How would you like to begin?',
    choices: ['💬 Free conversation', '📖 Start with a specific chapter', '📊 Stats & knowledge base']
  }]);

  if (mode === '📊 Stats & knowledge base') {
    const s = getStats();
    console.log(chalk.cyan(`\n📊 Knowledge base: ${s.k} entries, ${s.q} quotes\n`));
    return;
  }
  else if (mode === '📖 Start with a specific chapter') {
    const topics = listTopics();
    const { chosen } = await inquirer.prompt([{
      name: 'chosen', type: 'rawlist', message: 'Choose a chapter to study:',
      choices: topics.map(t => t.title)
    }]);
    const key = topics.find(t => t.title === chosen)?.key;
    const rel = topics.find(t => t.key === key)?.religion;
    if (key && rel) {
      const story = getStory(rel, key);
      console.log(chalk.green(`\n📜 ${story.title}\n`));
      console.log(chalk.white(story.story));
      console.log(chalk.blue('\n🔗 Analogy: ' + story.analogy));
      if (story.cross_reference) console.log(chalk.magenta('\n🌍 Cross-reference: ' + story.cross_reference));
      console.log(chalk.yellow('\n💭 Reflect: ' + story.reflection));
    }
    console.log('\n');
  }

  await chat(mode === '📖 Start with a specific chapter' ? null : null);
}

main().catch(console.error);
