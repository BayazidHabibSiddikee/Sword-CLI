import { spawn } from 'node:child_process';
import type { AgentTool } from '../types.js';

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;

export const DEFAULT_SHELL_TIMEOUT_MS = 120_000;

export const shellTools: AgentTool[] = [
  {
    name: 'run_shell',
    description:
      'Run a shell command inside the session workdir (the working directory is the workdir; use cd only within it). Captures combined stdout/stderr, the exit code, and duration. The command is killed at its timeout (default 120s, per-session cap applies). Use for builds, tests, git, and any task the file tools cannot do.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command line to execute (runs via /bin/sh -c)' },
        timeoutMs: {
          type: 'number',
          description: 'Optional per-call timeout in ms, capped at the session shell_timeout_ms.',
        },
      },
      required: ['command'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const command = argText(args, 'command');
      if (!command) return { ok: false, text: 'run_shell: missing required argument "command"' };
      const cap = ctx.shellTimeoutMs > 0 ? ctx.shellTimeoutMs : DEFAULT_SHELL_TIMEOUT_MS;
      const requested = Number(args.timeoutMs);
      const timeoutMs = Math.min(requested > 0 ? requested : cap, cap);

      const { ok, text } = await runShellCaptured(command, ctx.workdir, timeoutMs, ctx.signal);
      return { ok, text };
    },
  },
];

export interface ShellOutput {
  ok: boolean;
  text: string;
}

/** Run `command` with /bin/sh -c in `cwd`, capturing output. Non-zero exit is
 *  still ok:true for the *tool* (the model reads the exit code and decides),
 *  but the output is flagged so the agent notices. */
export function runShellCaptured(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ShellOutput> {
  return new Promise((resolve) => {
    // We do NOT use spawn's built-in `timeout` (it kills without a marker and
    // races our own bookkeeping); our timer below both flags and kills.
    // `detached` makes the shell its own process-group leader on POSIX so a
    // timeout/abort can kill the whole group — otherwise detached children the
    // command spawned (`sleep 25 &`, background daemons) would survive.
    const posix = process.platform !== 'win32';
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...process.env },
      detached: posix,
    });
    let out = '';
    let timedOut = false;
    const push = (s: string) => {
      out += s;
      // Bound memory on chatty commands.
      if (out.length > 512 * 1024) out = out.slice(0, 512 * 1024);
    };
    child.stdout?.on('data', (d) => push(String(d)));
    child.stderr?.on('data', (d) => push(String(d)));
    const killGroup = (): void => {
      if (child.pid === undefined) return;
      if (posix) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return;
        } catch {
          /* group already gone — fall through to single-process kill */
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const onAbort = (): void => {
      killGroup();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      out += `\n[command timed out after ${timeoutMs}ms and was killed]`;
      killGroup();
    }, timeoutMs);

    child.on('error', (err) => {
      cleanup();
      resolve({ ok: false, text: `run_shell: failed to start: ${err.message}` });
    });
    child.on('close', (code, sig) => {
      cleanup();
      if (signal.aborted) {
        resolve({ ok: false, text: `run_shell: aborted by user\n${out.slice(-20_000)}` });
        return;
      }
      if (timedOut) {
        resolve({ ok: false, text: out.trim() || '(no output)' });
        return;
      }
      const status = code === 0 ? `exit 0` : `exit ${code ?? sig}`;
      const body = out.trim() || '(no output)';
      resolve({ ok: code === 0, text: `[${status}]\n${body}` });
    });

    function cleanup() {
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    }
  });
}
