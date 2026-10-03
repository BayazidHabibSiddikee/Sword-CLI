import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_THRESHOLD, PLACEHOLDER_MARK, isPlaceholder, placeholderMessage,
  splitAtTurnBoundary, compressTurns, archiveHint
} from '../cli/historyArchive.js';

const user = content => ({ role: 'user', content });
const assistant = content => ({ role: 'assistant', content });
const toolUse = id => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
const tool = (id, content = '{}') => ({ role: 'tool', tool_call_id: id, content });

/** user -> assistant(tool_use) -> tool_result: the pair that must never be cut. */
const pair = n => [user(`prompt ${n}`), toolUse(`call_${n}`), tool(`call_${n}`)];

/** Would this cut strand a tool_result whose tool_use is in the head? */
function isValidSplit(messages, split) {
  const head = messages.slice(0, split);
  const tail = messages.slice(split);
  if (head.some(m => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length)) {
    const ids = head.filter(m => m.role === 'assistant' && Array.isArray(m.tool_calls))
      .flatMap(m => m.tool_calls.map(c => c.id));
    for (const result of tail.filter(m => m.role === 'tool')) {
      if (ids.includes(result.tool_call_id)) return false;
    }
  }
  return true;
}

test('splitAtTurnBoundary never cuts a (tool_use, tool_result) pair', () => {
  for (let keep = 0; keep <= 12; keep++) {
    const messages = [...pair(1), ...pair(2), ...pair(3), ...pair(4)];
    const { head, tail } = splitAtTurnBoundary(messages, keep);
    assert.ok(isValidSplit(messages, head.length), `keep=${keep} must not orphan a tool_result`);
    assert.deepEqual([...head, ...tail], messages, `keep=${keep} loses nothing`);
    // The cut only ever moves backwards, so the tail is at least as large as asked.
    assert.ok(tail.length >= Math.min(keep, messages.length), `keep=${keep} keeps at least the requested window`);
  }
});

test('splitAtTurnBoundary leaves an already-clean cut alone', () => {
  const messages = [...pair(1), ...pair(2), ...pair(3)];
  const { head, tail } = splitAtTurnBoundary(messages, 6);
  assert.equal(head.length, 3);
  assert.equal(tail.length, 6);
  assert.equal(tail[0].role, 'user');
});

test('splitAtTurnBoundary clamps keepCount and tolerates an empty log', () => {
  assert.deepEqual(splitAtTurnBoundary([], 10), { head: [], tail: [] });
  const messages = [...pair(1)];
  // keepCount is a lower bound on the retained window: a non-positive request means
  // "keep everything", matching the old `slice(len - 0)` behaviour of archiving none.
  assert.deepEqual(splitAtTurnBoundary(messages, -5), { head: [], tail: messages });
  assert.deepEqual(splitAtTurnBoundary(messages, undefined), { head: [], tail: messages });
  assert.equal(splitAtTurnBoundary(messages, 99).head.length, 0);
  assert.equal(splitAtTurnBoundary(messages, 99).tail.length, messages.length);
});

test('splitAtTurnBoundary does not mutate its input', () => {
  const messages = [...pair(1), ...pair(2)];
  const snapshot = JSON.stringify(messages);
  splitAtTurnBoundary(messages, 4);
  assert.equal(JSON.stringify(messages), snapshot);
});

test('the placeholder stub is a user message loadSession will accept', () => {
  const stub = placeholderMessage(7);
  assert.equal(stub.role, 'user', 'loadSession rejects any other role');
  assert.ok(['user', 'assistant', 'tool'].includes(stub.role));
  assert.ok(stub.content.includes(PLACEHOLDER_MARK));
  assert.match(stub.content, /7 earlier turn/);
  assert.ok(isPlaceholder(stub));
  assert.equal(isPlaceholder(user('a real prompt')), false);
  assert.equal(isPlaceholder({ role: 'user', content: 42 }), false);
  assert.equal(isPlaceholder(assistant(PLACEHOLDER_MARK)), false, 'only the user-role stub counts');
  assert.equal(isPlaceholder(null), false);
});

test('compressTurns never archives the placeholder stub', () => {
  const stub = placeholderMessage(3);
  const messages = [user('real prompt one'), assistant('real answer'), stub, user('real prompt two'), assistant('second answer')];
  const docs = compressTurns(messages);
  assert.equal(docs.length, 2);
  assert.equal(docs.some(doc => doc.content.includes(PLACEHOLDER_MARK)), false);
  assert.deepEqual(docs.map(d => d.title), ['real prompt one', 'real prompt two']);
  // Compressing the same log again is stable: no growth, no archive-of-the-archive.
  assert.deepEqual(compressTurns(messages), docs);
});

