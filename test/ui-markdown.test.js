import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownLite } from '../cli/ui.js';

test('markdownLite preserves correct sequential order of prefix, code, and suffix', () => {
  const rendered = markdownLite('Prefix `code` then suffix', true);
  
  const prefixIdx = rendered.indexOf('Prefix');
  const codeIdx = rendered.indexOf('code');
  const suffixIdx = rendered.indexOf('then suffix');

  assert.ok(prefixIdx !== -1, 'Prefix must be present');
  assert.ok(codeIdx !== -1, 'code must be present');
  assert.ok(suffixIdx !== -1, 'suffix must be present');

  assert.ok(prefixIdx < codeIdx, 'Prefix must precede code');
  assert.ok(codeIdx < suffixIdx, 'code must precede suffix');
  assert.ok(!rendered.startsWith(' then suffix'), 'suffix must not be prepended to the beginning');
});

test('markdownLite degraded-provider fallback message does not prepend trailing text', () => {
  const fallbackMsg = `[SwordCLI: No provider available]\n\nYour prompt: "test prompt"\n\nNo LLM provider is reachable — all providers failed:\n- mock: failed\n\nWithout a working provider the agent CANNOT read files, write code, or run commands.\nRun \`sword doctor\` for an automated diagnosis and fix steps, or configure a provider:\n  • OPENAI_BASE_URL + OPENAI_API_KEY (any OpenAI-compatible endpoint)\n  • SWORDCLI_BASE_URL + SWORDCLI_TOKEN  (remote Sword backend)\n  • Start the local stack: \`./sword.mjs up\`  then re-run sword`;
  
  const rendered = markdownLite(fallbackMsg, true);

  assert.ok(!rendered.startsWith('  then re-run sword'), 'trailing text must not be prepended');
  assert.ok(rendered.startsWith('[SwordCLI: No provider available]'), 'message must start with header');
  assert.ok(rendered.endsWith('  then re-run sword'), 'message must end with trailing instruction');
});

test('markdownLite preserves sequential order across multiple inline code spans', () => {
  const input = 'First `code1` middle `code2` and last';
  const rendered = markdownLite(input, true);

  const firstIdx = rendered.indexOf('First');
  const code1Idx = rendered.indexOf('code1');
  const midIdx = rendered.indexOf('middle');
  const code2Idx = rendered.indexOf('code2');
  const lastIdx = rendered.indexOf('and last');

  assert.ok(firstIdx < code1Idx, 'First before code1');
  assert.ok(code1Idx < midIdx, 'code1 before mid');
  assert.ok(midIdx < code2Idx, 'mid before code2');
  assert.ok(code2Idx < lastIdx, 'code2 before last');
  assert.ok(!rendered.startsWith('and last'), 'trailing text must not be prepended');
});
