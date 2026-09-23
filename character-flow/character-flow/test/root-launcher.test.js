import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('../../../', import.meta.url));
async function sword(args, env = {}) {
  const child = spawn('npm', ['run', '--silent', 'sword', '--', ...args], {
    cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}
test('root npm run sword forwards --help to the CLI', async () => {
  const result = await sword(['--help']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Usage: sword/);
  assert.match(result.stdout, /--mode\s+coding \| marketing-video/);
});
test('root launcher preserves project cwd and forwards task arguments', async t => {
  let received, saved;
  const session = { id: '00000000-0000-4000-8000-000000000001', messages: [], revision: 0, workdir: root.replace(/\/$/, ''), mode: 'marketing-video', model: 'fixture' };
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/sword/')) {
      if (req.method === 'PUT') saved = JSON.parse(body);
      res.end(JSON.stringify({ success: true, data: req.url.includes('/context') ? { context: 'Project memory' } : { session } }));
      return;
    }
    // Model discovery issues GET /v1/models with an empty body.
    if (!body && !req.url.startsWith('/api/sword/')) {
      res.end(JSON.stringify({ object: 'list', data: [] })); return;
    }
    received = JSON.parse(body);
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Launcher works' } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const result = await sword(['--mode', 'marketing-video', '--prompt', 'Plan a campaign', '--json'], {
    OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'fixture'
  });
  if (process.env.DEBUG_LAUNCHER) {
    console.error('DEBUG-STDERR:', result.stderr.slice(0, 3000));
    console.error('DEBUG-STDOUT:', result.stdout.slice(0, 1000));
  }
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).response, 'Launcher works');
  assert.ok(received.messages[0].content.includes(`Project directory: ${root.replace(/\/$/, '')}\n`));
  assert.match(received.messages[0].content, /marketing-video/);
  assert.equal(received.messages.at(-1).content, 'Plan a campaign');
  assert.equal(saved?.messages.at(-1).content, 'Launcher works', 'default launch must persist a web-visible session');
});
