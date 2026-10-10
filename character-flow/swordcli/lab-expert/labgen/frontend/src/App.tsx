import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from './lib/utils';
import { useWebSocket } from './hooks/useWebSocket';
import { PipelineTracker } from './components/PipelineTracker/PipelineTracker';
import { LeftPane } from './components/LeftPane/LeftPane';
import { CenterWorkspace } from './components/CenterWorkspace/CenterWorkspace';
import { Terminal } from './components/BottomTerminal/Terminal';
import { FormData, PipelineStage, PipelineStageId, Asset, WebSocketMessage, PIPELINE_STAGES as INITIAL_STAGES } from './types/pipeline';
import { ErrorBoundary } from './components/ErrorBoundary';

const INITIAL_FORM_DATA: FormData = {
  studentName: '',
  rollNumber: '',
  section: 'A',
  group: 1,
  experimentName: '',
  experimentNumber: 2,
  circuitDescription: '',
  boundaryConditions: {},
  cadParameters: {},
};

import { CircuitProposal } from './components/CenterWorkspace/ChatWorkspace';
import { WorkspaceTab } from './components/CenterWorkspace/CenterWorkspace';

export function App() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [stages, setStages] = useState<PipelineStage[]>(INITIAL_STAGES);
  const [currentStage, setCurrentStage] = useState<PipelineStageId | null>(null);
  const [currentReportId, setCurrentReportId] = useState<string>('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [simulationImages, setSimulationImages] = useState<string[]>([]);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [latexContent, setLatexContent] = useState<string>('');
  const [cadModelUrl, setCadModelUrl] = useState<string | undefined>(undefined);
  const [centerTab, setCenterTab] = useState<WorkspaceTab>('chat');
  const [terminalLogs, setTerminalLogs] = useState<Array<{
    id: number;
    stage: PipelineStageId;
    content: string;
    timestamp: string;
    type: 'log' | 'error' | 'warning' | 'info';
  }>>([]);
  const [activeStageFilter, setActiveStageFilter] = useState<PipelineStageId | 'all'>('all');
  const [interventionPrompt, setInterventionPrompt] = useState<{
    stage: PipelineStageId;
    message: string;
    params: Record<string, any>;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const terminalRef = useRef<{ scrollToBottom: () => void; clear: () => void }>(null);
  const logCounter = useRef(0);

  const { sendMessage, lastMessage, connectionStatus: wsStatus, connect, disconnect } = useWebSocket();

  // Sync connection status
  useEffect(() => {
    setConnectionStatus(wsStatus);
  }, [wsStatus]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as WebSocketMessage;
    const reportId = msg.reportId;

    switch (msg.type) {
      case 'stage_start':
        setStages(prev => prev.map(s => 
          s.id === msg.stage ? { ...s, status: 'running', progress: msg.progress, logs: [] } : s
        ));
        setCurrentStage(msg.stage);
        addLog(msg.stage, msg.message, 'info');
        break;

      case 'stage_progress':
        setStages(prev => prev.map(s => 
          s.id === msg.stage ? { ...s, status: 'running', progress: msg.progress } : s
        ));
        addLog(msg.stage, msg.log, 'log');
        break;

      case 'stage_complete':
        setStages(prev => prev.map(s => 
          s.id === msg.stage ? { ...s, status: 'complete', progress: 100 } : s
        ));
        addLog(msg.stage, `Stage ${msg.stage} completed`, 'info');
        // Auto-advance to next stage
        const stageOrder: PipelineStageId[] = ['heuristic', 'physics', 'cad', 'report'];
        const currentIndex = stageOrder.indexOf(msg.stage);
        if (currentIndex < stageOrder.length - 1) {
          setCurrentStage(stageOrder[currentIndex + 1]);
        }
        break;

      case 'stage_error':
        setStages(prev => prev.map(s => 
          s.id === msg.stage ? { ...s, status: 'error', progress: s.progress } : s
        ));
        addLog(msg.stage, `ERROR: ${msg.error}`, 'error');
        if (msg.recoverable) {
          setInterventionPrompt({
            stage: msg.stage,
            message: msg.error,
            params: {}
          });
        }
        break;

      case 'log':
        addLog(msg.stage, msg.content, 'log');
        break;

      case 'report_ready':
        setMarkdownContent(msg.markdown || '');
        setLatexContent(msg.latex || '');
        setCenterTab('preview');
        break;

      case 'assets_ready':
        setAssets(msg.assets);
        const repId = reportId || currentReportId || 'latest';
        
        // Extract simulation images (plots, waveforms, etc.)
        const imageAssets = msg.assets.filter(a => 
          a.type === 'image' || a.label.toLowerCase().includes('plot') || a.label.toLowerCase().includes('schematic')
        );
        const imageUrls = imageAssets.map(a => `/api/reports/${repId}/asset/${encodeURIComponent(a.path)}`);
        setSimulationImages(imageUrls);
        
        // Set CAD model URL (prefer STL for Three.js loader)
        const stlAsset = msg.assets.find(a => a.type === 'stl' || a.path.endsWith('.stl'));
        const stepAsset = msg.assets.find(a => a.type === 'step' || a.path.endsWith('.step'));
        const fcstdAsset = msg.assets.find(a => a.type === 'fcstd' || a.path.endsWith('.FCStd'));
        const cadAsset = stlAsset || stepAsset || fcstdAsset;
        if (cadAsset) {
          setCadModelUrl(`/api/reports/${repId}/asset/${encodeURIComponent(cadAsset.path)}`);
        }
        break;

      case 'intervention_required':
        setInterventionPrompt({
          stage: msg.stage,
          message: msg.message,
          params: msg.params
        });
        break;

      case 'complete':
        setIsGenerating(false);
        setCurrentStage(null);
        addLog('report', 'Generation complete! All assets and reports synthesized.', 'info');
        setCenterTab('preview');
        break;

      case 'error':
        setIsGenerating(false);
        addLog('report', `Generation failed: ${msg.message}`, 'error');
        break;
    }
  }, [lastMessage]);

  const addLog = useCallback((stage: PipelineStageId, content: string, type: 'log' | 'error' | 'warning' | 'info' = 'log') => {
    const newLog = {
      id: ++logCounter.current,
      stage,
      content,
      timestamp: new Date().toISOString(),
      type
    };
    setTerminalLogs(prev => [...prev, newLog]);
  }, []);

  const handleFormChange = useCallback((field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [validationErrors]);

  const validateForm = useCallback(() => {
    const errors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.experimentName.trim()) {
      errors.experimentName = 'Experiment name is required';
    }
    if (!formData.circuitDescription.trim()) {
      errors.circuitDescription = 'Circuit description is required';
    }
    if (!formData.studentName.trim()) {
      errors.studentName = 'Student name is required';
    }
    if (!formData.rollNumber.trim()) {
      errors.rollNumber = 'Roll number is required';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleGenerate = useCallback(() => {
    if (!validateForm()) return;
    
    setIsGenerating(true);
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: 'pending', progress: 0, logs: [] })));
    setCurrentStage('heuristic');
    setAssets([]);
    setMarkdownContent('');
    setLatexContent('');
    setCadModelUrl(undefined);
    setTerminalLogs([]);
    setInterventionPrompt(null);
    logCounter.current = 0;

    const reportId = `report_${Date.now()}`;
    setCurrentReportId(reportId);
    sendMessage({
      type: 'generate',
      reportId,
      payload: formData
    });
  }, [formData, validateForm, sendMessage]);

  const handleConfirmBuild = useCallback((proposal: CircuitProposal) => {
    const updatedFormData = {
      ...formData,
      experimentName: proposal.experimentName,
      experimentNumber: proposal.experimentNumber || formData.experimentNumber || 2,
      circuitDescription: proposal.circuitPrompt,
      cadParameters: proposal.cadPrompt ? { description: proposal.cadPrompt } : formData.cadParameters,
      fluidsimPrompt: proposal.fluidsimPrompt,
    };
    setFormData(updatedFormData);
    setCenterTab('preview');

    setIsGenerating(true);
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: 'pending', progress: 0, logs: [] })));
    setCurrentStage('heuristic');
    setAssets([]);
    setSimulationImages([]);
    setMarkdownContent('');
    setLatexContent('');
    setCadModelUrl(undefined);
    setTerminalLogs([]);
    setInterventionPrompt(null);
    logCounter.current = 0;

    const reportId = `report_${Date.now()}`;
    setCurrentReportId(reportId);
    sendMessage({
      type: 'generate',
      reportId,
      payload: updatedFormData
    });
  }, [formData, sendMessage]);

  const handleInterventionAction = useCallback((action: 'retry' | 'skip' | 'abort', params?: Record<string, any>) => {
    if (!lastMessage) return;
    
    const reportId = (lastMessage as WebSocketMessage).reportId;
    if (!reportId) return;

    if (action === 'abort') {
      setIsGenerating(false);
      setInterventionPrompt(null);
      return;
    }

    // Send intervention response to backend
    sendMessage({
      type: 'intervention_response',
      reportId,
      stage: interventionPrompt?.stage || 'heuristic',
      action,
      params
    });

    setInterventionPrompt(null);
  }, [lastMessage, interventionPrompt, sendMessage]);

  const handleClearTerminal = useCallback(() => {
    setTerminalLogs([]);
    logCounter.current = 0;
    terminalRef.current?.clear();
  }, []);

  const handleExportTerminal = useCallback(() => {
    const logText = terminalLogs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stage.toUpperCase()}] ${l.content}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labgen-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [terminalLogs]);

  const handleAssetDownload = useCallback((asset: Asset) => {
    // Trigger download via backend
    const a = document.createElement('a');
    a.href = `/api/reports/${asset.path}`;
    a.download = asset.label;
    a.click();
  }, []);

  return (
    <div className="h-screen w-full bg-zinc-950 flex flex-col overflow-hidden font-sans antialiased">
      {/* Pipeline Tracker - Fixed Top */}
      <PipelineTracker 
        stages={stages} 
        currentStage={currentStage}
      />

      {/* Main 3-Pane Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Pane - Inputs & Parameters */}
        <LeftPane
          formData={formData}
          onChange={handleFormChange}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          validationErrors={validationErrors}
        />

        {/* Center Workspace - Live Output */}
        <CenterWorkspace
          assets={assets}
          markdownContent={markdownContent}
          latexContent={latexContent}
          cadModelUrl={cadModelUrl}
          activeTab={centerTab}
          onTabChange={setCenterTab}
          onAssetDownload={handleAssetDownload}
          isGenerating={isGenerating}
          simulationImages={simulationImages}
          onConfirmBuild={handleConfirmBuild}
        />

        {/* Resize handle between center and left (optional) */}
        <div className="hidden lg:block w-px bg-zinc-700 hover:bg-zinc-100/50 transition-colors cursor-col-resize" />
      </div>

      {/* Bottom Terminal */}
      <Terminal
        ref={terminalRef}
        logs={terminalLogs}
        isGenerating={isGenerating}
        onClear={handleClearTerminal}
        onExport={handleExportTerminal}
        activeStageFilter={activeStageFilter}
        onStageFilterChange={setActiveStageFilter}
        interventionPrompt={interventionPrompt}
        onInterventionAction={handleInterventionAction}
      />
    </div>
  )
}

function BootScreen() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-zinc-950">
      <div className="text-center">
        <div className="text-4xl font-bold text-white tracking-tight mb-2">LABGEN</div>
        <div className="text-zinc-500 text-sm">IDE Workspace v3.0.0</div>
        <div className="mt-8 flex items-center justify-center gap-3 text-zinc-600">
          <div className="w-8 h-8 border-2 border-zinc-100 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function AppWrapper() {
  const [showBoot, setShowBoot] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowBoot(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (showBoot) return <BootScreen />;

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}