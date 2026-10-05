import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

test('cli/langgraph-agent.js imports cleanly as ESM module without createRequire ReferenceError', async () => {
  const mod = await import('../cli/langgraph-agent.js');
  assert.equal(typeof mod.LangGraphAgent, 'function', 'LangGraphAgent class should be exported');
  assert.equal(typeof mod.buildAgent, 'function', 'buildAgent function should be exported');
});

test('cli/tui.js contains no CommonJS require() calls in ES module', async () => {
  const content = await readFile(resolve(process.cwd(), 'cli/tui.js'), 'utf8');
  const requireCalls = content.match(/\brequire\s*\(/g);
  assert.equal(requireCalls, null, `Found CommonJS require() calls in cli/tui.js: ${requireCalls}`);
});

test('cli/tui.js and cli/langgraph-agent.js pass node --check syntax validation', async () => {
  const check = async (filePath) => {
    return new Promise((res, rej) => {
      const child = spawn(process.execPath, ['--check', filePath], { stdio: 'pipe' });
      let err = '';
      child.stderr.on('data', d => { err += d.toString(); });
      child.on('close', code => {
        if (code === 0) res();
        else rej(new Error(`node --check ${filePath} failed with code ${code}: ${err}`));
      });
    });
  };

  await check(resolve(process.cwd(), 'cli/tui.js'));
  await check(resolve(process.cwd(), 'cli/langgraph-agent.js'));
});

test('cli/tui.js boots and handles /session command without CommonJS or ESM runtime crashes', async () => {
  const child = spawn(process.execPath, [resolve(process.cwd(), 'cli/tui.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.stdin.write('/session\n/exit\n');
  child.stdin.end();

  const code = await new Promise((res) => {
    child.on('close', res);
  });

  assert.equal(code, 0, `cli/tui.js should exit with 0, got ${code}. Stderr: ${stderr}`);
  assert.match(stdout, /💾 Session:/, 'should render session details');
  assert.match(stdout, /Persisted:\s+yes/, 'should display persisted session status');
  assert.ok(!stderr.includes('ReferenceError'), `stderr must not contain ReferenceError: ${stderr}`);
});
