# Current State — Character Flow (LangGraph Agentic AI)

_Last updated: 2025-09-14_

---

## Architecture: LangGraph-Powered Agentic AI

Each character is now a **stateful, multi-turn agentic AI** powered by [LangGraph](https://langchain-ai.github.io/langgraph/) v1.4:

```
START → llm_node → [has tool_calls?] → tool_node → llm_node → … → END
              ↓                            ↑
         MemorySaver checkpoint         (loops until no more tools)
```

### Key Features
- **Multi-turn memory**: Conversations persist across turns via `MemorySaver` checkpointing
- **Tool calling**: LLM decides WHEN to use tools, HOW many times, in what order
- **Streaming**: Real-time chunk output via `/stream` command
- **Human-in-the-loop**: `interrupt()` support for pause/resume workflows
- **State graph**: Each character has its own `StateGraph` with typed state

---

## Dependencies Added
```json
"@langchain/langgraph": "^1.4.15",
"@langchain/core": "^0.3.x",
"@langchain/openai": "^0.4.x"
```

## The Bridge: `skills/bridge.js`
22 real tools calling `~/Documents/projects/tools/` Python scripts + live APIs:
- Crypto/Stock prices (CoinGecko, Yahoo Finance)
- Web search (DuckDuckGo via knowledge_hub.py)
- Math (SymPy via python3 -c)
- Code execution (Python, Node.js, Shell)
- Documents (PDF/DOCX/XLSX conversion)
- Translation (MyMemory API)
- File operations (read/write/list/search)

---

## 10 Characters (All LangGraph-Powered)

| # | Name | Role | Specialized Skills | Total Tools |
|---|------|------|--------------------|------------|
| 1 | Izuku Midoriya | Hero philosopher | web search, books, quotes | 4 |
| 2 | Mahina Artemis | Strategist | manipulation, dance, gym | 4 |
| 3 | Muhan Haswaz | Math prof/trader | crypto, stocks, news | 4 |
| 4 | Plastos Jiade | War reporter | crash analysis, debunking | 4 |
| 5 | Monk Maecenas | Religious scholar | stories, cross-reference | 4 |
| 6 | Prince Rishad | Manga/novel lover | manga DB, novel DB, comedy | 4 |
| 7 | **Turing Voss** ⭐ | Logic puzzle master | judge_solution, benchmark_algorithm, solve_math, generate_problem, analyze_complexity | **27** |
| 8 | **Sable Chen** ⭐ | Pragmatic engineer | git_log, git_diff, analyze_log, generate_cicd, code_review, project_structure | **28** |
| 9 | **Dr. Ada Vance** ⭐ | Computational mathematician | compute_symbolic, compile_latex, verify_proof_step, generate_math_doc | **26** |
| 10 | **Kael Vector** ⭐ | ML engineer/architect | train_model_script, calculate_metrics, preprocess_data, analyze_dataset, compare_architectures | **27** |

---

## How to Run

```bash
cd /home/sword/Documents/Characters/character-flow

# Start freellmapi proxy first
cd ../freellmapi && npx tsx server/src/index.ts

# Then in another terminal:
npm run turing   # LangGraph agent — logic, algorithms, code execution
npm run sable    # LangGraph agent — git ops, CI/CD, code review
npm run ada      # LangGraph agent — symbolic math, LaTeX, proofs
npm run kael     # LangGraph agent — ML training, metrics, pipelines

# In-chat commands:
#   /tools     — list all available skills
#   /stream    — stream mode (real-time chunks)
#   /stats     — show knowledge base stats
#   /clear     — reset conversation memory
```

---

## Verified Working
- ✅ LangGraph StateGraph with MessagesAnnotation
- ✅ MemorySaver checkpointing (multi-turn memory works)
- ✅ Tool calling via OpenAI-compatible API (proxy handles auth)
- ✅ All 4 new characters have 26-28 tools each
- ✅ Streaming works (yields node-level chunks)
- ✅ Real data: live Bitcoin price ($77k), AAPL ($332), web search, Python execution
- ✅ Multi-tool chains: "Get BTC price AND translate to Japanese" works in one turn
- ✅ 47 JS files, 10 SQLite databases, all committed and pushed
