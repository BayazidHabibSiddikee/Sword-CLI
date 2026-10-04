// search_files upgrade: literal/regex/case-insensitive matching on both the
// builtin engine (portable, deterministic) and the ripgrep fast path (when present).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, nodeSearch } from '../cli/tools.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'search-upgrade-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'a.js'), 'const FOO = 1;\nconst foo = 2;\nexport function findBar() { return 3; }\n');
  await writeFile(join(cwd, 'b.js'), 'const BAR = 10;\nconst bar = 20;\n');
  return { cwd, execute: createTools({ cwd, approve: async () => true, timeout: 1000 }) };
}

test('builtin engine: literal, regex, and case-insensitive matches (portable path)', async t => {
  process.env.SWORDCLI_SEARCH_NO_RG = '1';
  const { execute } = await fixture(t);
  t.after(() => { delete process.env.SWORDCLI_SEARCH_NO_RG; });

  // Literal, case-sensitive default (unchanged contract: same .line as before).
  const literal = await execute('search_files', { query: 'BAR' });
  assert.equal(literal.engine, 'builtin');
  assert.deepEqual(literal.matches.map(m => m.path), ['b.js']);

  // Case-insensitive flips "bar" to also match the upper-case lines.
  const ci = await execute('search_files', { query: 'bar', case_insensitive: true });
  assert.deepEqual([...new Set(ci.matches.map(m => m.path))].sort(), ['a.js', 'b.js']);

  // Regex matches a pattern, not a literal substring.
  const rx = await execute('search_files', { query: '^(export\\s)function', regex: true });
  assert.equal(rx.matches.length, 1);
  assert.equal(rx.matches[0].path, 'a.js');
  assert.equal(rx.matches[0].line, 3);

  // A regex that is a "literal" with no match returns nothing.
  const none = await execute('search_files', { query: 'NOPE', regex: true });
  assert.equal(none.matches.length, 0);
});

test('nodeSearch is a pure, injectable engine (no filesystem of its own)', async () => {
  const read = async p => ({ 'x.txt': 'alpha\nBETA\ngamma' }[p]);
  const matches = await nodeSearch({
    files: ['x.txt'], read, checked: async p => p,
    query: 'beta', caseInsensitive: true,
  });
  assert.deepEqual(matches, [{ path: 'x.txt', line: 2, text: 'BETA' }]);
});

test('ripgrep fast path (skipped when rg is not installed)', { skip: false }, async t => {
  // Resolve rg the same way tools.js does; skip portably when absent.
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync('rg', ['--version'], { stdio: 'ignore' });
  if (probe.error) { t.skip('ripgrep not installed'); return; }
  const { execute } = await fixture(t);
  const result = await execute('search_files', { query: 'BAR' });
  assert.equal(result.engine, 'ripgrep');
  assert.deepEqual(result.matches.map(m => m.path), ['b.js']);
  // Same answer as the builtin engine for the same query.
  process.env.SWORDCLI_SEARCH_NO_RG = '1';
  const builtin = await execute('search_files', { query: 'BAR' });
  delete process.env.SWORDCLI_SEARCH_NO_RG;
  assert.deepEqual(builtin.matches.map(m => m.path), result.matches.map(m => m.path));
});
