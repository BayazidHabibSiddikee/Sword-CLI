import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { htmlToMarkdown, assertPublicUrl, isPublicAddress, fetchWeb, fetchWebRendered } from '../cli/webFetch.js';
import { createRequest } from '../cli/agent.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const response = (body, { status = 200, type = 'text/html' } = {}) =>
  new Response(body, { status, headers: { 'content-type': type } });
const frame = object => `data: ${JSON.stringify(object)}\n\n`;

test('htmlToMarkdown keeps structure and drops active content', () => {
  const html = '<html><head><title>T</title><style>x{}</style></head><body>'
    + '<h2>Section</h2><p>Hello <strong>bold</strong> and <a href="/rel">a link</a>.</p>'
    + '<ul><li>one</li><li>two</li></ul><pre>const a = 1 &lt; 2;</pre>'
    + '<script>evil()</script></body></html>';
  const markdown = htmlToMarkdown(html);
  assert.match(markdown, /^## Section/m);
  assert.match(markdown, /Hello \*\*bold\*\* and \[a link\]\(\/rel\)\./);
  assert.match(markdown, /- one\n- two/);
  assert.match(markdown, /```\nconst a = 1 < 2;\n```/);
  assert.ok(!markdown.includes('evil'), 'script content must be removed');
  assert.ok(!markdown.includes('x{}'), 'style content must be removed');
  assert.ok(!/<[a-z][a-z0-9]*[\s>/]/i.test(markdown), 'no raw tags survive');
  assert.throws(() => htmlToMarkdown(null), /HTML/);
});

test('htmlToMarkdown decodes named and numeric entities', () => {
  const markdown = htmlToMarkdown('<p>R&amp;D &lt; 10 &copy; 2024 &#x2764;</p>');
  assert.match(markdown, /R&D/);
  assert.match(markdown, /</);
  assert.match(markdown, /©/);
  assert.match(markdown, /❤/);
});

test('isPublicAddress classifies private, link-local, documentation and mapped ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1',
    '2001:db8::1', '2002::1', '3fff::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('assertPublicUrl blocks unsafe schemes, credentials and internal hosts', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com',
    'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://metadata.local/']) {
    await assert.rejects(assertPublicUrl(url, { lookup: publicLookup }), /Unsupported URL scheme|credentials|Blocked/, url);
  }
  await assert.rejects(assertPublicUrl('https://internal.test/', { lookup: async () => [{ address: '10.0.0.5', family: 4 }] }), /non-public/);
  const ok = await assertPublicUrl('https://example.com/page', { lookup: publicLookup });
  assert.equal(ok.href, 'https://example.com/page');
});

test('fetchWeb converts real response bodies to Markdown and enforces bounds', async () => {
  const calls = [];
  const page = await fetchWeb('https://example.com/page', {
    lookup: publicLookup,
    fetchImpl: async url => {
      calls.push(url);
      return response('<html><head><title>Doc</title></head><body><h1>Title</h1><p>Body text</p></body></html>');
    }
  });
  assert.deepEqual(calls, ['https://example.com/page']);
  assert.equal(page.status, 200);
  assert.equal(page.title, 'Doc');
  assert.match(page.markdown, /# Title/);
  assert.match(page.markdown, /Body text/);
  assert.equal(page.truncated, false);

  await assert.rejects(fetchWeb('https://example.com/x', { lookup: publicLookup, fetchImpl: async () => response('png', { type: 'image/png' }) }), /content type/);
  await assert.rejects(fetchWeb('https://example.com/x', { lookup: publicLookup, fetchImpl: async () => response('nope', { status: 500 }) }), /HTTP 500/);
});

test('fetchWeb re-validates redirect targets instead of following blindly', async () => {
  const redirecting = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
  await assert.rejects(fetchWeb('https://example.com/start', { lookup: publicLookup, fetchImpl: redirecting }), /non-public/);
});

test('fetchWebRendered fails clearly when no Camoufox interpreter is available', async () => {
  await assert.rejects(
    fetchWebRendered('https://example.com', { lookup: publicLookup, env: { SWORD_PYTHON: '/nope/python' }, exists: () => false }),
    /No Python interpreter/);
  await assert.rejects(
    fetchWebRendered('https://example.com', { lookup: publicLookup, python: '/nonexistent-python-bin' }),
    /Cannot start browser runtime/);
});

test('streaming responses assemble content and fragmented tool calls', async t => {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain the request */ }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(frame({ choices: [{ delta: { content: 'Hel' } }] }));
    res.write(frame({ choices: [{ delta: { content: 'lo' } }] }));
    res.write(frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_', arguments: '{"pa' } }] } }] }));
    res.write(frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: 'th":"x"}' } }] } }] }));
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const tokens = [];
  const request = createRequest(
    { url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, key: '', model: 'fixture' },
    [], undefined, token => tokens.push(token));
  const data = await request([{ role: 'user', content: 'hi' }]);
  assert.deepEqual(tokens, ['Hel', 'lo']);
  assert.equal(data.choices[0].message.content, 'Hello');
  assert.deepEqual(data.choices[0].message.tool_calls[0],
    { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } });
});

