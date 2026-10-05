// Phase 4 — local skill store: integrity lockfile, tamper exclusion and the
// relevance-ranked index that replaces the alphabetical-prefix cliff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installSkill, uninstallSkill, verifySkill, listInstalledSkills,
  rankSkills, buildRankedSkillIndex, SKILL_FILE, MANIFEST_NAME,
} from '../cli/skills/store.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'skills-store-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

test('install writes SKILL.md + lockfile that verify accepts', async t => {
  const cwd = await fixture(t);
  const content = '---\ndescription: draws charts\n---\n# Chart skill\n';
  const installed = installSkill({ cwd, name: 'chart', content, source: 'https://example.test/chart' });
  assert.equal(installed.name, 'chart');
  assert.equal(installed.sha256.length, 64);
  const verdict = verifySkill({ cwd, name: 'chart' });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.source, 'https://example.test/chart');
  // The lockfile pins the digest of the exact bytes installed.
  const manifest = JSON.parse(await readFile(join(cwd, '.sword', 'skills', 'chart', MANIFEST_NAME), 'utf8'));
  assert.equal(manifest.sha256, installed.sha256);
});

test('an expectedSha256 mismatch refuses the install (nothing written)', async t => {
  const cwd = await fixture(t);
  assert.throws(() => installSkill({ cwd, name: 'x', content: 'body', expectedSha256: 'deadbeef' }), /sha256 mismatch/);
  assert.deepEqual(listInstalledSkills({ cwd }), []);
});

test('a tampered skill is excluded from the verified listing', async t => {
  const cwd = await fixture(t);
  installSkill({ cwd, name: 'good', content: 'trusted body' });
  installSkill({ cwd, name: 'bad', content: 'trusted body' });
  // Tamper with one skill's content after install.
  await writeFile(join(cwd, '.sword', 'skills', 'bad', SKILL_FILE), 'tampered body');

  assert.equal(verifySkill({ cwd, name: 'bad' }).ok, false);
  assert.match(verifySkill({ cwd, name: 'bad' }).reason, /tampered/);
  const verified = listInstalledSkills({ cwd });
  assert.deepEqual(verified.map(s => s.name), ['good'], 'only the untampered skill survives');
  // The full listing still reveals the bad one, with its reason.
  const all = listInstalledSkills({ cwd, verifiedOnly: false });
  assert.equal(all.find(s => s.name === 'bad').ok, false);
});

test('uninstall removes an installed skill', async t => {
  const cwd = await fixture(t);
  installSkill({ cwd, name: 'temp', content: 'x' });
  assert.deepEqual(uninstallSkill({ cwd, name: 'temp' }), { removed: true, name: 'temp' });
  assert.deepEqual(listInstalledSkills({ cwd }), []);
});

test('rankSkills prefers a relevant skill over an alphabetically-first one', () => {
  const skills = [
    { name: 'aaa-generic', desc: 'nothing in particular' },
    { name: 'postgres', desc: 'database migrations and queries' },
    { name: 'zzz-charts', desc: 'render charts' },
  ];
  const ranked = rankSkills(skills, 'postgres query');
  assert.equal(ranked[0].name, 'postgres');
  // Deterministic: the same query always yields the same order.
  assert.deepEqual(rankSkills(skills, 'postgres query').map(s => s.name), ranked.map(s => s.name));
});

test('buildRankedSkillIndex renders a bounded block and honours the char cap', () => {
  const skills = [
    { name: 'postgres', desc: 'database migrations and queries' },
    { name: 'charts', desc: 'render charts' },
  ];
  const block = buildRankedSkillIndex(skills, 'postgres');
  assert.match(block, /## Project Skills \(verified\)/);
  assert.match(block, /- postgres: database migrations and queries/);
  assert.equal(buildRankedSkillIndex([], 'x'), null);
});
