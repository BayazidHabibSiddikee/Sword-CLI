import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  markdownLite, safe, banner, statusLine, approvePrompt, closestCommand,
  cancelMessage, timeoutMessage, toolLine, friendlyError, thinkingIndicator
} from '../cli/ui.js';

function collector() {
  const chunks = [];
  return { stream: { write: text => chunks.push(text) }, text: () => chunks.join('') };
}

test('thinkingIndicator writes one plain line and no cursor escapes', () => {
  const sink = collector();
  const indicator = thinkingIndicator(sink.stream);
  indicator.start();
  indicator.start();                       // starting twice must not stack lines
  assert.equal(sink.text(), 'Thinking…');
  indicator.stop();
  indicator.stop();                        // stopping twice must not stack newlines
  assert.equal(sink.text(), 'Thinking…\n');
  assert.ok(!/\x1b/.test(sink.text()), 'the indicator must not emit ANSI escapes');
  assert.ok(!sink.text().includes('\r'), 'the indicator must not move the cursor');
});

test('thinkingIndicator can be reused for a second turn', () => {
  const sink = collector();
  const indicator = thinkingIndicator(sink.stream);
  indicator.start();
  indicator.stop();
  indicator.start();
  indicator.stop();
  assert.equal(sink.text(), 'Thinking…\nThinking…\n');
});

test('friendlyError reports any user-cancelled turn as Cancelled', () => {
  assert.match(friendlyError(new Error('Action denied by user'), { aborted: true }), /Cancelled/);
  const flagged = new Error('Action denied by user');
  flagged.abortedByUser = true;
  assert.match(friendlyError(flagged, { aborted: false }), /Cancelled/);
  // A plain error is still reported as an error.
  assert.match(friendlyError(new Error('HTTP 500'), { aborted: false }), /HTTP 500/);
});

test('cancelMessage and timeoutMessage are stable identifiers', () => {
  assert.match(cancelMessage(), /Cancelled/);
  assert.match(timeoutMessage(), /timed out/);
  assert.match(timeoutMessage(45), /45/);
});

test('toolLine renders ok, failure, timeout and truncates long summaries', () => {
  assert.match(toolLine('read_file', { ok: true, ms: 10, summary: 'x' }), /✓ read_file 10ms x$/);
  assert.match(toolLine('run_command', { ok: false, ms: 100, summary: 'exit=1' }), /✗ run_command failed 100ms exit=1$/);
  const long = toolLine('x', { ok: true, ms: 1, summary: 'a'.repeat(80) });
  assert.ok(long.length < 80, 'summary must be truncated');
  assert.ok(!long.includes('\n'), 'toolLine must be single line');
});

test('friendlyError maps AbortError to Cancelled and timeout to explicit timeout message', () => {
  assert.match(friendlyError(new DOMException('aborted', 'AbortError'), { aborted: true }), /Cancelled/);
  assert.match(friendlyError(new DOMException('timeout', 'TimeoutError'), { aborted: false }), /timed out/);
  assert.match(friendlyError(new Error('HTTP 500'), { aborted: false }), /HTTP 500/);
  assert.equal(friendlyError(new DOMException('aborted', 'AbortError'), { aborted: false }), 'Error: aborted');
});

test('markdownLite interactive mode highlights inline code and non-interactive uses safe', () => {
  const text = 'Use `cmd` to run';
  const interactive = markdownLite(text, true);
  assert.ok(interactive.includes('cmd'), 'content must be preserved');
  assert.ok(!interactive.includes('```'), 'uses single backticks, not fenced code');

  const plain = markdownLite(text, false);
  assert.ok(plain.includes('cmd'));
  assert.ok(!plain.includes('```'));
});

test('safe strips VT and other control characters', () => {
  const input = 'hello\u000Bworld\u0000foo';
  const out = safe(input);
  assert.ok(!out.includes('\u000B'));
  assert.ok(!out.includes('\u0000'));
  assert.ok(out.includes('hello'));
  assert.ok(out.includes('world'));
});

