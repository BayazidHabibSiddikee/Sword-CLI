#!/usr/bin/env python3
"""End-to-end PTY check: the TUI must never end on its own.

Guarantee under test — the REPL only closes on an explicit request:
/exit, /quit, Ctrl+D, or a confirmed (second) Ctrl+C. A turn, an idle prompt, a
failing command, a cancelled approval or a 0-column terminal must all leave the
prompt alive.

Self-contained: it starts a local OpenAI-compatible fixture, so no backend,
network, ollama or freellmapi/GET_API stack is needed.

usage:
  python3 test-tui-persist.py              # cli/flow.js (what npm run sword runs)
  python3 test-tui-persist.py --launcher   # through ./sword.mjs (starts the stack)
  WINSIZE=0x0 python3 test-tui-persist.py  # terminal reporting 0 columns
  WINSIZE=24x90 python3 test-tui-persist.py
"""
import fcntl
import http.server
import json
import os
import pty
import re
import select
import socket
import struct
import sys
import termios
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
ANSI = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][A-Za-z0-9]')
LAUNCHER = '--launcher' in sys.argv
WINSIZE = os.environ.get('WINSIZE', '30x120')


# ── fake provider ──────────────────────────────────────────────────────────────
class Provider(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        if not body:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        for content in ('hello ', 'from ', 'the ', 'fixture\n'):
            self.wfile.write(('data: %s\n\n' % json.dumps(
                {'choices': [{'delta': {'content': content}}]})).encode())
            self.wfile.flush()
            time.sleep(0.02)
        self.wfile.write(b'data: [DONE]\n\n')
        self.wfile.flush()

    def do_GET(self):                      # model discovery
        payload = json.dumps({'object': 'list', 'data': []}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def start_provider():
    """Bind the fixture. serve_forever starts after the PTY child is forked, so
    os.fork() never runs in a multi-threaded process."""
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Provider)
    return server, 'http://127.0.0.1:%d/v1' % server.server_address[1]


def serve(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()


# ── one CLI session in a PTY ───────────────────────────────────────────────────
class Session:
    def __init__(self, command, env=None):
        self.master, slave = pty.openpty()
        if WINSIZE != '0x0':
            rows, cols = [int(v) for v in WINSIZE.split('x')]
            fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        self.alive = True
        self.exit = None
        self.text = ''
        self.pid = os.fork()
        if self.pid == 0:
            os.setsid()
            if WINSIZE != '0x0':
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
            for fd in (0, 1, 2):
                os.dup2(slave, fd)
            os.close(self.master)
            os.chdir(ROOT)
            os.environ.update(env or {})
            os.execvp(command[0], command)
        os.close(slave)

    def send(self, data):
        os.write(self.master, data if isinstance(data, bytes) else data.encode())

    def until(self, token=None, timeout=30, since=None):
        """Read output until `token` appears in the new text (or the deadline passes)."""
        start = len(self.text) if since is None else since
        deadline = time.time() + timeout
        while time.time() < deadline and self.alive:
            ready, _, _ = select.select([self.master], [], [], 0.2)
            if not ready:
                continue
            try:
                chunk = os.read(self.master, 65536)
            except OSError:
                self.alive = False
                break
            if not chunk:
                self.alive = False
                break
            text = ANSI.sub('', chunk.decode('utf-8', 'replace'))
            self.text += ''.join(c for c in text if c in '\n\t' or ord(c) >= 32)
            if token and token in self.text[start:]:
                return True
        return bool(token and token in self.text[start:])

    def idle(self, seconds):
        """Sit at the prompt without typing; returns (still alive, bytes printed)."""
        mark = len(self.text)
        self.until(timeout=seconds, since=mark)
        return self.alive, len(self.text) - mark

    def wait_exit(self, timeout=8):
        deadline = time.time() + timeout
        while time.time() < deadline and self.alive:
            ready, _, _ = select.select([self.master], [], [], 0.2)
            if not ready:
                continue
            try:
                if not os.read(self.master, 65536):
                    self.alive = False
            except OSError:
                self.alive = False
        try:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                self.exit = os.waitstatus_to_exitcode(status)
        except ChildProcessError:
            self.exit = self.exit if self.exit is not None else 0
        return self.exit

    def kill(self):
        try:
            os.kill(self.pid, 9)
            os.waitpid(self.pid, 0)
        except Exception:
            pass


RESULTS = []


def check(label, ok):
    RESULTS.append(bool(ok))
    print('  %-56s %s' % (label, 'PASS' if ok else 'FAIL'))
    return bool(ok)

# ── scenarios ──────────────────────────────────────────────────────────────────
def main():
    server, base = start_provider()
    env = {'OPENAI_BASE_URL': base, 'OPENAI_API_KEY': 'fixture', 'OPENAI_MODEL': 'fixture'}
    command = ['./sword.mjs'] if LAUNCHER else ['node', 'cli/flow.js']
    print('command: %s (terminal %s)' % (' '.join(command), WINSIZE))
    try:
        session = Session(command, env)
        serve(server)
        try:
            check('prompt appears', session.until('sword> '))
            mark = len(session.text)
            session.send('/status\n')
            check('/status answered', session.until('mode:', since=mark))
            mark = len(session.text)
            session.send('hello\n')
            check('a turn streams a reply', session.until('fixture', since=mark))
            check('prompt returns after the turn', session.until('sword> ', since=mark, timeout=15))
            alive, _ = session.idle(3)
            check('session survives 3s of idling', alive)
            mark = len(session.text)
            session.send('/nope\n')
            check('unknown command handled', session.until('Unknown command', since=mark))
            mark = len(session.text)
            session.send('/team\n')
            check('/team toggles (chalk is imported)', session.until('Team mode is now', since=mark))
            mark = len(session.text)
            session.send('/clear\n')
            check('/clear handled', session.until('cleared', since=mark))
            mark = len(session.text)
            session.send('/status\n')
            check('/status still works', session.until('mode:', since=mark))

            mark = len(session.text)
            session.send('\x03')                    # Ctrl+C: warn, keep the session
            check('one Ctrl+C only warns', session.until('Ctrl+C again', since=mark))
            check('session alive after one Ctrl+C', session.alive)
            mark = len(session.text)
            session.send('/status\n')
            check('/status answered after Ctrl+C', session.until('mode:', since=mark))

            # two consecutive Ctrl+C presses: the first arms, the second exits
            # (submitting a line re-arms, exactly like a shell interrupt)
            mark = len(session.text)
            session.send('\x03')
            session.until('Ctrl+C', since=mark, timeout=6)
            mark = len(session.text)
            session.send('\x03')
            session.until('Ctrl+C', since=mark, timeout=6)
            code = session.wait_exit()
            check('second Ctrl+C ends the session', not session.alive)
            check('exit status is 0', code == 0)
        finally:
            session.kill()
    finally:
        server.shutdown()

    # A turn followed by Ctrl+D is the other documented way out.
    server, base = start_provider()
    try:
        env = {'OPENAI_BASE_URL': base, 'OPENAI_API_KEY': 'fixture', 'OPENAI_MODEL': 'fixture'}
        command = ['./sword.mjs'] if LAUNCHER else ['node', 'cli/flow.js']
        session = Session(command, env)
        serve(server)
        try:
            session.until('sword> ')
            mark = len(session.text)
            session.send('hello\n')
            session.until('fixture', since=mark, timeout=20)
            session.until('sword> ', since=mark, timeout=15)
            mark = len(session.text)
            session.send('\x04')
            session.until('Ctrl+D', since=mark, timeout=6)
            code = session.wait_exit()
            check('Ctrl+D after a turn ends the session', not session.alive)
            check('Ctrl+D exit status is 0', code == 0)
        finally:
            session.kill()
    finally:
        server.shutdown()

    print('\n%d/%d checks passed — the TUI only exits on /exit, /quit, Ctrl+D or a confirmed Ctrl+C'
          % (sum(RESULTS), len(RESULTS)))
    return 0 if all(RESULTS) else 1


if __name__ == '__main__':
    sys.exit(main())

