// Detect how this project runs its tests, so the model can verify changes with a
// real command instead of guessing (or a syntax-only check). Pure + read-only: it
// only inspects well-known manifest files and never executes anything.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Return { command, args, source, raw } for the most likely test command, or null.
 * `command` + `args` are the exact pieces to pass to run_command (no shell parsing);
 * `raw` is a human-readable form for the prompt. Order is by confidence.
 */
export function detectTestCommand(cwd, { fs = null } = {}) {
  const read = (rel, type = 'utf8') => {
    const path = join(cwd, rel);
    try { return existsSync(path) ? readFileSync(path, type) : null; }
    catch { return null; }
  };

  // 1. package.json → pick the right package-manager verb from lockfiles.
  const pkg = read('package.json');
  if (pkg) {
    let parsed = {};
    try { parsed = JSON.parse(pkg); } catch { parsed = {}; }
    const verb = pickVerb(cwd, parsed);
    const script = pickTestScript(parsed.scripts);
    if (script) return { command: verb, args: [script], source: `package.json scripts.${script}`, raw: `${verb} ${script}` };
    // No test script: an install-then-test is not useful; fall through.
  }

  // 2. Rust / Go / Python / Java / Make / CMake markers.
  if (existsSync(join(cwd, 'Cargo.toml'))) return { command: 'cargo', args: ['test'], source: 'Cargo.toml', raw: 'cargo test' };
  if (existsSync(join(cwd, 'go.mod'))) return { command: 'go', args: ['test', './...'], source: 'go.mod', raw: 'go test ./...' };
  for (const marker of ['pytest.ini', 'pyproject.toml', 'setup.py', 'setup.cfg']) {
    if (existsSync(join(cwd, marker))) return { command: 'pytest', args: [], source: marker, raw: 'pytest' };
  }
  if (existsSync(join(cwd, 'tests'))) return { command: 'pytest', args: [], source: 'tests/ directory', raw: 'pytest' };
  if (existsSync(join(cwd, 'pom.xml'))) return { command: 'mvn', args: ['test'], source: 'pom.xml', raw: 'mvn test' };
  for (const g of ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'gradlew']) {
    if (existsSync(join(cwd, g))) return { command: g === 'gradlew' ? './gradlew' : 'gradle', args: g === 'gradlew' ? ['test'] : ['test'], source: g, raw: (g === 'gradlew' ? './gradlew ' : 'gradle ') + 'test' };
  }
  if (existsSync(join(cwd, 'Makefile')) && /(^|\n)[A-Za-z0-9_ -]*test[ :]/i.test(read('Makefile') ?? '')) {
    return { command: 'make', args: ['test'], source: 'Makefile', raw: 'make test' };
  }
  if (existsSync(join(cwd, 'CMakeLists.txt')) && existsSync(join(cwd, 'CTestTestfile.cmake'))) {
    return { command: 'ctest', args: ['--test-dir', 'build'], source: 'CTest', raw: 'ctest --test-dir build' };
  }
  return null;
}

/** Choose the package-manager verb for a Node project from its lockfiles. */
function pickVerb(cwd, pkg = {}) {
  if (pkg.packageManager) {
    const name = String(pkg.packageManager).split('@')[0];
    if (['pnpm', 'yarn', 'bun', 'npm'].includes(name)) return name;
  }
  if (existsSync(join(cwd, 'pnpm-lock.yaml')) || existsSync(join(cwd, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Pick a real "run the tests" script, preferring an exact `test` over a lint/type. */
function pickTestScript(scripts) {
  if (!scripts || typeof scripts !== 'object') return null;
  if (typeof scripts.test === 'string' && scripts.test.trim()) return 'test';
  if (typeof scripts['test:unit'] === 'string' && scripts['test:unit'].trim()) return 'test:unit';
  const preferred = ['test:all', 'test:run', 'check'];
  for (const key of preferred) if (typeof scripts[key] === 'string' && scripts[key].trim()) return key;
  // A script whose name starts with "test" and whose body isn't just a lint/type pass.
  for (const [key, val] of Object.entries(scripts)) {
    if (/^test/i.test(key) && typeof val === 'string' && val.trim() && !/^\s*(tsc|eslint|deno check|typecheck)/.test(val)) return key;
  }
  return null;
}
