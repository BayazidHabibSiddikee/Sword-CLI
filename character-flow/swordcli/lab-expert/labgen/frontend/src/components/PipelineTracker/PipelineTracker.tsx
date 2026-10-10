import { cn } from '../../lib/utils';
import { PipelineStage, PipelineStageId } from '../../types/pipeline';
import { 
  Brain, 
  Zap, 
  Box, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';

const STAGE_ICONS: Record<PipelineStageId, React.ComponentType<{ className?: string }>> = {
  heuristic: Brain,
  physics: Zap,
  cad: Box,
  report: FileText,
};

const STAGE_COLORS: Record<string, string> = {
  heuristic: 'text-zinc-400',
  physics: 'text-yellow-400',
  cad: 'text-purple-400',
  report: 'text-green-400',
};

interface PipelineTrackerProps {
  stages: PipelineStage[];
  currentStage: PipelineStageId | null;
  className?: string;
}

export function PipelineTracker({ stages, currentStage, className }: PipelineTrackerProps) {
  return (
    <div className={cn('bg-zinc-900/80 border-b border-zinc-700 backdrop-blur-sm', className)}>
      <div className="max-w-full mx-auto px-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-2">
          {stages.map((stage, index) => {
            const Icon = STAGE_ICONS[stage.id];
            const isActive = currentStage === stage.id;
            const isComplete = stage.status === 'complete';
            const isError = stage.status === 'error';
            const isRunning = stage.status === 'running';
            
            return (
              <div key={stage.id} className="flex items-center gap-2 flex-shrink-0 min-w-[200px] max-w-[280px]">
                {/* Connector line (except last) */}
                {index < stages.length - 1 && (
                  <div className="hidden md:block w-16 h-0.5 flex-shrink-0 mx-2 relative">
                    <div 
                      className={cn(
                        'absolute top-0 left-0 h-full rounded transition-all duration-300',
                        isActive || isComplete ? 'bg-green-500/50' : 'bg-zinc-700'
                      )}
                      style={{ width: `${isComplete ? 100 : isActive ? (stage.progress / 100) * 100 : 0}%` }}
                    />
                  </div>
                )}

                {/* Stage Node */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className={cn(
                    'relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300',
                    isError && 'bg-red-500/20 text-red-400 border border-red-500/50',
                    isComplete && 'bg-green-500/20 text-green-400 border border-green-500/50',
                    isActive && !isError && 'bg-zinc-800/50 text-zinc-400 border border-zinc-500/30 animate-pulse',
                    !isActive && !isComplete && !isError && 'bg-zinc-700 text-zinc-500 border border-zinc-600'
                  )}>
                    {isError ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : isComplete ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isActive ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className={cn('w-5 h-5', STAGE_COLORS[stage.id])} />
                    )}
                  </div>

                  {/* Stage Info */}
                  <div className="hidden md:block min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'font-medium text-sm truncate',
                        isActive && 'text-white',
                        isComplete && 'text-green-400',
                        isError && 'text-red-400',
                        !isActive && !isComplete && 'text-zinc-400'
                      )}>
                        {stage.name}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 text-xs bg-zinc-800/50 text-zinc-400 rounded font-mono">
                          {stage.progress}%
                        </span>
                      )}
                      {isComplete && (
                        <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded font-mono">
                          Done
                        </span>
                      )}
                    </div>
                    <p className={cn('text-xs truncate', isActive ? 'text-zinc-300' : 'text-zinc-500')}>
                      {stage.description}
                    </p>
                  </div>
                </div>

                {/* Mobile progress bar */}
                <div className="md:hidden w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden flex-shrink-0">
                  <div 
                    className={cn(
                        'h-full rounded-full transition-all duration-300',
                        isError ? 'bg-red-500' : isComplete ? 'bg-green-500' : isActive ? 'bg-zinc-100' : 'bg-transparent'
                      )}
                    style={{ width: `${stage.progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Overall progress bar */}
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
          <div 
            className="h-full bg-gradient-to-r from-zinc-100 via-yellow-500 to-green-500 transition-all duration-500"
            style={{ width: `${stages.reduce((acc, s) => acc + s.progress, 0) / stages.length}%` }}
          />
        </div>
      </div>
    </div>
  );
}