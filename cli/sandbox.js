// Optional OS-level sandboxing for `run_command`.
//
// WHAT THIS GUARANTEES (when a capability is available):
//   - the filesystem is read-only except for an explicit writable allowlist, which
//     by default is exactly the project directory;
//   - the network namespace is unshared and has no interfaces (bwrap `--unshare-all`
//     without `--share-net`, firejail `--net=none`), so a command cannot exfiltrate;
//   - PID namespace + `--die-with-parent`, so a killed turn cannot leave orphans;
//   - /tmp is a fresh tmpfs, so a command cannot read or plant files there.
//
// WHAT THIS DOES **NOT** GUARANTEE — read this before treating a sandboxed run as
// untrusted-code execution:
//   - `~/.ssh`, `~/.aws`, cloud credential files and the docker socket REMAIN READABLE.
//     `--ro-bind / /` binds the whole root filesystem read-only, and read-only is not
//     invisible. A sandboxed command can still exfiltrate those credentials over the
//     inherited stdio pipes.
//   - there is NO seccomp filter: syscalls, `ptrace`, and kernel surface are not
//     restricted, only namespaces.
//   - CPU/memory/PID limits are not enforced (bwrap shares the host cgroup).
//   - when `kind === 'none'` NOTHING is enforced. That is not a weaker sandbox; it is
//     the absence of one, and `describe()` says so in the notice shown to the user.
//
// Degradation is bwrap -> firejail -> none, and a runtime ENOENT (probe said yes, exec
// said no) downgrades ONCE and is reported through `sandboxDowngrade` — never silently
// re-run an unsandboxed command as if it were sandboxed.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PROBE_TIMEOUT = 1500;

/** Ordered fallback chain. Index is the degradation rung; `none` is the floor. */
export const CAPABILITIES = [
  { kind: 'bwrap', probe: 'bwrap', probeArgs: ['--version'], platforms: ['linux'] },
  { kind: 'firejail', probe: 'firejail', probeArgs: ['--version'], platforms: ['linux'] },
  { kind: 'sandbox-exec', probe: 'sandbox-exec', probeArgs: ['-h'], platforms: ['darwin'] },
  { kind: 'none', probe: null, probeArgs: [] }
];

let cache = new Map();
let downgradedFrom = null;

/** Is this capability merely "not selected", or was it downgraded at runtime? */
export function sandboxDowngrade() {
  return downgradedFrom === null ? null : { ...downgradedFrom };
}

/** Test seam: forget every cached probe result and any recorded downgrade. */
export function resetDetection() {
  cache = new Map();
  downgradedFrom = null;
}

