// G3 + G4 + G5 prompt helpers: the degraded-provider notice must be honest, the
// sub-agent prompt must be read-only, and the test-command block must carry the raw command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { g4fDegradedNotice, subagentPrompt, testCommandBlock } from '../cli/prompts.js';

test('the g4f degraded notice forbids claiming tool use (G3 honesty)', () => {
  const notice = g4fDegradedNotice();
  assert.match(notice, /cannot execute tool/i);
  assert.match(notice, /plain text/i);
  assert.match(notice, /OPENAI_BASE_URL|backend/i);
  // It must not accidentally instruct the model to act.
  assert.doesNotMatch(notice, /go ahead and run/i);
});

test('the sub-agent prompt is strictly read-only (G4 recursion/safety guard)', () => {
  const p = subagentPrompt('find all usages of the RAG engine');
  assert.match(p, /READ-ONLY/i);
  assert.match(p, /cannot edit files, run\s+commands/i);
  assert.match(p, /find all usages of the RAG engine/);
});

test('the test-command block carries the detected raw command (G5)', () => {
  assert.match(testCommandBlock('npm test'), /`npm test`/);
  assert.match(testCommandBlock('cargo test'), /`cargo test`/);
  assert.match(testCommandBlock('go test ./...'), /OBSERVED/i);
});
