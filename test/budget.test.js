import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARS_PER_TOKEN, DEFAULT_BUDGET_TOKENS, MIN_TOOL_CHARS,
  estimateTokens, classifyMessage, messageCost, projectRequest, degrade
} from '../cli/budget.js';

const user = (content, extra = {}) => ({ role: 'user', content, ...extra });
const assistant = (content, extra = {}) => ({ role: 'assistant', content, ...extra });
const toolUse = (id, name = 'read_file') => assistant(null, { tool_calls: [{ id, type: 'function', function: { name, arguments: '{}' } }] });
const toolResult = (id, content) => ({ role: 'tool', tool_call_id: id, content });

/** One turn: user prompt -> assistant tool_use -> tool_result. */
function turn(n, toolChars = 0) {
  return [user(`turn ${n}`), toolUse(`t${n}`), toolResult(`t${n}`, 'x'.repeat(toolChars))];
}

test('estimateTokens is ceil(chars/4) and deterministic', () => {
  assert.equal(CHARS_PER_TOKEN, 4);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens('abc'), 1);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  for (const n of [1, 3, 4, 5, 401, 9999]) assert.equal(estimateTokens('y'.repeat(n)), Math.ceil(n / 4));
  assert.deepEqual(estimateTokens('y'.repeat(4001)), estimateTokens('y'.repeat(4001)));
});

test('classifyMessage distinguishes all five billable blocks', () => {
  assert.equal(classifyMessage({ role: 'system', content: 's' }), 'system');
  assert.equal(classifyMessage(user('hi')), 'user');
  assert.equal(classifyMessage(assistant('hello')), 'assistant_text');
  assert.equal(classifyMessage(assistant(null, { tool_calls: [] })), 'assistant_text', 'empty tool_calls is still text');
  assert.equal(classifyMessage(toolUse('a')), 'assistant_tool_use');
  assert.equal(classifyMessage(toolResult('a', '{}')), 'tool_result');
  assert.equal(classifyMessage(null), 'system', 'defensive: unknown shapes never become droppable user turns');
});

test('messageCost reports block, chars, tokens and tool call ids', () => {
  const call = toolUse('call_1', 'run_command');
  const use = messageCost(call);
  assert.equal(use.block, 'assistant_tool_use');
  assert.deepEqual(use.toolCallIds, ['call_1']);
  assert.equal(use.chars, JSON.stringify(call).length);
  assert.equal(use.tokens, Math.ceil(use.chars / 4));
  const res = messageCost(toolResult('call_1', 'y'.repeat(40)));
  assert.deepEqual(res.toolCallIds, ['call_1']);
  assert.equal(res.block, 'tool_result');
  assert.deepEqual(messageCost(assistant('plain')).toolCallIds, []);
});

test('projectRequest reserves tool schemas exactly once', () => {
  const tools = [{ type: 'function', function: { name: 'read_file', description: 'd'.repeat(400) } }];
  const messages = [user('one'), assistant('two')];
  const once = projectRequest({ messages, tools });
  const twice = projectRequest({ messages: [...messages, ...messages], tools });
  assert.equal(once.reserve, Math.ceil(JSON.stringify(tools).length / 4));
  assert.equal(once.tokens, once.perMessage.reduce((s, m) => s + m.tokens, 0) + once.reserve);
  // Four messages of the same size double the message cost but not the reserve.
  assert.equal(twice.reserve, once.reserve);
  assert.equal(twice.tokens, once.tokens * 2 - once.reserve);
  assert.equal(once.perMessage.length, 2);
  assert.equal(once.perMessage[0].index, 0);
});

test('degrade is a no-op when the request already fits', () => {
  const messages = [user('hi'), assistant('hello')];
  const result = degrade({ messages, tools: [], budgetTokens: DEFAULT_BUDGET_TOKENS });
  assert.equal(result.degraded, false);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.messages, messages);
});

test('degrade drops whole oldest turns before touching anything newer', () => {
  const messages = [...turn(1), ...turn(2), ...turn(3), user('current question')];
  const full = projectRequest({ messages, tools: [] }).tokens;
  const budget = Math.ceil(full * 0.6);
  const result = degrade({ messages, tools: [], budgetTokens: budget });
  assert.ok(result.degraded);
  assert.deepEqual(result.events[0], { type: 'drop-turns', messages: 9, remaining: 1 });
  assert.deepEqual(result.messages, [user('current question')]);
  assert.ok(result.projected.tokens <= budget);
});

test('degrade shrinks an oversized tool_result instead of dropping the turn that owns it', () => {
  // The oversized tool_result belongs to the CURRENT (pinned) turn, so no turn can be
  // dropped at all — degrade must shrink the tool output rather than the current input.
  const messages = [user('q'), toolUse('live'), toolResult('live', 'y'.repeat(40000))];
  const result = degrade({ messages, tools: [], budgetTokens: 400 });
  const kinds = [...new Set(result.events.map(e => e.type))];
  assert.deepEqual(kinds, ['shrink-tool-result'], 'no turn is droppable here');
  assert.ok(result.events.length > 1, 'shrinking is iterative until it fits');
  assert.deepEqual(result.messages[0], user('q'), 'current input survives');
  assert.deepEqual(result.messages[1], toolUse('live'), 'the tool_use is untouched');
  assert.equal(result.messages[2].tool_call_id, 'live');
  assert.ok(result.messages[2].content.length < 40000);
  assert.ok(result.projected.tokens <= 400);
});

