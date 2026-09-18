#!/usr/bin/env node
/**
 * sword-cli — FreeLLMAPI's agentic terminal client.
 * Interactive chat against /api/agent with live token streaming, tool-event
 * display, sandboxed file/shell/video tools, MCP tools, TTS status
 * narration, and character personas.
 *
 * Usage:
 *   sword-cli [--workdir <dir>] [--title <t>] [--model <id|auto>] [--session <id>]
 *             [--character <name|id>] [--voice on|off]
 *
 * Env:
 *   SWORDCLI_BASE_URL   server base URL (default http://127.0.0.1:3001)
 *   SWORDCLI_TOKEN      optional Bearer token (FREELLMAPI_BASE_URL / FREELLMAPI_TOKEN still work)
 *
 * Slash commands:
 *   /sessions           list sessions
 *   /new <workdir>      create a fresh session
 *   /model <id|auto>    pin (or unpin) the session model
 *   /character <name>   switch persona + voice (lists available when bare)
 *   /voice <on|off>     toggle TTS status narration
 *   /tools              show this session's tool catalog
 *   /status             show session settings
 *   /quit               exit
 *
 * Zero external dependencies (Node 18+ fetch/AbortController/spawn).
 */
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import path from 'node:path';

const BASE = (process.env.SWORDCLI_BASE_URL ?? process.env.FREELLMAPI_BASE_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const TOKEN = process.env.SWORDCLI_TOKEN ?? process.env.FREELLMAPI_TOKEN;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let VOICE_ON = false;
let sessionVoice = 'en-gb';

/** Fire-and-forget TTS. Queues behind a single active utterance; drops when busy. */
let speaking = false;
function speak(text, voice = sessionVoice) {
  if (!VOICE_ON || !text || speaking) return;
  speaking = true;
  const child = spawn('espeak-ng', ['-v', voice, text.slice(0, 200)], {
    stdio: ['ignore', 'pipe', 'ignore'],
    detached: false,
  });
  const bail = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    speaking = false;
  }, 8000);
  child.on('close', () => {
    clearTimeout(bail);
    speaking = false;
  });
  child.on('error', () => {
    clearTimeout(bail);
    speaking = false;
  });
}

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? res.json() : res.text();
}

async function listSessions() {
  const { data } = await api('GET', '/api/agent/sessions');
  const rows = data.sessions ?? [];
  if (rows.length === 0) {
    console.log(c.dim('No sessions yet. Use /new <workdir> to create one.'));
    return;
  }
  rows.forEach((s, i) => {
    const model = s.model ? c.cyan(s.model) : c.dim('auto');
    const char = s.character ? c.yellow(`👤 ${s.character}`) : '';
    console.log(
      `${c.bold(`[${i}]`)} ${s.id.slice(0, 8)}  ${model.padEnd(16)} ${String(s.messageCount ?? 0).padStart(4)} msgs  ${char}  ${s.workdir}${s.title ? `  ${c.dim(s.title)}` : ''}`,
    );
  });
}

async function createSession(body) {
  const { data } = await api('POST', '/api/agent/sessions', body);
  return data;
}

async function patchSession(id, body) {
  const { data } = await api('PATCH', `/api/agent/sessions/${id}`, body);
  return data;
}

