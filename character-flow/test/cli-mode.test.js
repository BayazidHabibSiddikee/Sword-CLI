import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

const cli = new URL('../cli/flow.js', import.meta.url).pathname;
async function invoke(args, env = {}) {
  const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}
test('CLI routes marketing-video mode to provider and preserves tools', async t => {
  let received;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    // GET /v1/models (model discovery) has no body; never parse an empty one.
    if (body) received = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(received
      ? { choices: [{ message: { role: 'assistant', content: 'Please confirm your audience and offer.' } }] }
      : { object: 'list', data: [] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const result = await invoke(['--mode', 'marketing-video', '--prompt', 'Plan an ad', '--json'], {
    OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'fixture'
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).response, 'Please confirm your audience and offer.');
  assert.match(received.messages[0].content, /marketing-video/);
  for (const required of ['Assumptions', 'storyboard', 'CTA', 'ffprobe', '-nostdin', '-n', 'Never invent', 'measurement']) {
    assert.ok(received.messages[0].content.includes(required), required);
  }
  assert.ok(received.tools.some(tool => tool.function.name === 'run_command'));
});
test('CLI sends coding instructions that require real files and safe git use', async t => {
  let received;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (body) received = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(received
      ? { choices: [{ message: { role: 'assistant', content: 'Understood.' } }] }
      : { object: 'list', data: [] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const result = await invoke(['--local', '--prompt', 'build a script', '--json'], {
    OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'fixture'
  });
  assert.equal(result.code, 0, result.stderr);
  const system = received.messages[0];
  assert.equal(system.role, 'system');
  for (const required of ['SwordCLI', 'write_file', 'edit_file', 'run_command', 'git status', 'never present a chat-only', 'VERIFY WITH EVIDENCE']) {
    assert.ok(system.content.includes(required), required);
  }
  assert.ok(received.tools.some(tool => tool.function.name === 'write_file'));
});
test('CLI documents modes and rejects unknown mode before contacting a provider', async () => {
  const help = await invoke(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--mode\s+coding \| marketing-video/);
  const invalid = await invoke(['--mode', 'unknown', '--prompt', 'hello']);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /Unknown mode/);
});
