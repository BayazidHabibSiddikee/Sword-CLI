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
  const mark = ok === false ? chalk.red.bold('✗') : chalk.green.bold('✓');
  const parts = [mark, chalk.bold(name)];
  if (ok === false) parts.push(chalk.red('failed'));
  if (typeof ms === 'number' && Number.isFinite(ms)) parts.push(`${chalk.dim(`${Math.round(ms)}ms`)}`);
  if (typeof summary === 'string' && summary.length > 0) {
    const flat = summary.replace(/\s+/g, ' ').trim();
    parts.push(flat.length > SUMMARY_LIMIT ? chalk.cyan(`${flat.slice(0, SUMMARY_LIMIT - 3)}...`) : chalk.cyan(flat));
  }
  return parts.join(' ');
}

export function friendlyError(error, { aborted = false } = {}) {
  // `aborted` means the turn was cancelled by the user (Ctrl+C), whatever error
  // surfaced it — an AbortError from the request, or the permission error readline
  // throws when an approval prompt is interrupted.
  if (aborted || error?.abortedByUser === true) return CANCELLED;
  if (error?.name === 'TimeoutError') return timeoutMessage(120);
  if (error?.name === 'AbortError') return `Error: ${error?.message ?? error}`;
  return `Error: ${error?.message ?? error}`;
}

// Longest common prefix/suffix, so a one-line edit shows one line, not the whole file.
// Returns LINE indexes; the character offsets are only used to derive them.
function changedRange(before, after) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  let head = 0;
  const maxHead = Math.min(a.length, b.length);
  while (head < maxHead && a[head] === b[head]) head++;
  let tail = 0;
  const maxTail = Math.min(a.length - head, b.length - head);
  while (tail < maxTail && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { start: head, beforeEnd: a.length - tail, afterEnd: b.length - tail };
}

const DIFF_CONTEXT = 3;
const DIFF_MAX_LINES = 24;

export function unifiedDiff(before, after, maxLines = DIFF_MAX_LINES) {
  // A create has no "before" side, so nothing should be reported as removed.
  const creating = before === null || before === undefined;
  if (!creating && before === after) return [];
  const a = creating ? [] : String(before).split('\n');
  const b = after === null || after === undefined ? [] : String(after).split('\n');
  if (creating && b.length === 0) return [];
  const { start, beforeEnd, afterEnd } = creating
    ? { start: 0, beforeEnd: 0, afterEnd: b.length }
    : changedRange(before, after);
  if (start >= beforeEnd && start >= afterEnd) return [];
  const lo = creating ? 0 : Math.max(0, start - DIFF_CONTEXT);
  const hiBefore = Math.min(a.length, beforeEnd + DIFF_CONTEXT);
  const hiAfter = Math.min(b.length, afterEnd + DIFF_CONTEXT);
  const lines = [];
  let ai = lo, bi = lo;
  while (ai < hiBefore || bi < hiAfter) {
    if (ai < hiBefore && bi < hiAfter && a[ai] === b[bi]) { lines.push(`  ${a[ai]}`); ai++; bi++; continue; }
    if (ai < hiBefore) { lines.push(chalk.red(`- ${a[ai]}`)); ai++; }
    if (bi < hiAfter) { lines.push(chalk.green(`+ ${b[bi]}`)); bi++; }
  }
  if (lines.length <= maxLines) return lines;
  const head = Math.ceil(maxLines / 2);
  return [
    ...lines.slice(0, head),
    chalk.dim(`  … ${lines.length - maxLines} more diff lines`),
    ...lines.slice(lines.length - (maxLines - head))
  ];
}

function diffBlock(before, after) {
  const lines = unifiedDiff(before, after);
  if (!lines.length) return [];
  return [chalk.dim('  ───'), ...lines, chalk.dim('  ───')];
}

