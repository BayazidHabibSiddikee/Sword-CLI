# Development Plan

## Phase 1: Core Scaffolding ✅ COMPLETED
- [x] Basic Python CLI with subcommands (generate, verify, index)
- [x] LaTeX Jinja2 templates (RUET standard)
- [x] Ngspice integration (batch mode, IV data parsing, plotting)

## Phase 2: AI Integration ✅ COMPLETED
- [x] Custom LLM provider support (Gemini + OpenAI-compatible)
- [x] Dynamic circuit design prompt generation
- [x] Fallback mechanisms for simulation

## Phase 3: LangGraph & Architecture ✅ COMPLETED
- [x] LangGraph state schema with generation + verification nodes
- [x] Config centralized in `settings.json`
- [x] Strict formatting enforcement

## Phase 4: RAG + OCR ✅ COMPLETED
- [x] Hybrid RAG: MiniLM embeddings (FAISS) + BM25 (rank_bm25) + RRF fusion
- [x] OCR pipeline: pdf2image + pytesseract + paddleocr fallback
- [x] Auto-detect scanned PDFs (PyMuPDF text threshold)
- [x] 73 documents indexed (293 chunks) in `rag_index/`
- [x] `convert_store_docs.py` for PDF/DOCX → Markdown (uses web-scraper's markitdown)
- [x] CLI: `main.py index --rebuild --query "..." --top-k N`

## Phase 5: Verification Pipeline ✅ COMPLETED
- [x] 6 validators implemented:
  - `text.py`: repetition (n-gram), word count, tense (spaCy), objectives format
  - `data.py`: LaTeX table parse + ngspice interpolation + relative error (>20% flag)
  - `structure.py`: section bitmap, apparatus/figures/references counts
  - `circuit.py`: netlist-apparatus overlap, schemdraw AST syntax check
  - `references.py`: HTTP HEAD URL validity, domain overlap with research_context
  - `semantics.py`: LLM-as-judge (research + IV + discussion/conclusion → JSON violations)
- [x] Standalone verify CLI: `main.py verify <pdf|run_dir> [--data iv.txt]`
- [x] Auto-verification after generation (saves `verification_report.json`)
- [x] LightGBM classifier (22 features, weak supervision from 73 clean + 297 synthetic = 370 samples)
- [x] Model saved to `models/verifier_classifier.txt` + `feature_names.json`
- [x] ROC-AUC 0.88 on synthetic test, predicts `fail` (91%) on known-bad TRIAC report

## Phase 6: FreeCAD Integration ✅ COMPLETED
- [x] Headless executor: `freecadcmd` subprocess with timeout
- [x] Script validator: AST parse, import/API/export checks
- [x] Synthetic data generator: 10 primitive + 2 boolean templates → parametric variations
- [x] Dataset output: `freecad_training_data/dataset.jsonl` (NL description + FreeCAD script pairs)
- [x] Agent class: iterative design loop (generate → validate → execute → LLM fix)

## Phase 7: Classifier Training on Real Data 🔄 IN PROGRESS
**Current Task**: Train LightGBM on your collected 200 PDFs (with labels if available)

### Immediate Steps:
1. **Prepare training data:**
   ```
   # Option A: Weak supervision (no manual labels)
   python train_classifier.py --input-dir Documents --output-dir models/
   
   # Option B: With manual labels (preferred)
   python train_classifier.py --input-dir Documents --labels-file labels.csv --output-dir models/
   # labels.csv format: filename,label  (label: 0=pass, 1=fail)
   ```

2. **On Kaggle (recommended for 200+ PDFs):**
   - Upload PDFs to Kaggle dataset
   - Create notebook with `train_classifier.py`
   - Run with `--input-dir /kaggle/input/pdfs --output-dir /kaggle/working/models/`
   - Download `verifier_classifier.txt` and `feature_names.json` to `labgen/models/`

3. **Verify new model:**
   ```bash
   python main.py verify runs/triac_characteristics --experiment "TRIAC Characteristics"
   # Should show classifier prediction in output
   ```

## Phase 8: FreeCAD Fine-tuning (Next)
- [ ] LoRA-train Code LLM (DeepSeek-Coder/CodeLlama/Qwen2.5-Coder) on `freecad_training_data/dataset.jsonl`
- [ ] Deploy as local tool-calling agent (ReAct/MCP) via Ollama/vLLM
- [ ] Integrate FreeCAD Agent into LangGraph for mechanical design validation

## Phase 9: Local LLM Migration (Future)
- [ ] Replace Gemini with local model for all LLM calls (circuit, sections, semantics, FreeCAD agent)
- [ ] Fine-tune on LabGen verified-good runs (report generation + circuit design)
- [ ] Add MCP server for FluidSim/web-scraper/FreeCAD tool calling


## Phase 10: Cyberdeck UI & Architecture Overhaul (Audit Remediation) 🔄 IN PROGRESS
- [x] Security: Sandboxed `exec()` in `main.py` and restricted CORS in `server.py`
- [x] Architecture: Configured `VITE_WS_URL`, added global React ErrorBoundary, debounced `localStorage` writes.
- [x] Accessibility (P0): Removed 'AI-slop' aesthetic (scanlines, grid), added global `:focus-visible` ring, fixed `textDim` WCAG contrast.
- [x] Responsive Design (P0): Overhauled fixed `w-96` sidebar to use responsive drawer pattern on mobile, removed boot screen.
- [x] Performance (P0): Fixed terminal layout thrashing by replacing `scrollTop = scrollHeight` with `scrollIntoView()` on an invisible end marker.
- [x] Accessibility (P1/P2): Add ARIA labels, improve touch targets > 44px, heading hierarchy.
- [x] Polish (P3): Remove stray `console.log` statements, add test files, refine spacing.
## Phase 11: 3-Pane IDE Polish & Intervention Backend ✅ COMPLETED
- [x] Wire real Markdown/LaTeX renderer (react-markdown + remark-math + rehype-katex)
- [x] Three.js CAD viewer (native STL support, graceful fallback for WASM formats)
- [x] Intervention backend: Connect `intervention_response` to pause/resume generation subprocess via SIGSTOP/SIGCONT and `asyncio.Event`
- [x] Playwright E2E tests for the frontend generation flow
