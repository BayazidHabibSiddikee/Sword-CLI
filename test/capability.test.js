import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capabilityEvent, degradedTurn, DEGRADED_NOTICE, LOST_CAPABILITIES } from '../cli/capability.js';
import { fallbackNotice } from '../cli/providerFallback.js';

test('the degraded notice stays byte-identical to the legacy fallbackNotice()', () => {
  // The duplication exists only to avoid an import cycle; this pins the two
  // strings together so a reword in either place fails the build.
  assert.equal(DEGRADED_NOTICE, fallbackNotice());
  assert.equal(degradedTurn().notice, fallbackNotice());
  assert.ok(fallbackNotice().includes('CHAT-ONLY'), 'legacy wording is unchanged');
});

test('degradedTurn preserves the legacy degraded/toolsUsed keys and adds capability_lost', () => {
  const turn = degradedTurn({ retryAttempts: 3, lost: [{ capability: 'tools', provider: 'g4f', reason: 'tools stripped by fallback' }] });
  // LEGACY CONTRACT: parsed by existing callers, must never change.
  assert.equal(turn.degraded, true);
  assert.equal(turn.toolsUsed, false);
  // The addition.
  assert.equal(turn.event, 'capability_lost');
  assert.equal(turn.retryAttempts, 3);
  assert.deepEqual(turn.capabilities, ['tools']);
  assert.equal(turn.lost[0].provider, 'g4f');
  assert.equal(turn.lost[0].event, 'capability_lost');
  assert.ok(turn.text.startsWith(fallbackNotice()), 'printable text leads with the legacy notice');
  assert.match(turn.text, /no tools ran|capability_lost: tools/);
});

test('degradedTurn defaults to reporting the tools loss', () => {
  // The fallback path always strips tool_calls, so an empty `lost` must not claim
  // the turn lost nothing.
  const turn = degradedTurn();
  assert.deepEqual(turn.capabilities, ['tools']);
  assert.equal(turn.retryAttempts, 0);
  assert.equal(turn.degraded, true);
  assert.equal(turn.toolsUsed, false);
});

test('degradedTurn accepts several lost capabilities, as strings or events', () => {
  const turn = degradedTurn({ lost: ['streaming', { capability: 'history' }, capabilityEvent({ capability: 'provider' })] });
  assert.deepEqual(turn.capabilities, ['streaming', 'history', 'provider']);
  assert.ok(LOST_CAPABILITIES.includes('tools'));
});

test('capabilityEvent is structured, printable and carries a suggestion', () => {
  const event = capabilityEvent({ capability: 'tools', provider: 'g4f', reason: 'anonymous endpoint has no function calling' });
  assert.equal(event.event, 'capability_lost');
  assert.equal(event.capability, 'tools');
  assert.equal(event.label, 'tool execution');
  assert.match(event.suggestion, /function calling|--model/);
  assert.match(event.text, /^capability_lost: tools \(provider=g4f\) — anonymous endpoint has no function calling$/);
  // An explicit suggestion overrides the generic one.
  const explicit = capabilityEvent({ capability: 'model', reason: '404', suggestion: 'pick gpt-4o-mini' });
  assert.equal(explicit.suggestion, 'pick gpt-4o-mini');
  // An unknown capability falls back to `tools` rather than emitting a nameless event.
  assert.equal(capabilityEvent({ capability: 'telepathy' }).capability, 'tools');
  assert.equal(capabilityEvent().capability, 'tools');
});

test('capabilityEvent strips control characters from untrusted provider text', () => {
  // The reason comes from a provider response body: an ANSI repaint or a bidi
  // override must not be able to hide the rest of the notice.
  const event = capabilityEvent({ capability: 'provider', reason: '[31mfailed‮txet', provider: 'g4f\u0007' });
  assert.ok(!/||‮/.test(event.reason), 'escape sequences must be stripped');
  assert.ok(!/||‮/.test(event.provider));
  assert.ok(event.text.includes('failed'));
});

test('capability objects are frozen so a caller cannot rewrite history', () => {
  const event = capabilityEvent({ capability: 'tools' });
  assert.ok(Object.isFrozen(event));
  assert.throws(() => { 'use strict'; event.capability = 'streaming'; }, TypeError);
  assert.ok(Object.isFrozen(degradedTurn().lost));
});