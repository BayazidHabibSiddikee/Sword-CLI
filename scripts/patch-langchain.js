#!/usr/bin/env node
// postinstall: patch @langchain/core/utils/uuid for langgraph compat
import fs from 'fs';
const shimPath = 'node_modules/@langchain/core/dist/utils/uuid/index.js';
const shimContent = `// Patched uuid shim — added by character-flow postinstall
import * as _uuid from '/home/sword/Documents/Characters/character-flow/node_modules/uuid/dist/index.js';
export const v1 = _uuid.v1;
export const v3 = _uuid.v3;
export const v4 = _uuid.v4;
export const v5 = _uuid.v5;
export const v6 = _uuid.v6;
export const v7 = _uuid.v7;
export const validate = _uuid.validate;
export const parse = _uuid.parse;
export const stringify = _uuid.stringify;
export const NIL = _uuid.NIL;
export const MAX = _uuid.MAX;
export const uuid_exports = _uuid;
export default {
  v1: _uuid.v1, v3: _uuid.v3, v4: _uuid.v4,
  v5: _uuid.v5, v6: _uuid.v6, v7: _uuid.v7,
  validate: _uuid.validate, parse: _uuid.parse,
  stringify: _uuid.stringify, NIL: _uuid.NIL, MAX: _uuid.MAX
};
`;
try {
  fs.mkdirSync('node_modules/@langchain/core/dist/utils/uuid', { recursive: true });
  fs.writeFileSync(shimPath, shimContent);
  console.log('[patch] uuid shim written ✓');
} catch(e) {
  console.error('[patch] skipped:', e.message);
}
