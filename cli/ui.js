import { performance } from 'node:perf_hooks';
import { stripVTControlCharacters } from 'node:util';
import chalk from 'chalk';

const CANCELLED = 'Cancelled.';
export const safe = text => stripVTControlCharacters(String(text)).replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '');

const CANCELLED_OUTPUT = `  ${CANCELLED}`;

export function cancelMessage() {
  return CANCELLED_OUTPUT;
}

export function timeoutMessage(seconds = 120) {
  return `  Provider request timed out after ${seconds} s — retry, or /clear to start fresh.`;
}

const SUMMARY_LIMIT = 60;

export function toolLine(name, info = {}) {
  const { ok, ms, summary } = info;
  const mark = ok === false ? chalk.yellow('✗') : chalk.cyan('✓');
  const parts = [mark, String(name)];
  if (ok === false) parts.push(chalk.dim('failed'));
  if (typeof ms === 'number' && Number.isFinite(ms)) parts.push(`${chalk.dim(`${Math.round(ms)}ms`)}`);
  if (typeof summary === 'string' && summary.length > 0) {
    const flat = summary.replace(/\s+/g, ' ').trim();
    parts.push(flat.length > SUMMARY_LIMIT ? `${flat.slice(0, SUMMARY_LIMIT - 3)}...` : flat);
  }
  return parts.join(' ');
}

export function friendlyError(error, { aborted = false } = {}) {
  if (error?.name === 'AbortError' && aborted) return CANCELLED;
  if (error?.name === 'TimeoutError') return timeoutMessage(120);
  if (error?.name === 'AbortError') return `Error: ${error?.message ?? error}`;
  return `Error: ${error?.message ?? error}`;
}

export function approvePrompt(proposal) {
  const { tool, path: pathName, before = null, after = null, command, args, timeout } = proposal;
  const lines = [''];
  if (tool === 'write_file') {
    const bytes = typeof after === 'string' ? Buffer.byteLength(after, 'utf8') : 0;
    const verb = before === null ? 'create' : 'overwrite';
    lines.push(`  ${chalk.yellow(`${verb} ${pathName} (${bytes} bytes)`)}`);
  } else if (tool === 'edit_file') {
    const plus = before ? (after?.match(/\n/g) || []).length - (before.match(/\n/g) || []).length : 0;
    const minus = plus < 0 ? -plus : 0;
    const add = plus > 0 ? `+${plus}` : '';
    const rem = minus > 0 ? `−${minus}` : '';
    const delta = add || rem ? ` ${chalk.yellow(`(${add} ${rem})`)}` : '';
    lines.push(`  ${chalk.yellow(`edit ${pathName}`)}${delta}`);
  } else if (tool === 'run_command') {
    const cmd = [command, ...(Array.isArray(args) ? args : [])].join(' ');
    lines.push(`  ${chalk.yellow(`run ${cmd}`)}`);
    if (timeout != null) lines.push(`  ${chalk.dim(`(timeout ${timeout}ms)`)}`);
  } else if (tool === 'save_to_rag') {
    lines.push(`  ${chalk.yellow(`save to memory: ${proposal.title}`)} ${chalk.dim(`(${proposal.category})`)}`);
  } else {
    lines.push(`  ${chalk.dim(`${tool}: ${JSON.stringify(proposal)}`)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function statusLine(opts) {
  const { mode, model, cwd, session, revision, historyCount, approval } = opts;
  const lines = [];
  lines.push('');
  lines.push(`  ${chalk.dim('mode:')}      ${mode}`);
  lines.push(`  ${chalk.dim('model:')}     ${model}`);
  lines.push(`  ${chalk.dim('cwd:')}       ${cwd}`);
  if (session) {
    if (revision != null) lines.push(`  ${chalk.dim('session:')}   ${session} (rev ${revision})`);
    else lines.push(`  ${chalk.dim('session:')}   ${session}`);
  } else {
    lines.push(`  ${chalk.dim('session:')}   (local | ephemeral)`);
  }
  lines.push(`  ${chalk.dim('contact:')}   bayazid@med.com.bd`);
  lines.push(`  ${chalk.dim('history:')}   ${historyCount} message(s)`);
  lines.push(`  ${chalk.dim('approvals:')} ${approval}`);
  lines.push('');
  return lines.join('\n');
}

export function markdownLite(text, interactive) {
  if (!text) return '';
  if (interactive) {
    let escaped = String(text);
    const parts = [];
    let i = 0;
    while (i < escaped.length) {
      if (escaped.slice(i, i + 3) === '```') {
        const rest = escaped.slice(i + 3);
        const nl = rest.indexOf('\n');
        const block = nl === -1 ? '' : rest.slice(0, nl + 1);
        if (block) {
          parts.push('\n' + block);
          i += 6 + block.length;
          continue;
        }
      }
      if (escaped[i] === '`') {
        const close = escaped.indexOf('`', i + 1);
        if (close !== -1) {
          const before = escaped.slice(0, i);
          const inside = escaped.slice(i + 1, close);
          const after = escaped.slice(close + 1);
          parts.push(before);
          parts.push(`${chalk.dim('`')}${chalk.cyan(inside)}${chalk.dim('`')}`);
          i = 0;
          escaped = after;
          continue;
        }
      }
      i++;
    }
    parts.unshift(escaped);
    return parts.join('');
  }
  return safe(text);
}

export const KNOWN_COMMANDS = ['help', 'clear', 'status', 'exit'];

export function closestCommand(input) {
  const lower = input.toLowerCase().slice(1);
  let best = null;
  let bestScore = 0;
  for (const cmd of KNOWN_COMMANDS) {
    let score = 0;
    if (cmd.includes(lower) || lower.includes(cmd)) score = Math.max(score, 2);
    for (let j = 0; j < Math.min(cmd.length, lower.length); j++) {
      if (cmd[j] === lower[j]) score++;
    }
    if (score > bestScore) { bestScore = score; best = cmd; }
  }
  return best;
}

export function elapsed(startedAt) {
  return performance.now() - startedAt;
}

export function summarizeResult(result) {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.error === 'string') return result.error;
  if ('timedOut' in result && result.timedOut) return 'timeout';
  if ('signal' in result && result.signal) return `signal=${result.signal}`;
  if ('exitCode' in result) return `exit=${result.exitCode ?? '?'}`;
  if (typeof result.path === 'string') return result.path;
  if (typeof result.content === 'string') return result.content;
  if (typeof result.url === 'string') return result.url;
  if (typeof result.markdown === 'string') return result.markdown;
  return '';
}

export function banner(opts) {
  const { mode, model, cwd, session, revision } = opts;
  const lines = [];
  lines.push(`  ${chalk.cyan('SwordCLI')} · ${mode} · ${model}`);
  lines.push(`  ${chalk.dim('cwd:')} ${cwd}`);
  if (session) {
    if (revision != null) lines.push(`  ${chalk.dim('session:')} ${session} (rev ${revision})`);
    else lines.push(`  ${chalk.dim('session:')} ${session}`);
  } else {
    lines.push(`  ${chalk.dim('session:')} (local | ephemeral)`);
  }
  lines.push(`  ${chalk.dim('contact:')} bayazid@med.com.bd`);
  lines.push('');
  return lines.join('\n');
}