export function approvePrompt(proposal) {
  const { tool, path: pathName, before = null, after = null, command, args, timeout, batch = false } = proposal;
  const lines = [''];
  // A batched change_many approval shows ONE prompt for the whole atomic unit:
  // one header plus one diff block per file, so the user approves the batch or
  // nothing — never file-by-file.
  if (batch === true && Array.isArray(before) && before.length) {
    lines.push(`  ${chalk.magenta.bold(`apply ${before.length} file(s) as one atomic batch`)}`);
    for (const change of before) {
      if (change?.full) lines.push(`  ${chalk.dim(String(change.full))}`);
      else if (change?.path) lines.push(`  ${chalk.dim(String(change.path))}`);
      lines.push(...diffBlock(change?.before ?? null, change?.after ?? null));
    }
  } else if (tool === 'write_file') {
    const bytes = typeof after === 'string' ? Buffer.byteLength(after, 'utf8') : 0;
    const verb = before === null ? 'create' : 'overwrite';
    lines.push(`  ${chalk.green.bold(verb)} ${chalk.cyan(pathName)} ${chalk.yellow(`(${chalk.cyan(Buffer.byteLength(after, 'utf8'))} bytes)`)}`);
  } else if (tool === 'edit_file') {
    const plus = before ? (after?.match(/\n/g) || []).length - (before.match(/\n/g) || []).length : 0;
    const minus = plus < 0 ? -plus : 0;
    const add = plus > 0 ? chalk.green(`+${plus}`) : '';
    const rem = minus > 0 ? chalk.red(`−${minus}`) : '';
    const delta = add || rem ? ` ${chalk.yellow(`(${add} ${rem})`)}` : '';
    lines.push(`  ${chalk.magenta('edit')} ${chalk.cyan(pathName)}${delta}`);
  } else if (tool === 'run_command') {
    const cmd = [command, ...(Array.isArray(args) ? args : [])].join(' ');
    lines.push(`  ${chalk.blue.bold('run')} ${cmd}`);
    if (timeout != null) lines.push(`  ${chalk.dim(`(timeout ${timeout}ms)`)}`);
  } else if (tool === 'save_to_rag') {
    lines.push(`  ${chalk.blue.bold('save')} to memory: ${chalk.cyan(proposal.title)} ${chalk.dim(`(${proposal.category})`)}`);
  } else {
    lines.push(`  ${chalk.dim(`${tool}: ${JSON.stringify(proposal)}`)}`);
  }
  if (tool === 'write_file' || tool === 'edit_file') lines.push(...diffBlock(before, after));
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
    parts.push(escaped);
    return parts.join('');
  }
  return safe(text);
}

export const KNOWN_COMMANDS = [
  'help', 'clear', 'status', 'exit', 'quit',
  'team', 'team list', 'team add', 'team remove',
  'clear', 'status', 'models', 'provider', 'providers',
  'rag', 'rag add', 'rag search',
  'web', 'download', 'scrape', 'undo',
  // no /tasks here: it is implemented in cli/tui.js only, so flow.js must not suggest it
  'session', 'history', 'brain', 'info', 'provider',
  'model', 'character', 'char', 'c',
  'rag add', 'rag search',
  'download', 'scrape', 'web',
  'help', 'clear', 'status', 'exit', 'quit',
];

