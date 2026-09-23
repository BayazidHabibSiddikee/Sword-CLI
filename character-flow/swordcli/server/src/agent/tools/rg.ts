import { execFile } from 'node:child_process';

let cache: { available: boolean; path: string | null } | null = null;

/** Locate `rg` (ripgrep) on PATH. Cached — the answer doesn't change mid-process. */
export function rgAvailable(): Promise<boolean> {
  return rgCache().then((c) => c.available);
}

export function rgPath(): string {
  const c = cache;
  if (!c?.available || !c.path) {
    throw new Error('ripgrep not found on PATH');
  }
  return c.path;
}

async function rgCache() {
  if (cache) return cache;
  const found = await new Promise<string | null>((resolve) => {
    execFile('which', ['rg'], (err, stdout) => {
      resolve(err ? null : (stdout as string).trim() || null);
    });
  });
  cache = found ? { available: true, path: found } : { available: false, path: null };
  return cache;
}