/** Stream a chat message; render tokens live and tool events as compact lines. */
async function chat(session, content, ctrl) {
  const res = await fetch(`${BASE}/api/agent/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal: ctrl.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    console.log(c.red(`Request failed: HTTP ${res.status} ${text.slice(0, 200)}`));
    speak(`Request failed, ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let textOpen = false;
  let currentAnswer = '';
  const toolStartTimes = new Map();

  const flushText = () => {
    if (currentAnswer) process.stdout.write('\n');
    currentAnswer = '';
    textOpen = false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6));
      for (const raw of dataLines) {
        let ev;
        try {
          ev = JSON.parse(raw);
        } catch {
          continue;
        }
        switch (ev.type) {
          case 'start':
            if (session.character) speak(`Working, ${session.character}`);
            break;
          case 'token':
            if (!textOpen) {
              flushText();
              textOpen = true;
            }
            currentAnswer += ev.delta;
            process.stdout.write(ev.delta);
            break;
          case 'tool_call': {
            flushText();
            toolStartTimes.set(ev.id, Date.now());
            const args = JSON.stringify(ev.arguments);
            const shown = args.length > 120 ? `${args.slice(0, 120)}…` : args;
            process.stdout.write(`\n${c.yellow(`⚙ ${ev.name}`)} ${c.dim(shown)}\n`);
            if (['run_shell', 'video_edit', 'speak'].includes(ev.name)) speak(`Using ${ev.name}`);
            break;
          }
          case 'tool_result': {
            const t0 = toolStartTimes.get(ev.id);
            const ms = t0 ? `(${(((Date.now() - t0) / 1000).toFixed(1))}s)` : '';
            const badge = ev.ok ? c.green('ok') : c.red('fail');
            const preview = (ev.preview ?? '').split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 200);
            process.stdout.write(`${c.dim('  ↳')} ${badge} ${c.dim(ms)} ${preview ? c.dim(preview) : ''}\n`);
            break;
          }
          case 'done':
            flushText();
            process.stdout.write(c.dim(`\n— done in ${ev.turns} turn(s)\n`));
            speak('Done');
            break;
          case 'error':
            flushText();
            const msg = `error: ${ev.error}${ev.hint ? ` ${ev.hint}` : ''}`;
            process.stdout.write(c.red(msg) + '\n');
            speak('Error');
            break;
        }
      }
    }
  }
  flushText();
}

async function listCharacters() {
  const { data } = await api('GET', '/api/agent/characters');
  for (const ch of data.characters ?? []) {
    console.log(`  ${c.cyan(ch.name.padEnd(14))} ${c.dim(`${ch.voice} — ${ch.hint}`)}`);
  }
}

