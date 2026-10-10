# LabGen 3-Pane IDE Architecture - Implementation Plan

## Overview
Transform the current cyberdeck-style UI into a professional 3-pane IDE workspace for multi-agent engineering workflows.

## Architecture

### Layout Structure (CSS Grid)
```
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE TRACKER (fixed top) - 4 stages horizontal            │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  LEFT PANE   │        CENTER WORKSPACE                          │
│  (320px)     │        (flex-1)                                  │
│              │                                                  │
│  Inputs &    │  ┌────────────────────────────────────────────┐  │
│  Parameters  │  │  Live Preview / 3D Viewer                  │  │
│              │  │  - Markdown/LaTeX render                   │  │
│              │  │  - WebGL CAD viewer (Three.js)             │  │
│              │  │  - Tabbed: Preview | Code | 3D             │  │
│              │  └────────────────────────────────────────────┘  │
│              │                                                  │
├──────────────┴──────────────────────────────────────────────────┤
│  BOTTOM TERMINAL (resizable, 200px default)                    │
│  - Raw stdout/stderr streaming                                  │
│  - Stage-filtered logs                                          │
│  - Human-in-the-loop intervention prompts                       │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline Stages (Top Bar)
1. **Heuristic Gating** - LightGBM classification confidence
2. **Physics Simulation** - ngspice iterations / FluidSIM metrics
3. **CAD Compilation** - CadQuery script → STEP/FCStd
4. **Report Synthesis** - LLM formatting results

### Left Pane: Inputs & Parameters
- **Accordion 1: Administrative Metadata** (collapsed by default)
  - Student Name, Roll Number, Section, Group
- **Accordion 2: Experiment Configuration** (expanded)
  - Experiment Name, Experiment Number
- **Accordion 3: Technical Constraints** (expanded)
  - Circuit Description (textarea)
  - Boundary Conditions (key-value pairs)
  - CAD Dimensional Parameters (key-value pairs)
- **Generate Button** (fixed bottom of pane)

### Center Workspace: Live Output
- **Tabbed Interface:**
  1. **Preview** - Markdown/LaTeX real-time render (KaTeX)
  2. **Code** - Raw LaTeX/Markdown source with syntax highlighting
  3. **3D Viewer** - Three.js WebGL canvas for CAD geometry (STEP/FCStd)
- **Asset Drawer** (right slide-out): Modular export buttons

### Bottom Terminal: Execution Logs
- **Resizable** (drag handle, min 100px, max 80vh)
- **Stage Filter** - buttons to filter by pipeline stage
- **Raw Stream** - stdout/stderr from backend
- **Intervention Mode** - highlighted prompts when pipeline halts

### Backend WebSocket Protocol Updates
```json
// Pipeline stage events
{ "type": "stage_start", "stage": "heuristic|physics|cad|report", "data": {...} }
{ "type": "stage_progress", "stage": "...", "progress": 0-100, "data": {...} }
{ "type": "stage_complete", "stage": "...", "data": {...} }
{ "type": "stage_error", "stage": "...", "error": "...", "recoverable": true }
{ "type": "intervention_required", "stage": "...", "prompt": "...", "params": [...] }
{ "type": "asset_ready", "assets": [{ "type": "pdf|fcstd|net|csv", "path": "...", "label": "..." }] }
```

## Implementation Phases

### Phase 1: Backend Protocol & Types (Day 1)
- [ ] Extend WebSocket message types in `useWebSocket.ts`
- [ ] Update `server.py` to emit stage events
- [ ] Add intervention handling endpoint

### Phase 2: Layout & Pipeline Tracker (Day 1-2)
- [ ] CSS Grid layout in `App.tsx`
- [ ] Pipeline tracker component (4 nodes, animated transitions)
- [ ] Responsive breakpoints (mobile: stack panes)

### Phase 3: Left Pane - Inputs (Day 2)
- [ ] Accordion components for metadata/constraints
- [ ] Form validation per section
- [ ] Generate button with loading state

### Phase 4: Center Workspace (Day 2-3)
- [ ] Tabbed preview component
- [ ] Markdown/LaTeX renderer (KaTeX + remark)
- [ ] Three.js CAD viewer integration
- [ ] Asset drawer component

### Phase 5: Bottom Terminal (Day 3)
- [ ] Resizable panel with drag handle
- [ ] Stage-filtered log display
- [ ] Intervention prompt UI

### Phase 6: Visual Polish (Day 3-4)
- [ ] Tailwind config: Inter font, clean dark mode
- [ ] Remove cyberdeck styles
- [ ] Monospace only for code/terminal
- [ ] High-density spacing

### Phase 7: Human-in-the-Loop (Day 4)
- [ ] Pipeline halt/resume logic
- [ ] Parameter edit modal during intervention
- [ ] Backend resume endpoint

### Phase 8: Testing & Integration (Day 4-5)
- [ ] Full generation flow test
- [ ] Pipeline visibility verification
- [ ] Asset export validation
- [ ] Mobile responsiveness

## File Changes Required

### New Files
- `src/components/PipelineTracker.tsx`
- `src/components/LeftPane/AccordionSection.tsx`
- `src/components/LeftPane/AdminMetadata.tsx`
- `src/components/LeftPane/TechnicalConstraints.tsx`
- `src/components/CenterWorkspace/PreviewTabs.tsx`
- `src/components/CenterWorkspace/MarkdownPreview.tsx`
- `src/components/CenterWorkspace/CADViewer.tsx`
- `src/components/CenterWorkspace/AssetDrawer.tsx`
- `src/components/BottomTerminal/Terminal.tsx`
- `src/components/BottomTerminal/InterventionPrompt.tsx`
- `src/hooks/usePipeline.ts`
- `src/types/pipeline.ts`

### Modified Files
- `src/App.tsx` - Complete restructure
- `src/index.css` - New theme, remove cyberdeck
- `tailwind.config.js` - New fonts, colors, spacing
- `src/hooks/useWebSocket.ts` - Extended message types
- `backend/server.py` - Stage event emission
- `main.py` - Structured logging for stages

## Success Criteria
- [ ] Pipeline tracker shows all 4 stages with real-time status
- [ ] Left pane consolidates all inputs logically
- [ ] Center renders live LaTeX/Markdown + 3D CAD
- [ ] Bottom terminal streams raw logs with stage filtering
- [ ] Intervention works: halt → edit → resume
- [ ] Asset drawer exports individual files
- [ ] Clean, professional aesthetic (VS Code / Claude Desktop quality)
- [ ] Build passes, tests pass, no regressions