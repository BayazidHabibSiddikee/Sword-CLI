# Current State — Character Flow (REAL AGENTIC AI)

_Last updated: 2025-09-14_

---

## Architecture: Real Tools, Real Data, Real Execution

Each character is a full **agentic AI** that can:
1. **Talk** via LLM (agnes-2.5-flash through freellmapi proxy)
2. **Think** with domain-specific knowledge (RAG + specialist skills)
3. **Act** with 22+ real tools calling actual Python scripts from `~/Documents/projects/tools/`
4. **Execute** Python code, shell commands, Node.js scripts directly
5. **Search** the web, fetch live prices, convert documents, translate text

### Agentic Loop
```
User → LLM (with tool definitions) → [tool_call? execute real Python → feed back] → LLM → Text response
```
Up to 5 tool-call iterations per message. Tools are REAL — not mocks.

---

## The Bridge: `skills/bridge.js`

A single 22-tool bridge that calls real Python from `~/Documents/projects/tools/`:

| Tool | Backend | What It Does |
|------|---------|-------------|
| `get_crypto_price` | `crypto_data.py` → CoinGecko API | Live BTC/ETH/SOL prices |
| `get_stock_quote` | `stock_data.py` → Yahoo Finance | AAPL/TSLA/Meta real-time quotes |
| `get_top_coins` | CoinGecko API | Top 10 cryptos by market cap |
| `calculate` | Python math module | sqrt(144), pow(2,8), sin(3.14) |
| `solve_math` | SymPy (via Python) | Symbolic diff, integrate, solve |
| `convert_units` | `student_tools.py` | km↔mi, kg↔lb, C↔F, bytes↔GB |
| `docx_to_pdf` | `office_tools.py` → mammoth+pymupdf | Word → PDF conversion |
| `pdf_to_text` | `office_tools.py` → pymupdf | Extract text from any PDF |
| `xlsx_to_pdf` | `office_tools.py` → pandas+pymupdf | Excel → multi-page PDF |
| `merge_pdfs` | `office_tools.py` → pymupdf | Combine multiple PDFs |
| `search_web` | `knowledge_hub.py` → DuckDuckGo | Real web search with titles/URLs |
| `scrape_url` | Node fetch | Fetch any webpage as plain text |
| `download_file` | Node fetch + fs | Download URL → local file |
| `translate` | MyMemory API | English → 100+ languages |
| `run_python` | subprocess | Execute ANY Python code |
| `run_node` | subprocess | Execute ANY Node.js code |
| `run_shell` | subprocess | Run git/npm/find/grep/ls etc |
| `read_file` | fs.readFileSync | Read any file under ~/Documents/ |
| `write_file` | fs.writeFileSync | Create/edit files with auto-mkdir |
| `list_dir` | fs.readdirSync | Recursive directory listing |
| `find_files` | fs walk + glob | Find files matching patterns |
| `grep_content` | fs walk + regex | Search text inside all files |

---

## 10 Characters (All Agentic)

| # | Name | Role | Specialized Skills | Total Tools |
|---|------|------|--------------------|------------|
| 1 | Izuku Midoriya | Hero philosopher | web search, books, quotes | 4 |
| 2 | Mahina Artemis | Strategist | manipulation, dance, gym | 4 |
| 3 | Muhan Haswaz | Math prof/trader | crypto, stocks, news | 4 |
| 4 | Plastos Jiade | War reporter | crash analysis, debunking | 4 |
| 5 | Monk Maecenas | Religious scholar | stories, cross-reference | 4 |
| 6 | Prince Rishad | Manga/novel lover | manga DB, novel DB, comedy | 4 |
| 7 | **Turing Voss** ⭐ | Logic puzzle master | judge_solution, benchmark_algorithm, generate_problem, analyze_complexity | **22 shared + 5 = 27** |
| 8 | **Sable Chen** ⭐ | Pragmatic engineer | git_log, git_diff, analyze_log, generate_cicd, code_review, project_structure | **22 shared + 6 = 28** |
| 9 | **Dr. Ada Vance** ⭐ | Computational mathematician | compute_symbolic, compile_latex, verify_proof_step, generate_math_doc | **22 shared + 4 = 26** |
| 10 | **Kael Vector** ⭐ | ML engineer/architect | train_model_script, calculate_metrics, preprocess_data, analyze_dataset, compare_architectures | **22 shared + 5 = 27** |

---

## Source Repos Used (Real Tools)

```
~/Documents/projects/tools/          ← 41 Python tools (the REAL power)
├── stock_data.py        ← Live stock quotes (Yahoo Finance)
├── crypto_data.py       ← Live crypto prices (CoinGecko)
├── doc_tools.py         ← DOCX↔PDF, XLSX→PDF conversion
├── office_tools.py      ← Full document suite (merge, split, convert)
├── student_tools.py     ← QR codes, unit conversion, calculator
├── knowledge_hub.py     ← Web search, weather, flood data, scraping
├── stealth_browser.py   ← WAF-aware web scraping
├── translate.py         ← Multi-language translation
├── swordwatch.py        ← Process monitoring
├── vault_manager.py     ← Per-agent persistent storage
└── ... (20+ more)

~/Documents/browser-use/     ← Headless browser automation agent
~/Documents/web-scraper/     ← Scrapling-based web scraper
~/Documents/freellmapi/      ← LLM proxy (port 3001, agnes-2.5-flash)
```

---

## Running

```bash
cd /home/sword/Documents/Characters/character-flow

# Start freellmapi proxy first
cd ../freellmapi && npx tsx server/src/index.ts

# Then in another terminal:
npm run turing   # 27 tools — judge solutions, solve math, run Python, search web
npm run sable    # 28 tools — git ops, log analysis, CI/CD, code review
npm run ada      # 26 tools — symbolic math, LaTeX compile, proof verification
npm run kael     # 27 tools — train ML models, calculate metrics, preprocess data

# Also available:
npm run izuku    npm run monk    npm run rishad
npm run mahina   npm run muhan   npm run plastos
```

### In-Chat Commands
- `/tools` — list all available skills
- `/stats` — show knowledge base stats  
- `/clear` — reset conversation
- Natural language triggers tools: *"What's Bitcoin price?"*, *"Search for React 19 news"*, *"Convert 100km to miles"*, *"Run Python code that calculates factorial(10)"*

---

## Verified Working
- All 10 brains export SYSTEM_PROMPT + AGENT_SKILLS
- All 10 TUIs load with 26-28 tools each
- Bridge returns REAL data: live crypto ($77k BTC), live stocks ($332 AAPL), real web search results
- Python execution works: numpy arrays, factorial, complex math
- Shell execution works: git log, ls, find, grep
- Document conversion works: PDF extraction, DOCX processing
- Translation works: EN→ES, EN→FR, EN→JA
- 47 total JS files across brains, skills, TUIs, seeds
- All seed scripts create populated SQLite databases
- Git committed and pushed to `BayazidHabibSiddikee/character-flow.git`