// ---- main loop --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const getFlag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const voiceFlag = getFlag('--voice');
  if (voiceFlag === 'on') VOICE_ON = true;
  if (voiceFlag === 'off') VOICE_ON = false;

  let session;
  if (getFlag('--session')) {
    session = await api('GET', `/api/agent/sessions/${getFlag('--session')}`).then((r) => r.data);
  } else {
    const workdir = getFlag('--workdir') ?? '.';
    session = await createSession({
      workdir: path.resolve(workdir),
      title: getFlag('--title'),
      model: getFlag('--model') ?? null,
      character: getFlag('--character') ?? null,
    });
  }

  sessionVoice = session.voice || 'en-gb';
  console.log(
    `${c.bold('⚔ sword-cli — FreeLLMAPI Agent')}\n` +
      `session ${c.cyan(session.id.slice(0, 8))} · workdir ${session.workdir} · model ${session.model ?? 'auto'}` +
      `${session.character ? ` · ${c.yellow(`character: ${session.character}`)}` : ''}\n` +
      `${c.dim('Commands: /sessions /new <dir> /model <id|auto> /character <name> /voice on|off /tools /status /quit\n')}`,
  );
  speak('Sword CLI ready', sessionVoice);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
  let stdinClosed = false;
  rl.on('close', () => { stdinClosed = true; });
  const ask = () =>
    new Promise((resolve) => {
      if (stdinClosed) return resolve(null);
      try {
        rl.question(c.cyan('you > '), (a) => {
          if (stdinClosed) resolve(null);
          else resolve(a.trim());
        });
      } catch {
        // readline already closed — treat as EOF.
        resolve(null);
      }
    });

  let current = session;
  while (true) {
    const input = await ask();
    if (stdinClosed || input === null) break;
    if (!input) continue;

    if (input === '/quit' || input === '/exit') break;
    try {
      if (input === '/sessions') {
        await listSessions();
        continue;
      }
      if (input === '/tools') {
        const { data } = await api('GET', `/api/agent/sessions/${current.id}/tools`);
        for (const t of data.tools ?? []) console.log(`  ${t.name.padEnd(24)} ${c.dim(t.source)}`);
        continue;
      }
      if (input === '/status') {
        const { data } = await api('GET', `/api/agent/sessions/${current.id}`);
        console.log(
          JSON.stringify(
            {
              id: data.id, title: data.title, workdir: data.workdir, model: data.model ?? 'auto',
              character: data.character ?? null, voice: data.voice || 'en-gb',
              max_turns: data.max_turns, tool_deny: data.tool_deny, shell_timeout_ms: data.shell_timeout_ms,
            },
            null, 2,
          ),
        );
        continue;
      }
      if (input.startsWith('/model ')) {
        const m = input.slice(7).trim();
        const model = m === 'auto' ? null : m;
        current = await patchSession(current.id, { model });
        console.log(c.dim(`model → ${model ?? 'auto'}`));
        continue;
      }
      if (input === '/character') {
        await listCharacters();
        continue;
      }
      if (input.startsWith('/character ')) {
        const name = input.slice(11).trim();
        current = await patchSession(current.id, { character: name });
        const { data } = await api('GET', '/api/agent/characters');
        const ch = (data.characters ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name);
        sessionVoice = ch?.voice ?? current.voice ?? 'en-gb';
        console.log(c.green(`character → ${ch ? ch.name : name} (${sessionVoice})`));
        speak(`I am ${ch?.name ?? name}`, sessionVoice);
        continue;
      }
      if (input === '/voice') {
        VOICE_ON = !VOICE_ON;
        console.log(c.dim(`voice narration ${VOICE_ON ? 'on' : 'off'}`));
        continue;
      }
      if (input.startsWith('/voice ')) {
        VOICE_ON = input.slice(7).trim() === 'on';
        console.log(c.dim(`voice narration ${VOICE_ON ? 'on' : 'off'}`));
        continue;
      }
      if (input.startsWith('/new ')) {
        const wd = path.resolve(input.slice(5).trim() || '.');
        current = await createSession({ workdir: wd, model: getFlag('--model') ?? null });
        console.log(c.green(`new session ${current.id.slice(0, 8)} → ${current.workdir}`));
        continue;
      }
      if (input.startsWith('/')) {
        console.log(c.dim('Unknown command. Try /sessions /new /model /character /voice /tools /status /quit'));
        continue;
      }

      // Regular chat turn.
      const ctrl = new AbortController();
      process.stdout.write(c.dim('\nagent: '));
      await chat(current, input, ctrl);
      process.stdout.write('\n');
    } catch (err) {
      console.log(c.red(`error: ${err.message}`));
      if (/fetch failed|ECONNREFUSED/.test(err.message)) {
        console.log(c.dim(`Is the server running at ${BASE}? (start: cd freellmapi/server && npm run dev, or pass SWORDCLI_BASE_URL)`));
      }
      if (err.message?.includes('404')) {
        console.log(c.dim(`That server at ${BASE} doesn't have /api/agent routes — it's likely a stale dev server.`));
        console.log(c.dim(`Find it with: ss -ltnp | grep 3001  →  kill <pid>, then restart: cd freellmapi/server && npm run dev`));
      }
    }
  }
  rl.close();
}

main().catch((err) => {
  const msg = String(err?.message ?? err);
  console.error(c.red(msg));
  if (msg.includes('404')) {
    console.error(c.dim(`That server at ${BASE} doesn't have /api/agent routes — it's likely a stale dev server.`));
    console.error(c.dim(`Find it: ss -ltnp | grep 3001 → kill <pid>, then restart: cd freellmapi/server && npm run dev`));
  }
  process.exit(1);
});
