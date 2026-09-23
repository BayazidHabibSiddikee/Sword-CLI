import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../cli/agent.js';

test('completed tool result survives in checkpoint after the next provider request fails', async () => {
  let checkpoint, requests = 0;
  const messages = [{ role: 'user', content: 'Do work' }];
  await assert.rejects(runTurn({ messages,
    request: async () => {
      if (requests++ > 0) throw new Error('provider unavailable');
      return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'done', function: { name: 'fixture', arguments: '{}' } }] } }] };
    },
    execute: async () => ({ completed: true }),
    onCheckpoint: snapshot => { checkpoint = snapshot; }
  }), /provider unavailable/);
  assert.equal(checkpoint.at(-1).role, 'tool');
  assert.deepEqual(JSON.parse(checkpoint.at(-1).content), { completed: true });
  assert.equal(messages.length, 1);
});
