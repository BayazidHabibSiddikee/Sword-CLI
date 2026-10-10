export type PipelineStageId = 'heuristic' | 'physics' | 'cad' | 'report';

export interface PipelineStage {
  id: PipelineStageId;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  progress: number;
  logs: string[];
}

export interface PipelineState {
  stages: Record<PipelineStageId, PipelineStage>;
  currentStage: PipelineStageId | null;
  overallProgress: number;
}

export interface Asset {
  type: 'pdf' | 'fcstd' | 'net' | 'csv';
  path: string;
  label: string;
}

export interface InterventionPrompt {
  stage: PipelineStageId;
  message: string;
  params: Record<string, any>;
  options: ('retry' | 'skip' | 'abort')[];
}

export type WebSocketMessage = 
  | { type: 'stage_start'; reportId: string; stage: PipelineStageId; message: string; progress: number }
  | { type: 'stage_progress'; reportId: string; stage: PipelineStageId; progress: number; log: string }
  | { type: 'stage_complete'; reportId: string; stage: PipelineStageId; progress: number }
  | { type: 'stage_error'; reportId: string; stage: PipelineStageId; error: string; recoverable: boolean }
  | { type: 'log'; reportId: string; stage: PipelineStageId; content: string }
  | { type: 'assets_ready'; reportId: string; assets: Asset[] }
  | { type: 'intervention_required'; reportId: string; stage: PipelineStageId; message: string; params: Record<string, any> }
  | { type: 'complete'; reportId: string; progress: number; status: string; message: string }
  | { type: 'error'; reportId: string; message: string };

export interface FormData {
  // Administrative Metadata
  studentName: string;
  rollNumber: string;
  section: string;
  group: number;
  
  // Experiment Configuration
  experimentName: string;
  experimentNumber: number;
  
  // Technical Constraints
  circuitDescription: string;
  boundaryConditions: Record<string, string>;
  cadParameters: Record<string, string>;
  fluidsimPrompt?: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'heuristic', name: 'Heuristic Gating', description: 'LightGBM classification confidence', status: 'pending', progress: 0, logs: [] },
  { id: 'physics', name: 'Physics Simulation', description: 'ngspice solver iterations', status: 'pending', progress: 0, logs: [] },
  { id: 'cad', name: 'CAD Compilation', description: 'CadQuery script to STEP/FCStd', status: 'pending', progress: 0, logs: [] },
  { id: 'report', name: 'Report Synthesis', description: 'LLM formatting results', status: 'pending', progress: 0, logs: [] },
];