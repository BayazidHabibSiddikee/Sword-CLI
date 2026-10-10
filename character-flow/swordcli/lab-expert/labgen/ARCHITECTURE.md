# LabGen Architecture

LabGen is a **dual-mode pipeline**: Generation + Verification, built on LangGraph with integrated engineering tools.

## Core Components

### 1. Generation Pipeline (LangGraph)
```
START → research_node → circuit_node → draft_node → simulation → assembly → verify → END
```

**Nodes:**
- `research_node`: Hybrid retrieval (local RAG+BM25 + web search via knowledge_hub/DDGS)
- `circuit_node`: LLM designs circuit → netlist + schemdraw code
- `draft_node`: LLM writes report sections (objectives, theory, discussion, conclusion)
- `simulation`: ngspice batch execution → IV data CSV + matplotlib plots
- `assembly`: Jinja2 + tectonic → final PDF
- `verify_node`: 6 validators + LightGBM classifier → verification_report.json

### 2. Verification Pipeline (Standalone + Integrated)
**6 Deterministic Validators:**
| Validator | Method | Output |
|-----------|--------|--------|
| `text.py` | n-gram Jaccard (repetition), spaCy (tense), word count, prefix check | Issues + 5 features |
| `data.py` | LaTeX table parse + ngspice interpolation + relative error | Issues + 4 features |
| `structure.py` | Section bitmap, count checks | Issues + 4 features |
| `circuit.py` | Netlist-apparatus name overlap, AST syntax check | Issues + 2 features |
| `references.py` | HTTP HEAD (URL validity), domain overlap with research | Issues + 2 features |
| `semantics.py` | LLM-as-judge (structured prompt: research + IV + discussion/conclusion) | Issues + 4 features |

**LightGBM Classifier:**
- 22 engineered features from all validators
- Binary classification: pass/fail with probability
- Trained via weak supervision (heuristic labels) or supervised (manual labels)

### 3. RAG + BM25 (Hybrid Retrieval)
- **Dense**: `sentence-transformers/all-MiniLM-L6-v2` (384-dim) → FAISS IndexFlatL2
- **Sparse**: `rank_bm25.BM25Okapi` on tokenized chunks
- **Fusion**: Reciprocal Rank Fusion (RRF, k=60)
- **Index**: 73 documents → 293 chunks, persisted to `rag_index/`

### 4. OCR Pipeline
- **Auto-detect**: PyMuPDF text extraction → if <100 chars/page → scanned
- **Primary**: `pdf2image` (poppler) + `pytesseract` (tesseract-ocr)
- **Fallback**: `paddleocr` (if installed)
- **Output**: Page-level text with char counts, method metadata

### 5. FreeCAD Integration
- **Executor**: `freecadcmd` headless subprocess (timeout configurable)
- **Validator**: AST parse → import check, API patterns, export presence
- **Data Generator**: Parametric templates (primitives + booleans) → (NL, script) pairs
- **Agent**: Iterative design loop (generate → validate → execute → fix via LLM)

## Data Flow

```
User Input (experiment name + circuit prompt)
        │
        ▼
LangGraph Generation Pipeline
        │
        ├── research_context (RAG + web) ──► saved to research_context.json
        ├── circuit_json (netlist, apparatus, schemdraw)
        ├── llm_sections (objectives, theory, discussion, conclusion)
        ├── simulation (iv_data.txt, plots)
        └── assembly (PDF + LaTeX)
        │
        ▼
Verification Pipeline (auto-triggered)
        │
        ├── extract_pdf (OCR-aware) ───► sections, tables, latex_table
        ├── validator checks (6 modules) ──► issues[]
        ├── feature extraction ─────────► 22-dim vector
        ├── LightGBM prediction ────────► pass/fail + probability
        └── verification_report.json
        │
        ▼
Output: runs/{slug}/
  ├── Exp_XX_name.pdf
  ├── Exp_XX_name.tex
  ├── iv_data.txt
  ├── research_context.json
  ├── verification_report.json
  └── figs/ (schematic, plots)
```

## External Integrations

| Tool | Purpose | Interface |
|------|---------|-----------|
| `ngspice` | Circuit simulation | CLI batch mode |
| `freecadcmd` | 3D design validation | CLI headless |
| `tesseract` + `pdf2image` | OCR | CLI via Python |
| `web-scraper` | Image scraping, markitdown | Python module + CLI |
| `knowledge_hub.py` | Web search (BM25 + RAG) | CLI JSON |
| `tectonic` | LaTeX → PDF | CLI |

## Configuration (settings.json)
```json
{
  "llm": { "provider": "custom", "base_url": "...", "api_key": "...", "model": "...", "temperature": 0.2 },
  "verification": { "enabled": true, "classifier_path": "models/verifier_classifier.txt", "threshold": 0.5 },
  "rag": { "enabled": true, "use_web": true, "top_k": 5, "ocr_enabled": true, "ocr_lang": "eng", "ocr_dpi": 200 },
  "freecad": { "enabled": true, "cmd": "freecadcmd", "timeout": 120, "training_data_dir": "freecad_training_data" }
}
```

## LightGBM Feature Vector (22 features)
- Text: repetition_score, intro_words, discussion_words, conclusion_words, tense_violations, objectives_compliance
- Data: table_rows, sim_match_rate, max_rel_error, impossible_values_flag
- Structure: section_bitmap, figure_count, apparatus_count, ref_count
- Circuit: netlist_apparatus_overlap, schemdraw_valid
- References: url_validity_rate, ref_research_overlap
- Semantics: llm_violation_count, llm_high_sev_count, llm_medium_sev_count, llm_physics_error_flag