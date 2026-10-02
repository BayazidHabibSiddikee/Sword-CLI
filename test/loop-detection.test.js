// Regression tests for the three-tier loop guard in cli/agent.js.
//
// The bug these lock down: the guard counted a call BEFORE its outcome was known
// and compared one counter against both tiers, so (a) three identical *successful*
// calls tripped the "it keeps failing" stop, (b) the soft tier was unreachable, and
// (c) the hard-stop emitted a second tool result for call ids it had already
// answered, which is a duplicate tool_call_id the provider rejects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../cli/agent.js';

const call = (id, name, args) => ({ id, function: { name, arguments: JSON.stringify(args) } });

test('a repeated successful call is not treated as a failing loop', async () => {
  let n = 0;
  const request = async () => {
    n++;
    if (n <= 3) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [call(`c${n}`, 'read_file', { path: 'a' })] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'all good' } }] };
  };
  const result = await runTurn({ messages: [], request, execute: async () => ({ ok: true, path: 'a' }), maxSteps: 20 });
  assert.equal(result.text, 'all good', 'three identical good calls must not stop the turn');
  assert.doesNotMatch(result.text, /keeps failing/);
});

test('a hard-stop answers each tool_call id exactly once', async () => {
  let n = 0;
  const request = async () => {
    n++;
    return { choices: [{ message: { role: 'assistant', content: 'stuck', tool_calls: [
      call(`a${n}`, 'edit_file', { path: 'x', old_text: '1', new_text: '2' }),
      call(`b${n}`, 'write_file', { path: 'y', content: 'z' }),
    ] } }] };
  };
  const result = await runTurn({ messages: [], request, execute: async () => ({ error: 'Read file before editing' }), maxSteps: 20 });
  const ids = result.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id);
  assert.ok(ids.length > 0, 'the stop must still answer the calls');
  assert.equal(new Set(ids).size, ids.length, `each tool_call_id answered once, got ${JSON.stringify(ids)}`);
  assert.match(result.text, /keeps failing/);
  assert.match(result.text, /stuck/, 'the model\'s own last words are preserved');
});

test('a success resets the failure streak for the same call', async () => {
  let n = 0;
  let calls = 0;
  const request = async () => {
    n++;
    if (n <= 4) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [call(`c${n}`, 'boom', {})] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'recovered' } }] };
  };
  // fail, fail, SUCCEED, fail — the third success must clear the streak, so the
  // fourth call is a fresh streak of one, not a third consecutive failure.
  const result = await runTurn({
    messages: [], request, maxSteps: 20,
    execute: async () => { calls++; return calls === 3 ? { ok: true } : { error: 'nope' }; },
  });
  assert.equal(result.text, 'recovered');
});