test('compressTurns skips a placeholder that would otherwise start a turn', () => {
  // Without the filter the stub swallows the next assistant block into its "turn"
  // and the doc's title becomes "[archived-history] N earlier turn(s)...".
  const after = 'add a regression test for the parser and run the suite';
  const messages = [placeholderMessage(1), user(after), assistant('here is the fix and the test output')];
  const docs = compressTurns(messages);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, after);
  assert.deepEqual(compressTurns([placeholderMessage(1)]), [], 'a stub alone archives to nothing');
  assert.deepEqual(compressTurns(undefined), []);
});

test('a re-archive pass over a stubbed window never stacks stubs', () => {
  // Mirrors archiveMessages' tail handling: the stub is kept once, and the second
  // pass over the same window produces the same single stub.
  const keepOnce = tail => (tail.some(isPlaceholder) ? tail : [placeholderMessage(4), ...tail]);
  const first = keepOnce([user('recent prompt'), assistant('recent answer')]);
  assert.equal(first.filter(isPlaceholder).length, 1);
  const second = keepOnce(first);
  assert.equal(second.filter(isPlaceholder).length, 1);
  assert.deepEqual(second, first);
  assert.deepEqual(compressTurns(first).length, 1, 'only the real turn is re-archived');
});

test('archiveHint is empty until something was actually archived', () => {
  assert.equal(archiveHint(0), '');
  assert.equal(archiveHint(undefined), '');
  assert.match(archiveHint(5), /5 prior conversation turns/);
  assert.match(archiveHint(5), /history/);
});

test('HISTORY_THRESHOLD stays at the documented 200 messages', () => {
  assert.equal(HISTORY_THRESHOLD, 200);
});

/** Every tool_result retained in the tail must find its tool_use in the TAIL. */
function assertNoOrphans(messages, keep) {
  const { head, tail } = splitAtTurnBoundary(messages, keep);
  const idsIn = list => new Set(list.flatMap(m =>
    m.role === 'assistant' && Array.isArray(m.tool_calls) ? m.tool_calls.map(c => c.id) : []));
  const usedAnywhere = idsIn(messages);
  const tailUsed = idsIn(tail);
  for (const m of tail) {
    // A result whose tool_use is nowhere in the log is pre-corrupted input: no
    // cut can repair it, and splitAtTurnBoundary must not be blamed for it.
    if (m.role !== 'tool' || !usedAnywhere.has(m.tool_call_id)) continue;
    assert.ok(tailUsed.has(m.tool_call_id), `keep=${keep} orphaned result ${m.tool_call_id}`);
  }
  assert.deepEqual([...head, ...tail], messages, `keep=${keep} must not lose messages`);
}

test('splitAtTurnBoundary backs up when a result was interleaved away from its call', () => {
  // Hand-crafted/corrupted log: call A's result sits AFTER another assistant
  // message, so simple adjacency would strand it in the tail while its tool_use
  // is archived away in the head. Providers reject that orphan.
  const messages = [user('prompt'), toolUse('A'), toolUse('B'), tool('A'), tool('B'), user('next turn')];
  for (let keep = 0; keep <= messages.length + 2; keep++) assertNoOrphans(messages, keep);
  // And the guard really moves the cut: with keep=4 the naive split lands between
  // the two calls, so the cut must retreat to a turn boundary before them.
  const { head, tail } = splitAtTurnBoundary(messages, 4);
  assert.ok(head.length < 4, 'the cut moved backwards past the interleaved block');
  assert.equal(tail.some(m => m.role === 'tool'), true);
  assertNoOrphans(messages, 4);
});

test('the orphan guard holds across a mixed corrupted log for every cut', () => {
  const messages = [
    user('one'), toolUse('a1'), tool('a1'),
    user('two'), toolUse('b1'), toolUse('b2'), tool('b1'), tool('b2'),
    user('three'), toolUse('c1'), tool('c1'), assistant('done')
  ];
  for (let keep = 0; keep <= messages.length + 2; keep++) assertNoOrphans(messages, keep);
  // A result whose tool_use is entirely absent from the log never forces an
  // endless retreat: the cut still lands on the turn boundary and loses nothing.
  const orphaned = [user('x'), tool('ghost'), user('y')];
  for (let keep = 0; keep <= orphaned.length; keep++) assertNoOrphans(orphaned, keep);
  assert.deepEqual(splitAtTurnBoundary(orphaned, 1).tail, [user('y')]);
  assert.deepEqual(splitAtTurnBoundary(orphaned, 2).tail, orphaned, 'the ghost result backs the cut to the start');
});
