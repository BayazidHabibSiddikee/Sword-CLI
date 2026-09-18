import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, toolDefinitions } from '../cli/tools.js';
import { RagEngine } from '../brain/rag.js';

async function fixture(t, approve = async () => true) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-web-tools-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, execute: createTools({ cwd, approve, timeout: 2000 }) };
}

/** A minimal one-page PDF, generated so the test needs no external asset. */
function minimalPdf(text) {
  const stream = `BT /F1 18 Tf 20 120 Td (${text}) Tj ET\n`;
  const objects = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}endstream\nendobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(pdf)); pdf += `${object}\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

test('the sandboxed tool surface exposes memory, PDF and web tools', () => {
  const names = toolDefinitions.map(entry => entry.function.name);
  for (const name of ['save_to_rag', 'read_pdf', 'fetch_web', 'fetch_web_rendered']) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(new Set(names).size, names.length, 'tool names must be unique');
});

test('save_to_rag requires approval, validates input and is retrievable', async t => {
  const { cwd, execute } = await fixture(t);
  const denied = createTools({ cwd, approve: async () => false });
  await assert.rejects(denied('save_to_rag', { category: 'notes', title: 'Blocked', content: 'x' }), /denied/);

  await assert.rejects(execute('save_to_rag', { category: 'notes', title: '', content: 'x' }), /Invalid title/);
  const saved = await execute('save_to_rag', { category: 'notes', title: 'Streaming design', content: 'Provider deltas are reassembled before runTurn sees them.' });
  assert.equal(saved.saved, true);
  assert.ok(saved.id >= 1);

  // The note must be readable back through the shared RAG engine.
  const engine = new RagEngine(join(cwd, '.flow', 'rag.db'));
  try {
    const hits = engine.search('streaming deltas reassembled', 3);
    assert.ok(hits.some(hit => hit.title === 'Streaming design'), 'saved note must be retrievable');
  } finally { engine.db?.close(); }
});

test('read_pdf extracts bounded text and refuses unsafe paths', async t => {
  const { cwd, execute } = await fixture(t);
  await writeFile(join(cwd, 'sample.pdf'), minimalPdf('Hello SwordCLI PDF'), 'binary');
  const result = await execute('read_pdf', { path: 'sample.pdf', max_pages: 1 });
  assert.equal(result.read_pages, 1);
  assert.ok(result.pages >= 1);
  assert.match(result.text, /Hello SwordCLI PDF/);

  await assert.rejects(execute('read_pdf', { path: 'missing.pdf' }), /ENOENT/);
  await assert.rejects(execute('read_pdf', { path: '../outside.pdf' }), /outside project/i);
});

test('fetch tools refuse internal targets before any network access', async t => {
  const { execute } = await fixture(t);
  for (const url of ['http://169.254.169.254/latest/meta-data', 'http://127.0.0.1:3001/v1', 'file:///etc/passwd']) {
    await assert.rejects(execute('fetch_web', { url }), /Unsupported URL scheme|Blocked|non-public/, url);
  }
  await assert.rejects(execute('fetch_web', { url: '' }), /Invalid url/);
});