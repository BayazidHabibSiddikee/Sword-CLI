# Contributing to SwordCLI

Thank you for your interest in contributing to SwordCLI! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before submitting a bug report:
1. Check if the issue already exists in [GitHub Issues](https://github.com/BayazidHabibSiddikee/Sword-CLI/issues)
2. Use the bug report template
2. Include:
   - SwordCLI version (`./sword.mjs --version`)
   - Operating system and Node.js version
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant logs/error messages

### Suggesting Features

Feature requests are welcome! Please:
1. Check if the feature already exists or is planned
2. Describe the problem you're trying to solve
3. Explain why this feature would be useful
4. Consider implementation complexity

### Pull Requests

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make changes** with clear, focused commits
3. **Run tests**: `npm test` (must pass)
4. **Update documentation** if needed
5. **Submit PR** with a clear description

## Development Setup

```bash
# Clone and install
git clone https://github.com/BayazidHabibSiddikee/Sword-CLI.git
cd character-flow
npm install --prefix swordcli

# Run tests
npm test

# Run CLI directly
node cli/flow.js --prompt "hello"

# Run with live reload (for development)
node --watch cli/flow.js --prompt "test"
```

## Code Style

- **TypeScript** for `swordcli/` (run `npm run lint` in `swordcli/`)
- **ES Modules** throughout (`.mjs` or `"type": "module"`)
- **ESLint** + **Prettier** (run `npm run lint` and `npm run format`)
- **Tests**: Write tests for new features in `test/`

### Code Conventions

- **Async/await** over callbacks
- **Explicit error handling** — no silent failures
- **Immutability** — prefer `const`, avoid mutation
- **Pure functions** where possible
- **Explicit types** in JSDoc for complex functions
- **No magic numbers** — use named constants

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new tool for downloading books
fix: fix memory leak in RAG engine
docs: update README with new tool docs
test: add tests for download_book tool
refactor: extract routine logic to cli/routines.js
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
node --test test/cli-tools.test.js

# Run with coverage
npm run test:coverage

# Run specific test pattern
node --test test/routines.test.js
```

### Writing Tests

- Place tests in `test/` directory
- Use Node.js built-in `test` module
- Use `assert` from `node:assert/strict`
- Mock external dependencies (no network in tests)
- Test both success and error paths
- Test edge cases and error conditions

Example test structure:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myFunction } from '../cli/myModule.js';

test('myFunction handles edge case', () => {
  const result = myFunction('input');
  assert.equal(result, 'expected');
});
```

## Project Structure

```
character-flow/
├── cli/                    # Main CLI agent
│   ├── flow.js            # Main entry (REPL, sessions, approvals)
│   ├── agent.js           # Turn loop, provider config, streaming
│   ├── tools.js           # All tool definitions + execution logic
│   ├── prompts.js         # System prompts, personas
│   ├── routines.js        # Standing scheduled tasks
│   ├── mcpManage.js       # MCP server management
│   └── ... (other modules)
├── swordcli/              # Main API server + web UI (TypeScript)
├── sword-server/          # Minimal plain-node API (fallback)
├── test/                  # Test files
├── docs/                  # Architecture docs
└── vendor/                # Vendored skills
```

## Adding New Tools

1. Add tool definition to `cli/tools.js` `toolDefinitions` array
2. Implement execution logic in `run()` function
3. Add to `BUILTIN_TOOL_NAMES` in `cli/mcpConfig.js`
4. Add tests in `test/`
4. Update documentation in `README.md`
5. Run `npm test` to verify

## Tool Design Principles

- **Explicit approval** — mutations require user approval
- **Idempotency** — safe to retry
- **Bounded output** — truncate large outputs
- **Read-before-write** — enforce reading before editing
- **Graceful degradation** — return `{ error }` instead of throwing
- **No silent failures** — explicit errors over silent failures

## Documentation

- Update `README.md` for user-facing changes
- Update `docs/` for architecture changes
- Add JSDoc comments for public APIs
- Update `--help` text for CLI changes

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag vX.Y.Z`
4. Push tag: `git push origin vX.Y.Z`
5. GitHub Actions will build and publish

## Questions?

- Open a [GitHub Discussion](https://github.com/BayazidHabibSiddikee/Sword-CLI/discussions)
- Check existing [Issues](https://github.com/BayazidHabibSiddikee/Sword-CLI/issues)
- Read the [Architecture Docs](docs/)

---

Thank you for contributing to SwordCLI! 🚀