test('a provider that ignores stream still parses as buffered JSON', async t => {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain the request */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Buffered' } }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const request = createRequest(
    { url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, key: '', model: 'fixture' },
    [], undefined, () => {});
  const data = await request([{ role: 'user', content: 'hi' }]);
  assert.equal(data.choices[0].message.content, 'Buffered');
});

test('htmlToMarkdown handles empty and whitespace-only input', () => {
  assert.equal(htmlToMarkdown(''), '');
  assert.equal(htmlToMarkdown('   '), '');
  assert.equal(htmlToMarkdown('\n\n'), '');
});

test('fetchWeb truncates markdown to the requested maxChars and reports truncated', async () => {
  const body = '<html><body>' + '<p>' + 'A'.repeat(500) + '</p>'.repeat(40) + '</body></html>';
  const page = await fetchWeb('https://example.com/x', {
    lookup: publicLookup,
    maxChars: 200,
    fetchImpl: async () => response(body)
  });
  assert.ok(page.truncated);
  assert.ok(page.markdown.length <= 200, `markdown length ${page.markdown.length} exceeds limit`);
  assert.ok(page.chars > page.markdown.length, 'chars reports the full markdown length');
});

test('fetchWeb returns raw JSON when the content type is JSON', async () => {
  const payload = JSON.stringify({ hello: 'world' });
  const page = await fetchWeb('https://example.com/x', {
    lookup: publicLookup,
    fetchImpl: async () => response(payload, { type: 'application/json' })
  });
  assert.equal(page.contentType, 'application/json');
  assert.equal(page.markdown, payload);
});

test('fetchWeb accepts +xml and +json content type suffixes', async () => {
  const page = await fetchWeb('https://example.com/x', {
    lookup: publicLookup,
    fetchImpl: async () => response('<xml/>', { type: 'application/soap+xml' })
  });
  assert.equal(page.contentType, 'application/soap+xml');
  assert.ok(!page.markdown.includes('<xml/>'), 'htmlToMarkdown strips raw tags');
});

test('assertPublicUrl throws actionable errors for invalid URLs and DNS failures', async () => {
  await assert.rejects(assertPublicUrl('', { lookup: publicLookup }), /URL must be a non-empty string/);
  await assert.rejects(assertPublicUrl('not-a-url', { lookup: publicLookup }), /Invalid URL/);
  await assert.rejects(assertPublicUrl('https://example.invalid/', { lookup: async () => { throw new Error('ENOTFOUND'); } }), /Could not resolve host/);
});

test('fetchWeb honours an abort signal and throws AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  const rejectingFetch = async () => {
    throw new DOMException('aborted', 'AbortError');
  };
  await assert.rejects(fetchWeb('https://example.com/x', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    signal: controller.signal,
    fetchImpl: rejectingFetch
  }), /aborted/);
});