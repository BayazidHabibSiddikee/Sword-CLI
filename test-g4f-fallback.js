import { attemptFallback, fallbackNotice } from './character-flow/cli/providerFallback.js';
import { createInterface } from 'node:readline/promises';

const rl = createInterface({ input: process.stdin, output: process.stderr });

(async () => {
  console.log(fallbackNotice());
  const res = await attemptFallback('hi');
  console.log(res);
  try {
    const line = await rl.question('sword> ');
    console.log("Read:", line);
  } catch (e) {
    console.error("Error:", e);
  }
})();