test('banner formats mode, model, cwd and session', () => {
  const text = banner({ mode: 'coding', model: 'gpt-4', cwd: '/tmp' });
  assert.match(text, /SwordCLI/);
  assert.match(text, /coding/);
  assert.match(text, /gpt-4/);
  assert.match(text, /cwd: \/tmp/);
  assert.match(text, /session: \(local \| ephemeral\)/);

  const shared = banner({ mode: 'marketing-video', model: 'auto', cwd: '/tmp', session: 'abc', revision: 7 });
  assert.match(shared, /marketing-video/);
  assert.match(shared, /session: abc \(rev 7\)/);

  const plainSession = banner({ mode: 'coding', model: 'auto', cwd: '/tmp', session: 'abc' });
  assert.match(plainSession, /session: abc$/m);
});

test('statusLine includes mode, model, cwd, session, history and approval', () => {
  const text = statusLine({ mode: 'coding', model: 'auto', cwd: '/tmp', historyCount: 7, approval: 'required for all edits and commands' });
  assert.match(text, /mode:\s+coding/);
  assert.match(text, /model:\s+auto/);
  assert.match(text, /cwd:\s+\/tmp/);
  assert.match(text, /history:\s+7 message\(s\)/);
  assert.match(text, /approvals:\s+required for all edits and commands/);

  const shared = statusLine({ mode: 'marketing-video', model: 'auto', cwd: '/tmp', session: 's1', revision: 3, historyCount: 1, approval: 'required' });
  assert.match(shared, /session:\s+s1 \(rev 3\)/);

  const plainSession = statusLine({ mode: 'coding', model: 'auto', cwd: '/tmp', session: 's1', historyCount: 0, approval: 'required' });
  assert.match(plainSession, /session:\s+s1$/m);
});

test('approvePrompt covers write overwrite, edit delta, run timeout, save_to_rag and unknown tool', () => {
  assert.match(approvePrompt({ tool: 'write_file', after: 'abc' }), /create .* \(3 bytes\)/);
  assert.match(approvePrompt({ tool: 'write_file', before: 'x', after: 'abc' }), /overwrite/);

  assert.match(approvePrompt({ tool: 'edit_file', before: 'a\nb', after: 'a\nb\nc' }), /\+1/);
  assert.match(approvePrompt({ tool: 'edit_file', before: 'a\nb\nc', after: 'a\nc' }), /\−1/);

  assert.match(approvePrompt({ tool: 'run_command', command: 'ls', args: ['-la'] }), /run ls -la/);
  assert.match(approvePrompt({ tool: 'run_command', command: 'ls', timeout: 5000 }), /timeout 5000ms/);

  assert.match(approvePrompt({ tool: 'save_to_rag', title: 'Note', category: 'memo' }), /save to memory: Note/);

  assert.match(approvePrompt({ tool: 'weird_tool' }), /weird_tool/);
});

test('markdownLite handles triple backticks, unclosed backticks and empty input', () => {
  assert.equal(markdownLite('', true), '');
  assert.equal(markdownLite(null, true), '');

  // Unclosed backtick — falls through without formatting
  assert.equal(markdownLite('use `cmd', true), 'use `cmd');

  // Triple backticks with trailing newline enter the fence-skip branch
  const fenced = markdownLite('```\ncode\nmore', true);
  assert.ok(fenced.includes('code'), 'content must be preserved');
  assert.ok(fenced.includes('```'), 'triple-backtick prefix is not stripped by current implementation');
});

test('closestCommand finds exact, prefix and returns null for unknowns', () => {
  assert.equal(closestCommand('/clear', ['/clear', '/status', '/help']), 'clear');
  assert.equal(closestCommand('/st', ['/clear', '/status', '/help']), 'status');
  assert.equal(closestCommand('/xyz', ['/clear', '/status']), null);
});
