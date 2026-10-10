import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, Filter, Trash2, Download } from 'lucide-react';
import { PipelineStageId } from '../../types/pipeline';

interface LogEntry {
  id: number;
  stage: PipelineStageId;
  content: string;
  timestamp: string;
  type: 'log' | 'error' | 'warning' | 'info';
}

interface TerminalProps {
  logs: LogEntry[];
  isGenerating: boolean;
  onClear: () => void;
  onExport: () => void;
  activeStageFilter: PipelineStageId | 'all';
  onStageFilterChange: (stage: PipelineStageId | 'all') => void;
  interventionPrompt?: {
    stage: PipelineStageId;
    message: string;
    params: Record<string, any>;
  };
  onInterventionAction: (action: 'retry' | 'skip' | 'abort', params?: Record<string, any>) => void;
  className?: string;
}

const STAGE_COLORS: Record<PipelineStageId, string> = {
  heuristic: 'text-zinc-400',
  physics: 'text-yellow-400',
  cad: 'text-purple-400',
  report: 'text-green-400',
};

const STAGE_LABELS: Record<PipelineStageId, string> = {
  heuristic: 'HEURISTIC',
  physics: 'PHYSICS',
  cad: 'CAD',
  report: 'REPORT',
};

export const Terminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ logs, isGenerating, onClear, onExport, activeStageFilter, onStageFilterChange, interventionPrompt, onInterventionAction, className }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const logCounter = useRef(0);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      },
      clear: onClear,
    }));

    // Auto-scroll to bottom on new logs
    useEffect(() => {
      if (terminalRef.current && !isMinimized && logs.length > 0) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, [logs.length, isMinimized]);

    const filteredLogs = activeStageFilter === 'all' 
      ? logs 
      : logs.filter(log => log.stage === activeStageFilter);

    if (isMinimized) {
      return (
        <div className="fixed bottom-0 right-4 z-40 animate-in slide-in-from-bottom-4">
          <button 
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg hover:border-zinc-600 transition-colors"
          >
            <TerminalIcon className="w-4 h-4 text-zinc-400" />
            <span className="font-mono text-xs text-zinc-300">TERMINAL</span>
            {isGenerating && (
              <span className="px-2 py-0.5 text-[10px] bg-zinc-800/50 text-zinc-400 rounded font-mono animate-pulse">
                ACTIVE
              </span>
            )}
          </button>
        </div>
      );
    }

    return (
      <div 
        ref={terminalRef}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 flex flex-col bg-zinc-950 border-t border-zinc-700 transition-all duration-300',
          isMaximized ? 'h-[60vh] max-h-[80vh]' : 'h-64',
          className
        )}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-900/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
            </div>
            <span className="font-mono text-xs text-zinc-400">terminal.log</span>
            <span className={cn(
              'px-2 py-0.5 text-xs rounded font-mono',
              isGenerating ? 'bg-zinc-800/50 text-zinc-400' : 'bg-zinc-700 text-zinc-500'
            )}>
              {isGenerating ? 'STREAMING' : 'IDLE'}
            </span>
          </div>

          {/* Stage Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-500" />
            <select
              value={activeStageFilter}
              onChange={(e) => onStageFilterChange(e.target.value as PipelineStageId | 'all')}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
            >
              <option value="all">ALL STAGES</option>
              <option value="heuristic">HEURISTIC</option>
              <option value="physics">PHYSICS</option>
              <option value="cad">CAD</option>
              <option value="report">REPORT</option>
            </select>
          </div>

          {/* Window Controls */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
              title="Minimize to tray"
            >
              <Minimize2 className="w-4 h-4 rotate-90" />
            </button>
            <button 
              onClick={onClear}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
              title="Clear"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onExport}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
              title="Export logs"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Intervention Prompt */}
        {interventionPrompt && (
          <div className="px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/30 animate-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 flex-shrink-0 mt-0.5 text-yellow-400">⚠</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-300">
                  INTERVENTION REQUIRED - {STAGE_LABELS[interventionPrompt.stage]}
                </p>
                <p className="text-xs text-zinc-300 mt-1">{interventionPrompt.message}</p>
                {Object.keys(interventionPrompt.params).length > 0 && (
                  <div className="mt-2 p-2 bg-zinc-900 rounded text-xs font-mono text-zinc-400 max-h-20 overflow-auto">
                    {JSON.stringify(interventionPrompt.params, null, 2)}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onInterventionAction('retry', interventionPrompt.params)}
                    className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium hover:bg-green-500/30 transition-colors"
                  >
                    RETRY
                  </button>
                  <button
                    onClick={() => onInterventionAction('skip')}
                    className="px-3 py-1.5 bg-zinc-800/50 text-zinc-400 border border-zinc-100/30 rounded text-xs font-medium hover:bg-zinc-100/30 transition-colors"
                  >
                    SKIP
                  </button>
                  <button
                    onClick={() => onInterventionAction('abort')}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-medium hover:bg-red-500/30 transition-colors"
                  >
                    ABORT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Terminal Content */}
        <div 
          className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
          style={{ fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace' }}
        >
          <div className="space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-zinc-500 text-center py-8">
                <TerminalIcon className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                <p>No logs yet</p>
                <p className="text-[11px] mt-1">Start a generation to see live output</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <TerminalLine key={log.id} log={log} />
              ))
            )}
            {isGenerating && (
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
                <span className="text-zinc-400">user@labgen:</span>
                <span className="text-purple-400">~</span>
                <span className="text-zinc-400">$</span>
                <span className="w-4 h-4 bg-zinc-300 animate-pulse inline-block ml-1" />
              </div>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-3 py-1.5 border-t border-zinc-700 bg-zinc-900/90 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
              LINE {logs.length}
            </span>
            <span>FILTER: {activeStageFilter.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {isGenerating ? 'LIVE' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>
    )
  }
);

function TerminalLine({ log }: { log: LogEntry }) {
  const getPrefix = () => {
    switch (log.type) {
      case 'error': return <span className="text-red-400">[ERR]</span>
      case 'warning': return <span className="text-yellow-400">[WARN]</span>
      case 'info': return <span className="text-zinc-400">[INFO]</span>
      default: return <span className={STAGE_COLORS[log.stage]}>[{STAGE_LABELS[log.stage]}</span>
    }
  }

  const time = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div className="flex gap-2 px-1">
      <span className="text-zinc-500 text-[10px] font-mono tabular-nums w-14 text-right flex-shrink-0">
        {time}
      </span>
      <span className="flex-shrink-0 px-1">{getPrefix()}</span>
      <span className="text-zinc-300 break-all whitespace-pre-wrap font-mono flex-1" title={log.content}>
        {log.content}
      </span>
    </div>
  );
}

Terminal.displayName = 'Terminal';