// G6 — web_search engine: keyless DuckDuckGo parsing with an injectable fetch,
// plus graceful degradation instead of a hard failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webSearch, parseDuckDuckGo } from '../cli/tools.js';

const HTML = `<html><body>
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&amp;rut=1">Example Title</a>
<a class="result__snippet">Snippet one</a>
<a class="result__a" href="https://second.org/docs">Second Title</a>
<a class="result__snippet">Snippet two &amp; more</a>
</body></html>`;

test('parseDuckDuckGo resolves DDG redirect URLs and pairs snippets', () => {
  const results = parseDuckDuckGo(HTML, 5);
  assert.deepEqual(results[0], { title: 'Example Title', url: 'https://example.com/page', snippet: 'Snippet one' });
  assert.deepEqual(results[1], { title: 'Second Title', url: 'https://second.org/docs', snippet: 'Snippet two & more' });
  assert.equal(parseDuckDuckGo(HTML, 1).length, 1, 'cap is respected');
});

test('webSearch returns parsed results via an injected fetch', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => HTML });
  const res = await webSearch('example', { fetchFn, maxResults: 3 });
  assert.equal(res.source, 'duckduckgo');
  assert.equal(res.results.length, 2);
  assert.equal(res.results[0].url, 'https://example.com/page');
});

test('webSearch degrades to an error payload when the network is down', async () => {
  const res = await webSearch('x', { fetchFn: async () => { throw new Error('net down'); } });
  assert.equal(res.results.length, 0);
  assert.match(res.error, /unavailable/);
});

test('webSearch reports an HTTP failure without throwing', async () => {
  const res = await webSearch('x', { fetchFn: async () => ({ ok: false, status: 429, text: async () => '' }) });
  assert.match(res.error, /HTTP 429/);
});

test('webSearch requires a non-empty query', async () => {
  await assert.rejects(webSearch('   ', { fetchFn: async () => ({ ok: true, text: async () => '' }) }), /empty query/);
});
