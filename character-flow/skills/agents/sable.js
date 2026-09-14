#!/usr/bin/env node
/**
 * sable.js — Sable Chen: Pragmatic Engineering Skills
 * Git operations, log analysis, CI/CD templates, code review.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASE = process.env.CHARACTER_WORKSPACE || '/home/sword/Documents/Characters/character-flow';

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show recent git commits with short hash, author, date, and message.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository path (default: current workspace)', default: '.' },
          limit: { type: 'integer', description: 'Number of commits', default: 10 },
          author: { type: 'string', description: 'Filter by author name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show differences between working tree and last commit, or between two commits.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository path' },
          target: { type: 'string', description: 'Commit hash or branch to diff against' },
          file: { type: 'string', description: 'Specific file to diff' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_log',
      description: 'Parse a log file and extract errors, warnings, and summary statistics.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to log file' },
          level: { type: 'string', enum: ['error', 'warn', 'info', 'debug', 'all'], default: 'error' },
          lines: { type: 'integer', description: 'Max lines to analyze', default: 500 },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_cicd',
      description: 'Generate a CI/CD pipeline config (GitHub Actions, GitLab CI, or Docker Compose).',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['github-actions', 'gitlab-ci', 'docker-compose'], default: 'github-actions' },
          language: { type: 'string', description: 'Project language: node, python, go, rust' },
          tests: { type: 'boolean', description: 'Include test step', default: true },
          deploy: { type: 'boolean', description: 'Include deployment step', default: false },
        },
        required: ['platform', 'language'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_review',
      description: 'Perform a static analysis review of a code file. Checks for common issues.',
      parameters: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to file to review' },
          checks: { type: 'array', items: { type: 'string' }, description: 'Check types: security, style, perf, logic', default: ['security', 'perf'] },
        },
        required: ['filepath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'project_structure',
      description: 'Show the directory structure of a project as a tree with file counts.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Project root path', default: '.' },
          depth: { type: 'integer', description: 'Max directory depth', default: 3 },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Directories to exclude', default: ['node_modules', '.git', '__pycache__', 'dist', 'build'] },
        },
      },
    },
  },
];

async function runCmd(cmd, cwd = BASE, timeout = 30000) {
  try {
    const out = execSync(cmd, { cwd, timeout, encoding: 'utf-8' });
    return { success: true, stdout: out.trim().slice(0, 5000) };
  } catch (e) {
    return { success: false, error: (e.stderr || e.message)?.slice(0, 2000), exitCode: e.status };
  }
}

export async function execute(toolName, args) {
  if (toolName === 'git_log') {
    const repo = path.resolve(BASE, args.repo || '.');
    const limit = args.limit || 10;
    const authorFilter = args.author ? `--author="${args.author}"` : '';
    const result = await runCmd(`git log --oneline --pretty=format:"%h %an %ad %s" --date=short ${authorFilter} -n ${limit}`, repo);
    return JSON.stringify(result);
  }
  else if (toolName === 'git_diff') {
    const repo = path.resolve(BASE, args.repo || '.');
    const target = args.target ? `${args.target}..HEAD` : 'HEAD';
    const fileArg = args.file ? ` -- ${args.file}` : '';
    const result = await runCmd(`git diff ${target}${fileArg}`, repo);
    return JSON.stringify(result);
  }
  else if (toolName === 'analyze_log') {
    const resolved = path.resolve(BASE, args.filepath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `Log file not found: ${resolved}` });
    const lines = fs.readFileSync(resolved, 'utf-8').split('\n').slice(-args.lines).filter(Boolean);
    const errors = lines.filter(l => /\bERROR\b|\bfail(?:ed|ure)?\b|\bexception\b|\btraceback\b/i.test(l)).slice(0, 20);
    const warnings = lines.filter(l => /\bWARN\b|\bwarning\b/i.test(l)).slice(0, 20);
    const info = lines.filter(l => /\bINFO\b/i.test(l)).length;
    const total = lines.length;
    return JSON.stringify({
      total_lines_analyzed: total,
      errors: { count: errors.length, samples: errors.slice(0, 5) },
      warnings: { count: warnings.length, samples: warnings.slice(0, 5) },
      info_lines: info,
      summary: total > 0 ? `${errors.length} errors, ${warnings.length} warnings in ${total} lines` : 'No lines matched',
    });
  }
  else if (toolName === 'generate_cicd') {
    const lang = args.language || 'node';
    if (args.platform === 'github-actions') {
      const config = {
        node: `name: CI\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm ci\n      ${args.tests ? '- run: npm test' : ''}\n      ${args.deploy ? '- run: npm run deploy' : ''}`,
        python: `name: CI\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: pip install -r requirements.txt\n      ${args.tests ? '- run: pytest' : ''}\n      ${args.deploy ? '- run: deploy.sh' : ''}`,
        go: `name: CI\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.22'\n      - run: go build ./...\n      ${args.tests ? '- run: go test ./...' : ''}`,
      };
      return JSON.stringify({ platform: 'github-actions', language: lang, config: config[lang] || config.node });
    }
    else if (args.platform === 'docker-compose') {
      return JSON.stringify({
        platform: 'docker-compose',
        config: `version: '3.8'\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - NODE_ENV=production\n    restart: unless-stopped\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:`,
      });
    }
    return JSON.stringify({ error: 'Unsupported platform' });
  }
  else if (toolName === 'code_review') {
    const resolved = path.resolve(BASE, args.filepath);
    if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
    const content = fs.readFileSync(resolved, 'utf-8');
    const issues = [];
    const checks = args.checks || ['security', 'perf'];
    if (checks.includes('security')) {
      if (/eval\(|exec\(|child_process/i.test(content)) issues.push({ severity: 'high', line: 'N/A', issue: 'Potentially dangerous eval/exec or child_process usage detected' });
      if (/password\s*=\s*["'][^"']+["']/i.test(content)) issues.push({ severity: 'high', line: 'N/A', issue: 'Hardcoded password detected' });
      if (/api[_-]?key|secret|token\s*=\s*["'][^"']+["']/i.test(content)) issues.push({ severity: 'medium', line: 'N/A', issue: 'Possible hardcoded API key or token' });
    }
    if (checks.includes('perf')) {
      if (/for.*in.*range\(len\(.*\)\)/.test(content)) issues.push({ severity: 'low', line: 'N/A', issue: 'Potential O(n²) loop pattern detected' });
      if (content.split('\n').length > 500) issues.push({ severity: 'info', line: 'N/A', issue: 'File exceeds 500 lines — consider splitting into modules' });
    }
    if (checks.includes('style')) {
      const blankLines = content.split('\n').filter(l => l.trim() === '').length;
      if (blankLines / content.split('\n').length > 0.3) issues.push({ severity: 'info', issue: 'High ratio of blank lines (>30%)' });
    }
    return JSON.stringify({
      file: resolved,
      lines: content.split('\n').length,
      issues_found: issues.length,
      issues,
      verdict: issues.length === 0 ? 'CLEAN' : issues.some(i => i.severity === 'high') ? 'NEEDS_ATTENTION' : 'MINOR_ISSUES',
    });
  }
  else if (toolName === 'project_structure') {
    const root = path.resolve(BASE, args.root || '.');
    const excludeDirs = new Set(args.exclude || ['node_modules', '.git', '__pycache__', 'dist', 'build']);
    let depth = args.depth || 3;
    const lines = [];
    function walk(dir, indent, d) {
      if (d > depth) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && excludeDirs.has(entry.name)) continue;
        const prefix = '  '.repeat(indent) + (entry.isDirectory() ? '📁 ' : '📄 ');
        lines.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`);
        if (entry.isDirectory()) walk(fullPath, indent + 1, d + 1);
      }
    }
    walk(root, 0, 0);
    return JSON.stringify({ root, tree: lines.join('\n'), depth });
  }
  return JSON.stringify({ error: 'Unknown Sable skill' });
}
