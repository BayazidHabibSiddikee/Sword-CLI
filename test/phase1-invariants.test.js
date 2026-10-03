import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextBudgetEvent, DEFAULT_BUDGET_TOKENS } from '../cli/budget.js';
import { splitAtTurnBoundary } from '../cli/historyArchive.js';

test('contextBudgetEvent summarizes degradation as an observable envelope', () => {
  const event = contextBudgetEvent({
    projectedTokens: 25000,
    budgetTokens: 20000,
    events: [
      { type: 'drop-turns', messages: 6, remaining: 4 },
      { type: 'shrink-tool-result', tool_call_id: 'c1', from: 9000, to: 4500 },
    ],
  });
  assert.equal(event.type, 'context_budget');
  assert.equal(event.tokens, 25000);
  assert.equal(event.budget, 20000);
  assert.equal(event.degraded, true);
  assert.equal(event.dropped, 6);
  assert.equal(event.shrunk, 1);
  assert.equal(contextBudgetEvent().budget, DEFAULT_BUDGET_TOKENS);
});

test('splitAtTurnBoundary asserts the turn-boundary invariant (no orphaned pairs)', () => {
  const user = c => ({ role: 'user', content: c });
  const toolUse = id => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
  const tool = (id, content = '{}') => ({ role: 'tool', tool_call_id: id, content });
  const messages = [user('one'), toolUse('a1'), tool('a1'), user('two'), toolUse('b1'), tool('b1')];
  for (let keep = 0; keep <= messages.length + 1; keep++) {
    // Throws AssertionError if the cut orphans a tool_result; passing means invariant holds.
    const { head, tail } = splitAtTurnBoundary(messages, keep);
    assert.deepEqual([...head, ...tail], messages);
  }
});
