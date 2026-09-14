#!/usr/bin/env node
/**
 * shell.js — Safe shell command execution for agent characters.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const ALLOWED_CMDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'sed', 'awk', 'sort', 'uniq',
  'git', 'node', 'python3', 'npm', 'npx', 'tsx',
  'chmod', 'chown', 'mkdir', 'cp', 'mv', 'rm', 'touch',
  'curl', 'wget', 'jq', 'sqlite3',
  'which', 'whereis', 'file', 'stat',
]);

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return stdout/stderr. Use for git, node, python, npm, grep, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Full shell command to execute' },
          timeout: { type: 'integer', description: 'Timeout in ms (default 30000)', default: 30000 },
          cwd: { type: 'string', description: 'Working directory (defaults to character workspace)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_python',
      description: 'Run a Python script or one-liner. Useful for data processing, calculations, ML tasks.',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Python code to execute' },
          file: { type: 'string', description: 'Path to a .py file to run instead of inline script' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command-line arguments' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_node',
      description: 'Execute a Node.js script or one-liner.',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Node.js code to execute' },
          file: { type: 'string', description: 'Path to a .js file to run' },
        },
        required: [],
      },
    },
  },
];

export async function execute(toolName, args) {
  if (toolName === 'run_command') {
    const cmd = args.command;
    const baseCmd = cmd.trim().split(' ')[0];
    if (!ALLOWED_CMDS.has(baseCmd) && !cmd.startsWith('#')) {
      return JSON.stringify({ error: `Command '${baseCmd}' is not in the allowed list. Use: ${[...ALLOWED_CMDS].join(', ')}` });
    }
    try {
      const out = execSync(cmd, {
        cwd: args.cwd || process.env.CHARACTER_WORKSPACE || '/home/sword/Documents/Characters/character-flow',
        timeout: args.timeout || 30000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return JSON.stringify({ success: true, stdout: out.trim().slice(0, 4000) });
    } catch (e) {
      const stderr = e.stderr?.toString()?.trim() || e.message;
      return JSON.stringify({ success: false, error: stderr.slice(0, 2000), exitCode: e.status });
    }
  }
  else if (toolName === 'run_python') {
    const ws = '/home/sword/Documents/projects';
    try {
      let cmd = 'python3';
      if (args.file) {
        cmd += ` "${ws}/${args.file}"`;
      } else {
        // Write inline script to temp file
        const tmp = `/tmp/agent_py_${Date.now()}.py`;
        writeFileSync(tmp, args.script);
        cmd += ` ${tmp}`;
      }
      if (args.args) cmd += ' ' + args.args.map(a => `"${a}"`).join(' ');
      const out = execSync(cmd, { timeout: 60000, encoding: 'utf-8', cwd: ws });
      return JSON.stringify({ success: true, stdout: out.trim().slice(0, 4000) });
    } catch (e) {
      return JSON.stringify({ success: false, error: (e.stderr || e.message)?.slice(0, 2000) });
    }
  }
  else if (toolName === 'run_node') {
    try {
      if (args.file) {
        const out = execSync(`node "${args.file}"`, { timeout: 30000, encoding: 'utf-8' });
        return JSON.stringify({ success: true, stdout: out.trim().slice(0, 4000) });
      } else {
        const tmp = `/tmp/agent_node_${Date.now()}.js`;
        writeFileSync(tmp, args.script);
        const out = execSync(`node ${tmp}`, { timeout: 30000, encoding: 'utf-8' });
        return JSON.stringify({ success: true, stdout: out.trim().slice(0, 4000) });
      }
    } catch (e) {
      return JSON.stringify({ success: false, error: (e.stderr || e.message)?.slice(0, 2000) });
    }
  }
  return JSON.stringify({ error: 'Unknown shell skill' });
}
