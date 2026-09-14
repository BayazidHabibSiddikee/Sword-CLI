# Current State — Character Flow (AGENTIC)

_Last updated: 2025-09-14_

---

## Architecture: Brain + Skills + TUI

Each character is now a full **agentic AI** with:
1. **Brain** (`brain/*.js`) — persona, knowledge base (RAG), and exported skill tool definitions
2. **Skills** (`skills/shared/*` + `skills/agents/*`) — executable functions the LLM can call during conversation
3. **TUI** (`tui_*.js`) — interactive interface with function-calling loop

### Agentic Loop
```
User input → LLM (with tools) → [tool_call? execute & feed back] → LLM → Text response
```
The LLM decides WHEN to use each skill. Up to 5 tool-call iterations per user message.

---

## Completed Characters (10)

| # | Name | Role | Specialized Skills | Tool Count |
|---|------|------|--------------------|------------|
| 1 | Izuku Midoriya | Hero philosopher | web search, books, quotes | 4 |
| 2 | Mahina Artemis | Strategist | manipulation, dance, gym, business | 4 |
| 3 | Muhan Haswaz | Math prof/trader | crypto, stocks, news, trading | 4 |
| 4 | Plastos Jiade | War reporter | crash analysis, debunking, news | 4 |
| 5 | Monk Maecenas | Religious scholar | stories, cross-reference, topics | 4 |
| 6 | Prince Rishad | Manga/novel lover | manga DB, novel DB, comedy | 4 |
| 7 | **Turing Voss** ⭐ | Logic puzzle master | **judge_solution, benchmark_algorithm, solve_math, generate_problem, analyze_complexity** | **5 agent + 7 shared = 12** |
| 8 | **Sable Chen** ⭐ | Pragmatic engineer | **git_log, git_diff, analyze_log, generate_cicd, code_review, project_structure** | **6 agent + 7 shared = 13** |
| 9 | **Dr. Ada Vance** ⭐ | Computational mathematician | **compute_symbolic, compile_latex, verify_proof_step, generate_math_doc** | **4 agent + 7 shared = 11** |
| 10 | **Kael Vector** ⭐ | ML engineer/architect | **train_model_script, calculate_metrics, preprocess_data, analyze_dataset, compare_architectures** | **5 agent + 7 shared = 12** |

---

## Shared Skills (all characters get these)

### `skills/shared/file_ops.js` (7 tools)
- `read_file` — Read any file on disk
- `write_file` — Create/overwrite files (scripts, configs, docs)
- `edit_file` — Replace text in existing files
- `list_dir` — List directory contents recursively
- `search_files` — Glob search for files
- `search_content` — grep-like content search across files
- `get_file_info` — File metadata (size, mtime, type)

### `skills/shared/shell.js` (3 tools)
- `run_command` — Execute shell commands (git, node, python, npm, etc.)
- `run_python` — Run Python scripts or one-liners
- `run_node` — Run Node.js scripts or one-liners

### `skills/shared/crypto_stock.js` (5 tools)
- `get_crypto_price` — Live crypto prices from CoinGecko
- `get_stock_quote` — Live stock prices from Yahoo Finance
- `get_fear_greed_index` — Crypto Fear & Greed Index
- `get_market_cap_rank` — Top coins by market cap
- `get_coin_history` — Historical price data

### `skills/shared/doc_tools.js` (3 tools)
- `docx_to_text` — Extract text from Word documents
- `pdf_to_text` — Extract text from PDFs
- `list_documents` — Find all document files in a directory

### `skills/shared/vault.js` (4 tools)
- `save_note` — Persistent note storage (per-character SQLite)
- `read_note` — Retrieve notes by ID or search
- `list_notes` — Browse vault by category/tag
- `delete_note` — Remove notes

---

## Agent-Specific Skills

### Turing Voss — `skills/agents/turing.js`
| Tool | Description |
|------|-------------|
| `judge_solution` | Run code against test cases, return pass/fail + timing |
| `benchmark_algorithm` | Benchmark sort/search algos across input sizes |
| `solve_math` | Symbolic math via SymPy: derivative, integral, solve, limit |
| `generate_problem` | Generate CP problem with statement + solution |
| `analyze_complexity` | Analyze Big-O of described algorithm |

### Sable Chen — `skills/agents/sable.js`
| Tool | Description |
|------|-------------|
| `git_log` | Show recent commits with filters |
| `git_diff` | Diff between commits or working tree |
| `analyze_log` | Parse log files, extract errors/warnings |
| `generate_cicd` | Generate GitHub Actions / Docker Compose config |
| `code_review` | Static analysis: security, perf, style checks |
| `project_structure` | Tree view of project with file counts |

### Dr. Ada Vance — `skills/agents/ada.js`
| Tool | Description |
|------|-------------|
| `compute_symbolic` | SymPy: simplify, expand, factor, diff, integrate, solve |
| `compile_latex` | Compile LaTeX → PDF with packages |
| `verify_proof_step` | Check if premise implies conclusion symbolically |
| `generate_math_doc` | Generate formatted .tex document from problem + solution |

### Kael Vector — `skills/agents/kael.js`
| Tool | Description |
|------|-------------|
| `train_model_script` | Generate PyTorch/TensorFlow training script |
| `calculate_metrics` | Confusion matrix, accuracy, precision, recall, F1 |
| `preprocess_data` | Normalize, train/test split, handle missing, feature select |
| `analyze_dataset` | Inspect CSV/JSON: shape, columns, preview |
| `compare_architectures` | Parameter count, FLOPs estimate, speed profile |

---

## Running

```bash
cd /home/sword/Documents/Characters/character-flow

# Start freellmapi proxy first
cd ../freellmapi && npx tsx server/src/index.ts

# Then in another terminal:
npm run turing   # Logic + algorithms + code execution
npm run sable    # Git + CI/CD + code review
npm run ada      # Math + LaTeX + symbolic computation
npm run kael     # ML training + evaluation + pipelines
npm run monk     # Religious scholarship
npm run rishad   # Manga/novel comedy
npm run izuku    # Hero philosophy
npm run mahina   # Strategy
npm run muhan    # Trading
npm run plastos  # War reporting
```

In each TUI:
- `/tools` — list all available skills
- `/stats` — show knowledge base stats
- `/clear` — reset conversation
- Natural language requests trigger tools automatically (e.g., "Write a Python script that sorts an array", "Show me the git log", "Compile this LaTeX document")

---

## Verified Working
- All 10 brains export SYSTEM_PROMPT + AGENT_SKILLS
- All 10 TUIs load without errors
- Function calling loop works: LLM → tool_call → execute → LLM → text
- 47 total JS files across brains, skills, TUIs, and seeds
- All seed scripts create populated SQLite databases
- Shared skills (file_ops, shell, crypto_stock, doc_tools, vault) work across all characters
