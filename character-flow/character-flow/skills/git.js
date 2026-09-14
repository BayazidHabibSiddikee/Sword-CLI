/**
 * git.js — Full Git operations skill for character-flow agents.
 * Mirrors opencode's git capabilities: status, diff, add, commit, push, log, branch, PR ops.
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// ── Helpers ─────────────────────────────────────────────────────────────────────
function safeExec(cmd, cwd = process.cwd(), timeout = 30000) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: out.trim(), stderr: '' };
  } catch (e) {
    return {
      ok: false,
      stdout: (e.stdout || '').trim(),
      stderr: (e.stderr || e.message || '').slice(0, 3000),
      exitCode: e.status,
    };
  }
}

function resolveRepoDir(input) {
  if (!input) return process.cwd();
  const p = path.resolve(input);
  if (fs.existsSync(path.join(p, '.git'))) return p;
  // walk up looking for .git
  let dir = p;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return p;
}

// ── Tool definitions ────────────────────────────────────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show working tree status — staged, unstaged, untracked files. Use before any commit.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Path to git repo (defaults to cwd)' },
          short: { type: 'boolean', default: false, description: 'Use --short format' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show changes between working tree and index, or between commits. Use to review what will be committed.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          staged: { type: 'boolean', default: false, description: 'Show staged changes (--staged)' },
          commit: { type: 'string', description: 'Show diff against a specific commit (e.g. HEAD~1)' },
          file: { type: 'string', description: 'Limit diff to a single file' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for commit. Use --all to stage everything, or specify individual files/patterns.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          all: { type: 'boolean', default: false, description: 'Stage all changes including untracked' },
          files: { type: 'array', items: { type: 'string' }, description: 'Specific files to stage' },
          pattern: { type: 'string', description: 'Glob pattern to stage (e.g. "*.test.js")' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit staged changes with a message. Follows conventional commits: feat:, fix:, docs:, chore:, refactor:',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          message: { type: 'string', description: 'Commit message (required)' },
          amend: { type: 'boolean', default: false, description: 'Amend last commit instead of creating new one' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push committed changes to remote. Creates branch if needed with -u flag.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          force: { type: 'boolean', default: false, description: 'Force push (dangerous, only for your own branches)' },
          set_upstream: { type: 'boolean', default: true, description: 'Set upstream tracking on first push' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show commit history. Supports limiting entries, filtering by author, and showing stats.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          limit: { type: 'integer', default: 20, description: 'Number of commits to show' },
          author: { type: 'string', description: 'Filter by author name' },
          stat: { type: 'boolean', default: false, description: 'Include file-level change stats' },
          branch: { type: 'string', description: 'Show commits on a specific branch' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description: 'List, create, switch, or delete branches. Use current to see active branch.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          action: {
            type: 'string',
            enum: ['list', 'current', 'create', 'switch', 'delete', 'rename'],
            description: 'Branch action',
          },
          name: { type: 'string', description: 'Branch name (for create/switch/delete/rename)' },
          track: { type: 'string', description: 'Remote tracking branch to create from' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_checkout',
      description: 'Restore files from the index or a commit. Use to discard local changes or restore specific files.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          file: { type: 'string', description: 'File path to restore' },
          all: { type: 'boolean', default: false, description: 'Discard all unstaged changes' },
          commit: { type: 'string', description: 'Restore file from a specific commit' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_stash',
      description: 'Stash or apply stashed changes. Use before switching branches with uncommitted work.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          action: { type: 'string', enum: ['save', 'pop', 'list', 'drop'], default: 'save' },
          message: { type: 'string', description: 'Stash message (for save)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_pull',
      description: 'Fetch and merge/pull changes from remote. Use before pushing to avoid conflicts.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          rebase: { type: 'boolean', default: false, description: 'Use rebase instead of merge' },
          strategy: { type: 'string', enum: [' ours', 'theirs'], description: 'Conflict resolution strategy for -X' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_remote',
      description: 'Show or manage git remotes. Use to check origin URL or add new remotes.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          action: { type: 'string', enum: ['list', 'add', 'remove', 'set-url'], default: 'list' },
          name: { type: 'string', description: 'Remote name (default: origin)' },
          url: { type: 'string', description: 'Remote URL (for add/set-url)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_pr_create',
      description: 'Create a GitHub pull request via gh CLI. Requires gh authenticated.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'GitHub repo (owner/repo or path)' },
          title: { type: 'string', description: 'PR title (required)' },
          body: { type: 'string', description: 'PR body/description' },
          base: { type: 'string', default: 'main', description: 'Target branch' },
          draft: { type: 'boolean', default: false, description: 'Create as draft PR' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_pr_list',
      description: 'List open pull requests in a repo. Filter by state, author, or label.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          limit: { type: 'integer', default: 10 },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_blame',
      description: 'Show who last modified each line of a file. Useful for understanding code ownership.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          file: { type: 'string', description: 'Relative file path' },
          line_range: { type: 'array', items: { type: 'integer' }, description: '[start, end] line range' },
        },
        required: ['file'],
      },
    },
  },
];

// ── Executor ────────────────────────────────────────────────────────────────────
export async function execute(toolName, args) {
  const repo = resolveRepoDir(args.repo);
  const env = { ...process.env, LANG: 'C', LC_ALL: 'C' };

  // Helper wrapper around safeExec
  const run = (cmd) => safeExec(cmd, repo, 15000);

  // ── status ──
  if (toolName === 'git_status') {
    const flags = args.short ? '--short' : '-sb';
    const r = run(`git status ${flags}`);
    return JSON.stringify({ repo, status: r.ok ? r.stdout : r.stderr });
  }

  // ── diff ──
  if (toolName === 'git_diff') {
    let cmd = 'git diff';
    if (args.staged) cmd += ' --staged';
    if (args.commit) cmd += ` ${args.commit}`;
    if (args.file) cmd += ` -- "${args.file}"`;
    const r = run(cmd);
    return JSON.stringify({ repo, diff: r.ok ? r.stdout : r.stderr });
  }

  // ── add ──
  if (toolName === 'git_add') {
    let cmd = 'git add';
    if (args.all) { cmd += ' -A'; }
    else if (args.pattern) { cmd += ` "${args.pattern}"`; }
    else if (args.files?.length) { cmd += ' ' + args.files.map(f => `"${f}"`).join(' '); }
    else { cmd += ' -u'; } // default: staged modified + new, not deleted
    const r = run(cmd);
    return JSON.stringify({ repo, action: 'add', result: r.ok ? 'done' : r.stderr });
  }

  // ── commit ──
  if (toolName === 'git_commit') {
    if (!args.message) return JSON.stringify({ error: 'message is required' });
    let cmd = `git commit ${args.amend ? '--amend --no-edit' : ''} -m "${args.message.replace(/"/g, '\\"')}"`;
    const r = run(cmd);
    if (r.ok) {
      // get the new commit hash
      const h = run('git rev-parse HEAD');
      return JSON.stringify({
        repo, action: 'commit', ok: true,
        hash: h.ok ? h.stdout.slice(0, 8) : null,
        message: args.message,
      });
    }
    return JSON.stringify({ repo, action: 'commit', ok: false, error: r.stderr });
  }

  // ── push ──
  if (toolName === 'git_push') {
    let cmd = 'git push';
    if (args.set_upstream) cmd += ' -u origin';
    if (args.force) cmd += ' --force';
    const r = run(cmd);
    return JSON.stringify({ repo, action: 'push', ok: r.ok, result: r.ok ? r.stdout : r.stderr });
  }

  // ── log ──
  if (toolName === 'git_log') {
    let cmd = `git log --oneline --decorate --graph --color=never -n ${args.limit || 20}`;
    if (args.author) cmd += ` --author="${args.author}"`;
    if (args.branch) cmd += ` ${args.branch}`;
    if (args.stat) cmd += ' --stat';
    const r = run(cmd);
    return JSON.stringify({ repo, log: r.ok ? r.stdout : r.stderr });
  }

  // ── branch ──
  if (toolName === 'git_branch') {
    const action = args.action;
    if (action === 'list') {
      const r = run('git branch -a --color=never');
      return JSON.stringify({ repo, branches: r.ok ? r.stdout.split('\n').filter(Boolean) : [] });
    }
    if (action === 'current') {
      const r = run('git rev-parse --abbrev-ref HEAD');
      return JSON.stringify({ repo, current_branch: r.ok ? r.stdout : 'unknown' });
    }
    if (action === 'create') {
      let cmd = `git branch "${args.name}"`;
      if (args.track) cmd += ` "${args.track}"`;
      const r = run(cmd);
      return JSON.stringify({ repo, action: 'branch-create', ok: r.ok, name: args.name });
    }
    if (action === 'switch') {
      const r = run(`git checkout "${args.name}"`);
      return JSON.stringify({ repo, action: 'checkout', ok: r.ok, branch: args.name, error: r.ok ? null : r.stderr });
    }
    if (action === 'delete') {
      const r = run(`git branch -D "${args.name}"`);
      return JSON.stringify({ repo, action: 'branch-delete', ok: r.ok, name: args.name });
    }
    if (action === 'rename') {
      const r = run(`git branch -m "${args.name}"`);
      return JSON.stringify({ repo, action: 'branch-rename', ok: r.ok, name: args.name });
    }
    return JSON.stringify({ error: 'Unknown branch action' });
  }

  // ── checkout ──
  if (toolName === 'git_checkout') {
    if (args.all) {
      const r = run('git checkout -- .');
      return JSON.stringify({ repo, action: 'discard-all', ok: r.ok });
    }
    if (args.file) {
      let cmd = `git checkout -- "${args.file}"`;
      if (args.commit) cmd = `git checkout ${args.commit} -- "${args.file}"`;
      const r = run(cmd);
      return JSON.stringify({ repo, action: 'restore-file', ok: r.ok, file: args.file });
    }
    return JSON.stringify({ error: 'Specify --all or --file' });
  }

  // ── stash ──
  if (toolName === 'git_stash') {
    if (args.action === 'save') {
      const msg = args.message ? `-m "${args.message}"` : '';
      const r = run(`git stash push ${msg}`);
      return JSON.stringify({ repo, action: 'stash-save', ok: r.ok });
    }
    if (args.action === 'pop') {
      const r = run('git stash pop');
      return JSON.stringify({ repo, action: 'stash-pop', ok: r.ok });
    }
    if (args.action === 'list') {
      const r = run('git stash list --pretty=format:"%h %gd %ai %s"');
      return JSON.stringify({ repo, stashes: r.ok ? r.stdout.split('\n').filter(Boolean) : [] });
    }
    if (args.action === 'drop') {
      const r = run('git stash drop');
      return JSON.stringify({ repo, action: 'stash-drop', ok: r.ok });
    }
    return JSON.stringify({ error: 'Unknown stash action' });
  }

  // ── pull ──
  if (toolName === 'git_pull') {
    let cmd = args.rebase ? 'git pull --rebase' : 'git pull';
    const r = run(cmd);
    return JSON.stringify({ repo, action: 'pull', ok: r.ok, result: r.ok ? r.stdout : r.stderr });
  }

  // ── remote ──
  if (toolName === 'git_remote') {
    if (args.action === 'list') {
      const r = run('git remote -v');
      return JSON.stringify({ repo, remotes: r.ok ? r.stdout : '' });
    }
    if (args.action === 'add' && args.url) {
      const r = run(`git remote add "${args.name || 'origin'}" "${args.url}"`);
      return JSON.stringify({ repo, action: 'remote-add', ok: r.ok });
    }
    if (args.action === 'remove') {
      const r = run(`git remote remove "${args.name || 'origin'}"`);
      return JSON.stringify({ repo, action: 'remote-remove', ok: r.ok });
    }
    if (args.action === 'set-url' && args.url) {
      const r = run(`git remote set-url "${args.name || 'origin'}" "${args.url}"`);
      return JSON.stringify({ repo, action: 'remote-set-url', ok: r.ok });
    }
    return JSON.stringify({ error: 'Unknown remote action' });
  }

  // ── PR create ──
  if (toolName === 'git_pr_create') {
    if (!args.title) return JSON.stringify({ error: 'title is required' });
    let cmd = `gh pr create --title "${args.title.replace(/"/g, '\\"')}"`;
    if (args.body) cmd += ` --body "${args.body.replace(/"/g, '\\"')}"`;
    if (args.base) cmd += ` --base ${args.base}`;
    if (args.draft) cmd += ' --draft';
    if (args.repo) cmd += ` --repo ${args.repo}`;
    const r = run(cmd);
    return JSON.stringify({ repo, action: 'pr-create', ok: r.ok, url: r.ok ? r.stdout : r.stderr });
  }

  // ── PR list ──
  if (toolName === 'git_pr_list') {
    let cmd = `gh pr list --state ${args.state || 'open'} -L ${args.limit || 10}`;
    if (args.repo) cmd += ` --repo ${args.repo}`;
    const r = run(cmd);
    const lines = r.ok ? r.stdout.split('\n').filter(l => l && !l.startsWith('----')) : [];
    constprs = lines.map(l => {
      const parts = l.trim().split(/\s+/);
      return { number: parts[0]?.replace('#',''), state: parts[1], title: parts.slice(2).join(' '), author: parts[parts.length-1] };
    }).filter(p => p.number);
    return JSON.stringify({ repo, prs: prs });
  }

  // ── blame ──
  if (toolName === 'git_blame') {
    if (!args.file) return JSON.stringify({ error: 'file is required' });
    let cmd = `git blame --line-porcelain "${args.file}"`;
    if (args.line_range) cmd = `git blame -L ${args.line_range[0]},${args.line_range[1]} --line-porcelain "${args.file}"`;
    const r = run(cmd);
    // Parse porcelain output into readable format
    const lines = r.ok ? r.stdout.split('\n') : [];
    const parsed = [];
    for (const line of lines) {
      if (line.startsWith('author ')) {
        const author = line.replace('author ', '');
        if (parsed.length > 0) parsed[parsed.length-1].author = author;
      } else if (line.match(/^\d+/)) {
        const [, lineno] = line.match(/^(\d+)/) || [];
        if (lineno && parsed.length < 50) {
          parsed.push({ line: parseInt(lineno), author: '', content: '' });
        }
      } else if (line && !line.startsWith('(') && parsed.length > 0) {
        parsed[parsed.length - 1].content = line;
      }
    }
    return JSON.stringify({ repo, file: args.file, blame: parsed.slice(0, 50) });
  }

  return JSON.stringify({ error: `Unknown git tool: ${toolName}` });
}