export function closestCommand(input) {
  // Special case: "/" alone shows all commands
  if (input === '/') return 'help';
  
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

/**
 * "Thinking…" marker for the REPL, deliberately NOT a TTY spinner.
 *
 * ora clears the frame it drew with `for (index = 0; index < linesToClear; index++)`
 * and sizes that frame from the output stream's `columns`. A terminal that reports
 * `columns = 0` — bare PTYs (Python `pty.openpty()`, `script`), some ssh/tmux/IDE
 * pipes — makes it compute `Math.ceil(width / 0) = Infinity` lines, so the process
 * spins forever writing cursor escapes and never reads stdin again. ora's stdin
 * discarder also puts the TTY in raw mode, which fights readline's own prompt.
 *
 * One plain line, no cursor control, no stdin access, no unbounded loop.
 */
export function thinkingIndicator(stream = process.stderr) {
  let pending = false;
  const indicator = {
    start(text = 'Thinking...') {
      if (!pending) { pending = true; setBottomBar(text, true); }
      return indicator;
    },
    stop() {
      if (pending) { pending = false; setBottomBar(currentText.replace('Thinking...', 'Ready'), false); }
      return indicator;
    }
  };
  return indicator;
}

export function banner(opts) {
  const { mode, model, cwd, session, revision } = opts;
  const lines = [];
  lines.push(`  ${chalk.cyan.bold('⚔ SwordCLI')}  ${chalk.magenta(mode)}  ${chalk.yellow(model)}`);
  lines.push(`  ${chalk.dim('cwd:')}      ${chalk.cyan(cwd)}`);
  if (session) {
    if (revision != null) lines.push(`  ${chalk.dim('session:')} ${session} ${chalk.dim(`(rev ${revision})`)}`);
    else lines.push(`  ${chalk.dim('session:')} ${session}`);
  } else {
    lines.push(`  ${chalk.dim('session:')} ${chalk.yellow('(local | ephemeral)')}`);
  }
  lines.push(`  ${chalk.dim('contact:')} ${chalk.cyan('bayazid@med.com.bd')}`);
  lines.push('');
  return lines.join('\n');
}

// ── Status Bar / Bottom Bar (Persistent TUI) ─────────────────────────────────

let isTUI = false;
let currentText = '';
let barInterval = null;
let tick = 0;
let isThinking = false;
let currentFace = '(•_•)';

const thinkingFaces = ['(O_o)', '(o_O)'];
const idleFaces = ['(•_•)', '(-_-)', '(<_<)', '(>_>)', '(^_-)', '(>_<)'];

function updateFace() {
  if (isThinking) {
    currentFace = chalk.cyan(thinkingFaces[(Math.floor(tick / 4)) % thinkingFaces.length]);
  } else {
    if (tick % 25 === 0) {
      currentFace = Math.random() > 0.4 ? idleFaces[Math.floor(Math.random() * idleFaces.length)] : '(•_•)';
    } else if (currentFace === '(-_-)' && tick % 25 === 2) {
      currentFace = '(•_•)'; // quick blink
    } else if (currentFace === '(^_-)' && tick % 25 === 4) {
      currentFace = '(•_•)'; // quick wink
    } else if (currentFace === '(>_<)' && tick % 25 === 6) {
      currentFace = '(•_•)'; // quick wince
    }
  }
}

function drawBottomBar() {
  if (!isTUI || !process.stderr.isTTY) return;
  const rows = process.stderr.rows;
  const cols = process.stderr.columns;
  if (!rows || !cols) return;
  
  const text = ` ${currentFace} ${currentText} `;
  // pad to full width
  const visibleLength = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').length;
  const padded = text + ' '.repeat(Math.max(0, cols - visibleLength));
  
  // Save cursor, go to bottom line, print, restore
  process.stderr.write(`\x1b7\x1b[${rows};1H\x1b[2K\x1b[44m\x1b[37m${padded}\x1b[0m\x1b8`);
}

export function initBottomBar() {
  if (!process.stderr.isTTY) return;
  isTUI = true;
  const rows = process.stderr.rows;
  process.stderr.write(`\x1b[1;${rows - 1}r`); // Reserve bottom line
  
  process.stderr.on('resize', () => {
    if (!isTUI) return;
    const r = process.stderr.rows;
    process.stderr.write(`\x1b[1;${r - 1}r`);
    drawBottomBar();
  });
  
  barInterval = setInterval(() => {
    tick++;
    updateFace();
    drawBottomBar();
  }, 100);
}

export function setBottomBar(text, thinking = false) {
  currentText = text;
  isThinking = thinking;
  drawBottomBar();
}

export function destroyBottomBar() {
  if (!isTUI) return;
  isTUI = false;
  if (barInterval) clearInterval(barInterval);
  if (process.stderr.isTTY) {
    const rows = process.stderr.rows;
    process.stderr.write(`\x1b[r\x1b[${rows};1H\x1b[2K`); // Reset scroll region and clear bottom line
  }
}

process.on('exit', destroyBottomBar);
process.on('SIGINT', () => {
  destroyBottomBar();
  process.exit(0);
});