async function available(capability, probeImpl) {
  if (capability.kind === 'none') return true;
  if (typeof probeImpl === 'function') return Boolean(await probeImpl(capability.kind));
  try {
    await run(capability.probe, capability.probeArgs, { timeout: PROBE_TIMEOUT, maxBuffer: 64 * 1024 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe for a usable sandbox. Result is cached for the process lifetime: the answer
 * cannot change under us, and a probe costs a fork.
 *
 * `env.SWORDCLI_SANDBOX` forces a rung ('bwrap' | 'firejail' | 'sandbox-exec' | 'none');
 * the default 'auto' walks the degradation chain (Linux: bwrap -> firejail -> none;
 * macOS: sandbox-exec -> none).
 */
export async function detect({ env = process.env, platform = process.platform, probeImpl } = {}) {
  const forced = String(env?.SWORDCLI_SANDBOX ?? 'auto').trim().toLowerCase();
  // Keyed by the inputs that can change the answer, so a forced rung and an auto
  // probe never read each other's result.
  const key = `${platform}|${forced}`;
  if (cache.has(key)) return cache.get(key);
  const base = { kind: 'none', reason: 'no sandbox available; run_command is unsandboxed' };
  const remember = value => (cache.set(key, value), value);
  if (platform === 'win32') return remember({ kind: 'none', reason: 'Windows has no supported sandbox backend' });
  const chain = CAPABILITIES.filter(c => !c.platforms || c.platforms.includes(platform));
  if (forced !== 'auto') {
    const chosen = CAPABILITIES.find(c => c.kind === forced);
    if (!chosen) return remember({ ...base, reason: `Unknown SWORDCLI_SANDBOX=${forced}` });
    if (chosen.kind === 'none') return remember({ kind: 'none', reason: 'sandbox disabled by SWORDCLI_SANDBOX' });
    if (chosen.platforms && !chosen.platforms.includes(platform)) {
      return remember({ ...base, reason: `SWORDCLI_SANDBOX=${forced} is not supported on ${platform}` });
    }
    if (await available(chosen, probeImpl)) return remember({ kind: chosen.kind, reason: `forced by SWORDCLI_SANDBOX=${forced}` });
    return remember({ ...base, reason: `SWORDCLI_SANDBOX=${forced} requested but ${chosen.probe} is not usable` });
  }
  for (const capability of chain) {
    if (!capability.probe) break;
    if (await available(capability, probeImpl)) {
      return remember({ kind: capability.kind, reason: `${capability.probe} available` });
    }
  }
  return remember({ ...base, reason: platform === 'darwin' ? 'sandbox-exec is not installed' : 'neither bwrap nor firejail is installed' });
}

/**
 * The next rung down. Returns `{kind:'none'}` once the chain is exhausted.
 * Records the downgrade so the caller can surface it — a silent drop to unsandboxed
 * execution would be a lie about what the user approved.
 */
export function degrade(capability, reason, { platform = process.platform } = {}) {
  // The degrade chain is platform-filtered: sandbox-exec only exists on macOS, so a
  // Linux firejail failure still bottoms out at none (never a macOS backend).
  const chain = CAPABILITIES.filter(c => !c.platforms || c.platforms.includes(platform));
  const kind = capability?.kind ?? capability;
  const index = chain.findIndex(c => c.kind === kind);
  const next = chain[Math.min(index + 1, chain.length - 1)];
  downgradedFrom = { from: capability?.kind ?? null, to: next.kind, reason: reason ?? 'sandbox binary missing at exec time' };
  // A downgrade invalidates every probe result: the binary we trusted is gone.
  cache = new Map();
  return { ...next, downgrade: downgradedFrom };
}
/**
 * Wrap a command in a sandbox wrapper. Pure: no probing, no spawning.
 *
 * `writable` is an allowlist of absolute paths; the project directory is always
 * writable and is the ONLY entry by default. `--ro-bind / /` makes everything else
 * read-only; each extra writable path is layered on top as a bind mount.
 */
export function buildArgv({ kind, cwd, command, args = [], network = 'deny', writable = [] } = {}) {
  const allowNet = network === 'allow';
  // cwd first, de-duplicated, so the allowlist is exactly [cwd] unless widened.
  const allow = [...new Set([cwd, ...(Array.isArray(writable) ? writable : [])].filter(Boolean))];
  if (kind === 'bwrap') {
    const argv = ['--die-with-parent', '--unshare-all'];
    // --unshare-all takes the network namespace away; --share-net is the single,
    // explicit way to give it back, so it appears only when asked for.
    if (allowNet) argv.push('--share-net');
    argv.push('--new-session', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp');
    for (const dir of allow) argv.push('--bind', dir, dir);
    argv.push('--chdir', cwd, '--', command, ...args);
    return { command: 'bwrap', args: argv, meta: { kind: 'bwrap', sandboxed: true, network: allowNet ? 'allow' : 'none', writable: allow, cwd } };
  }
  if (kind === 'firejail') {
    const argv = ['--quiet', '--private-tmp', '--read-only=/'];
    for (const dir of allow) argv.push(`--read-write=${dir}`);
    if (!allowNet) argv.push('--net=none');
    argv.push(command, ...args);
    return { command: 'firejail', args: argv, meta: { kind: 'firejail', sandboxed: true, network: allowNet ? 'allow' : 'none', writable: allow, cwd } };
  }
  if (kind === 'sandbox-exec') {
    // macOS seatbelt: deny everything by default, allow reads broadly and writes
    // only inside the allowlist. Paths are JSON-quoted so spaces survive.
    const q = s => JSON.stringify(String(s));
    const rules = ['(deny default)', '(allow process-exec)', '(allow sysctl-read)', '(allow mach-lookup)', '(allow file-read*)'];
    for (const dir of allow) rules.push(`(allow file-write* (subpath ${q(dir)}))`);
    if (!allowNet) rules.push('(deny network*)');
    return { command: 'sandbox-exec', args: ['-p', rules.join(' '), command, ...args], meta: { kind: 'sandbox-exec', sandboxed: true, network: allowNet ? 'allow' : 'none', writable: allow, cwd } };
  }
  return {
    command,
    args: [...args],
    meta: { kind: 'none', sandboxed: false, network: allowNet ? 'allow' : 'inherit', writable: null, cwd }
  };
}

const NOTICES = {
  bwrap: 'Sandboxed (bwrap): read-only filesystem outside the project directory, no network, private /tmp and PID namespace. '
    + 'Not a jail: ~/.ssh and cloud credentials stay readable, there is no seccomp filter, and no CPU or memory limit.',
  firejail: 'Sandboxed (firejail): read-only filesystem outside the project directory, no network, private /tmp. '
    + 'Not a jail: ~/.ssh and cloud credentials stay readable, and there is no seccomp filter.',
  'sandbox-exec': 'Sandboxed (sandbox-exec): writes confined to the project directory, no network by default. '
    + 'Not a jail: ~/.ssh and cloud credentials stay readable, and no CPU or memory limit is enforced.',
  none: 'NOT SANDBOXED: the command runs with your full permissions and network access.'
};

/** Human-facing summary of what a run_command will actually be allowed to do. */
export function describe(capability, { writable = [], network = 'deny' } = {}) {
  const kind = typeof capability === 'string' ? capability : capability?.kind ?? 'none';
  const allow = [...new Set([...(Array.isArray(writable) ? writable : [])].filter(Boolean))];
  const sandboxed = kind === 'bwrap' || kind === 'firejail' || kind === 'sandbox-exec';
  return {
    mode: kind,
    network: kind === 'none' ? 'inherit' : (network === 'allow' ? 'allow' : 'none'),
    writable: sandboxed ? allow : null,
    notice: NOTICES[kind] ?? NOTICES.none
  };
}