test('degrade drops turns first and shrinks tool output only once none are left', () => {
  // Big droppable turn + a huge pinned tool result: the turn must go first, and the
  // pinned tool output may only be squeezed after that.
  const messages = [...turn(1, 20000), user('q'), toolUse('live'), toolResult('live', 'y'.repeat(40000))];
  const result = degrade({ messages, tools: [], budgetTokens: 400 });
  assert.deepEqual([...new Set(result.events.map(e => e.type))], ['drop-turns', 'shrink-tool-result']);
  assert.deepEqual(result.messages.slice(0, 2), [user('q'), toolUse('live')]);
  assert.ok(result.projected.tokens <= 400);
});

test('degrade prefers dropping whole turns over shrinking tool output', () => {
  const messages = [...turn(1, 20000), ...turn(2, 20000), ...turn(3, 20000), user('current')];
  const result = degrade({ messages, tools: [], budgetTokens: 600 });
  const kinds = [...new Set(result.events.map(e => e.type))];
  assert.deepEqual(kinds, ['drop-turns'], 'shrink only appears after every droppable turn is gone');
  assert.deepEqual(result.messages, [user('current')]);
  assert.ok(result.projected.tokens <= 600);
});

test('degrade never removes the current input', () => {
  const messages = [...turn(1, 8000), ...turn(2, 8000), user('the actual question'), toolUse('live'), toolResult('live', 'z'.repeat(8000))];
  for (const budget of [1000, 4000, 12000]) {
    const result = degrade({ messages, tools: [], budgetTokens: budget });
    assert.ok(result.messages.some(m => m.content === 'the actual question'), `budget ${budget} kept the current input`);
    assert.equal(result.messages.at(-1).tool_call_id, 'live', `budget ${budget} kept the live tool result`);
    assert.ok(result.projected.tokens <= budget);
  }
});

test('degrade never orphans a tool_use or its tool_result', () => {
  const messages = [...turn(1, 3000), ...turn(2, 3000), ...turn(3, 3000), user('current')];
  for (const budget of [120, 400, 900, 2500, 6000]) {
    const { messages: kept } = degrade({ messages, tools: [], budgetTokens: budget });
    const used = kept.filter(m => classifyMessage(m) === 'assistant_tool_use')
      .flatMap(m => m.tool_calls.map(c => c.id));
    const answered = kept.filter(m => classifyMessage(m) === 'tool_result').map(m => m.tool_call_id);
    for (const id of answered) assert.ok(used.includes(id), `budget ${budget}: result ${id} kept its tool_use`);
    assert.equal(answered.length, [...new Set(answered)].length, `budget ${budget}: no duplicate results`);
  }
});

test('degrade keeps the system prompt no matter how tight the budget is', () => {
  const system = { role: 'system', content: 'you are a coding agent' };
  const messages = [system, ...turn(1, 4000), user('current')];
  const result = degrade({ messages, tools: [], budgetTokens: 60 });
  assert.deepEqual(result.messages[0], system);
  assert.ok(result.projected.tokens <= 60);
});

test('degrade throws when system + tools + current input are irreducible', () => {
  const tools = [{ type: 'function', function: { name: 't', description: 'd'.repeat(20000) } }];
  const messages = [{ role: 'system', content: 's'.repeat(40000) }, ...turn(1, 30000), user('question')];
  assert.throws(() => degrade({ messages, tools, budgetTokens: 100 }), /Context budget exceeded[\s\S]*current input/);
  assert.throws(() => degrade({ messages: [{ role: 'system', content: 's'.repeat(40000) }, user('q')], tools, budgetTokens: 100 }),
    /budget is 100/);
});

test('degrade does not mutate its input array or messages', () => {
  const messages = [...turn(1, 9000), ...turn(2, 9000), user('current')];
  const snapshot = JSON.stringify(messages);
  const result = degrade({ messages, tools: [], budgetTokens: 400 });
  assert.equal(JSON.stringify(messages), snapshot, 'input array untouched');
  assert.ok(result.messages.length < messages.length);
  assert.equal(messages[2].content.length, 9000, 'input message objects untouched');
  // Shrunk results are NEW objects; the caller's still hold their full content.
  for (const m of result.messages) {
    if (classifyMessage(m) === 'tool_result' && m.content.length < 9000) {
      assert.equal(messages.find(o => o.tool_call_id === m.tool_call_id).content.length, 9000);
    }
  }
});

test('degrade stops shrinking at the floor and then throws instead of looping', () => {
  const messages = [user('q'), toolUse('t1'), toolResult('t1', 'y'.repeat(50000)), user('current')];
  assert.throws(() => degrade({ messages, tools: [], budgetTokens: 1 }), /Context budget exceeded/);
  const roomy = degrade({ messages, tools: [], budgetTokens: 400 });
  for (const m of roomy.messages) {
    if (classifyMessage(m) === 'tool_result') assert.ok(m.content.length >= Math.min(MIN_TOOL_CHARS, 50000));
  }
  // Every shrink event halves or floors; the sequence is finite and monotonic.
  let previous = 50000;
  for (const event of roomy.events.filter(e => e.type === 'shrink-tool-result')) {
    assert.ok(event.to < previous && event.to >= MIN_TOOL_CHARS);
    previous = event.to;
  }
});

test('degrade events account for the savings that were made', () => {
  const messages = [...turn(1, 30000), ...turn(2, 30000), user('current')];
  const before = projectRequest({ messages, tools: [] }).tokens;
  const result = degrade({ messages, tools: [], budgetTokens: 400 });
  assert.ok(before > 400);
  assert.ok(result.projected.tokens <= 400);
  assert.ok(result.projected.tokens < before);
  const dropped = result.events.filter(e => e.type === 'drop-turns').reduce((s, e) => s + e.messages, 0);
  assert.equal(messages.length - dropped, result.messages.length - result.events.filter(e => e.type === 'shrink-tool-result').length);
});

