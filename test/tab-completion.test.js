import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { listModels } from '../cli/model.js';
import { buildCompletions, resolveCharacterNames } from '../cli/flow.js';

test('listModels returns available models without throwing', () => {
  const models = listModels();
  assert.ok(Array.isArray(models), 'listModels should return an array');
  assert.ok(models.length > 0, 'listModels should return models');
  assert.ok(models.includes('qwen2.5:1.5b'), 'should include qwen2.5:1.5b');
  assert.ok(models.includes('gpt-4o'), 'should include gpt-4o');
  assert.ok(models.includes('claude-3-5-sonnet'), 'should include claude-3-5-sonnet');
  assert.ok(models.includes('gemini-3.6-flash'), 'should include preferred model gemini-3.6-flash');
});

test('resolveCharacterNames returns standard TEAM_CHARACTERS by default', () => {
  const chars = resolveCharacterNames();
  assert.ok(Array.isArray(chars));
  assert.ok(chars.includes('izuku'), 'should include izuku');
  assert.ok(chars.includes('kael'), 'should include kael');
  assert.ok(chars.includes('turing'), 'should include turing');
  assert.ok(chars.includes('ada_vance'), 'should include ada_vance');
  assert.equal(chars.length, 10);
});

test('resolveCharacterNames dynamically resolves characters from characters/ directory', async t => {
  const tmp = await mkdtemp(join(tmpdir(), 'sword-char-test-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const charDir = join(tmp, 'characters');
  await mkdir(charDir, { recursive: true });
  await writeFile(join(charDir, 'custom_hero.json'), JSON.stringify({ name: 'custom_hero' }));
  await writeFile(join(charDir, 'mentor_bot.js'), 'export default {};');

  const resolved = resolveCharacterNames(tmp);
  assert.ok(resolved.includes('custom_hero'), 'should include custom_hero from characters/');
  assert.ok(resolved.includes('mentor_bot'), 'should include mentor_bot from characters/');
  assert.ok(resolved.includes('izuku'), 'should also include standard team characters');
});

test('resolveCharacterNames dynamically resolves characters from .sword/characters/ directory', async t => {
  const tmp = await mkdtemp(join(tmpdir(), 'sword-char-test-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const swordCharDir = join(tmp, '.sword', 'characters');
  await mkdir(swordCharDir, { recursive: true });
  await writeFile(join(swordCharDir, 'project_agent.json'), JSON.stringify({ name: 'project_agent' }));

  const resolved = resolveCharacterNames(tmp);
  assert.ok(resolved.includes('project_agent'), 'should include project_agent from .sword/characters/');
  assert.ok(resolved.includes('kael'), 'should also include standard team characters');
});

test('buildCompletions includes /model completions with real model names', () => {
  const completions = buildCompletions();
  assert.ok(Array.isArray(completions));
  assert.ok(completions.includes('/model'), 'slash command /model must be present');

  const modelCompletions = completions.filter(c => c.startsWith('/model '));
  assert.ok(modelCompletions.length >= 5, `Expected >= 5 model completions, got ${modelCompletions.length}`);
  assert.ok(completions.includes('/model qwen2.5:1.5b'));
  assert.ok(completions.includes('/model gpt-4o'));
  assert.ok(completions.includes('/model claude-3-5-sonnet'));
  assert.ok(completions.includes('/model gemini-3.6-flash'));
});

test('buildCompletions includes /character completions with team and dynamic characters', async t => {
  const tmp = await mkdtemp(join(tmpdir(), 'sword-compl-test-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const charDir = join(tmp, 'characters');
  await mkdir(charDir, { recursive: true });
  await writeFile(join(charDir, 'shadow_agent.json'), '{}');

  const completions = buildCompletions(tmp);
  assert.ok(completions.includes('/character'), 'slash command /character must be present');
  assert.ok(completions.includes('/character izuku'), 'should include /character izuku');
  assert.ok(completions.includes('/character kael'), 'should include /character kael');
  assert.ok(completions.includes('/character shadow_agent'), 'should include /character shadow_agent from characters/');
});

test('buildCompletions does not throw and has no duplicates', () => {
  const completions = buildCompletions();
  const set = new Set(completions);
  assert.equal(completions.length, set.size, 'completions should have no duplicate items');
  // Confirm standard slash commands exist
  assert.ok(completions.includes('/help'));
  assert.ok(completions.includes('/status'));
  assert.ok(completions.includes('/team'));
  assert.ok(completions.includes('/routine'));
});
