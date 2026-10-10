import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { FileText, Code2, Box, Download, ChevronRight, Image, Zap, RotateCcw, Sparkles } from 'lucide-react';
import { Asset } from '../../types/pipeline';
import { ChatWorkspace, CircuitProposal } from './ChatWorkspace';

export type WorkspaceTab = 'chat' | 'preview' | 'code' | '3d' | 'simulation';

interface CenterWorkspaceProps {
  assets: Asset[];
  markdownContent: string;
  latexContent: string;
  cadModelUrl?: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onAssetDownload: (asset: Asset) => void;
  isGenerating: boolean;
  simulationImages: string[];
  onConfirmBuild: (proposal: CircuitProposal) => void;
}

const TABS = [
  { id: 'chat', label: 'AI Co-Pilot', icon: Sparkles },
  { id: 'preview', label: 'Report', icon: FileText },
  { id: 'code', label: 'Source', icon: Code2 },
  { id: 'simulation', label: 'Simulation', icon: Zap },
  { id: '3d', label: '3D View', icon: Box },
] as const;

export function CenterWorkspace({ 
  assets, 
  markdownContent, 
  latexContent, 
  cadModelUrl,
  activeTab, 
  onTabChange, 
  onAssetDownload,
  isGenerating,
  simulationImages,
  onConfirmBuild
}: CenterWorkspaceProps) {
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/80 px-4 h-10">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id as 'preview' | 'code' | '3d' | 'simulation')}
              className={cn(
                'px-3 py-1.5 rounded-t-lg text-sm font-medium transition-all duration-150 flex items-center gap-1.5',
                activeTab === id
                  ? 'bg-zinc-800 text-white border-b-2 border-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        
        <div className="flex-1" />
        
        {/* Asset Drawer Toggle */}
        {assets.length > 0 && (
          <button
            onClick={() => setAssetDrawerOpen(!assetDrawerOpen)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-1.5',
              assetDrawerOpen
                ? 'bg-zinc-800/50 text-zinc-400 border border-zinc-100/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            )}
          >
            <Download className="w-4 h-4" />
            Assets ({assets.length})
            <ChevronRight className={cn('w-3 h-3 transition-transform', assetDrawerOpen && 'rotate-90')} />
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && (
          <ChatWorkspace onConfirmBuild={onConfirmBuild} isGenerating={isGenerating} />
        )}
        {activeTab === 'preview' && (
          <MarkdownPreview content={markdownContent} isGenerating={isGenerating} />
        )}
        {activeTab === 'code' && (
          <CodeView content={latexContent || markdownContent} isGenerating={isGenerating} />
        )}
        {activeTab === 'simulation' && (
          <SimulationView images={simulationImages} isGenerating={isGenerating} onImageClick={setSelectedImage} />
        )}
        {activeTab === '3d' && (
          <CADViewer modelUrl={cadModelUrl} isGenerating={isGenerating} />
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-in fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <img 
            src={selectedImage} 
            alt="Simulation result"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            className="absolute top-4 right-4 p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
            onClick={() => setSelectedImage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Asset Drawer */}
      {assetDrawerOpen && assets.length > 0 && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-700 z-50 animate-in slide-in-from-right duration-200 flex flex-col">
          <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
            <h3 className="font-medium text-white">Generated Assets</h3>
            <button 
              onClick={() => setAssetDrawerOpen(false)}
              className="p-1 text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {assets.map((asset) => (
              <button
                key={asset.path}
                onClick={() => onAssetDownload(asset)}
                className="w-full p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-left hover:border-zinc-500/30 hover:bg-zinc-800 transition-all flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-700">
                  {asset.type === 'pdf' && <FileText className="w-5 h-5 text-red-400" />}
                  {asset.type === 'fcstd' && <Box className="w-5 h-5 text-orange-400" />}
                  {asset.type === 'net' && <Code2 className="w-5 h-5 text-yellow-400" />}
                  {asset.type === 'csv' && <FileText className="w-5 h-5 text-green-400" />}
                  {asset.type === 'step' && <Box className="w-5 h-5 text-purple-400" />}
                  {asset.type === 'image' && <Image className="w-5 h-5 text-zinc-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{asset.label}</p>
                  <p className="text-xs text-zinc-500 truncate">{asset.type.toUpperCase()}</p>
                </div>
                <Download className="w-4 h-4 text-zinc-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarkdownPreview({ content, isGenerating }: { content: string; isGenerating: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = simpleMarkdownToHtml(content);
    }
  }, [content]);

  if (!content && !isGenerating) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto text-zinc-700 mb-4" />
          <p className="text-lg">No preview available</p>
          <p className="text-sm mt-1">Generate a report to see live preview</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto p-6 prose prose-invert prose-slate max-w-3xl mx-auto"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {isGenerating ? (
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-3/4"></div>
          <div className="h-4 bg-zinc-800 rounded w-full"></div>
          <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
          <div className="h-4 bg-zinc-800 rounded w-4/6"></div>
          <div className="h-32 bg-zinc-800 rounded"></div>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: content || '' }} />
      )}
    </div>
  );
}

function CodeView({ content, isGenerating }: { content: string; isGenerating: boolean }) {
  if (!content && !isGenerating) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <Code2 className="w-16 h-16 mx-auto text-zinc-700 mb-4" />
          <p className="text-lg">No source available</p>
          <p className="text-sm mt-1">Generate a report to view LaTeX/Markdown source</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <pre className="h-full p-4 overflow-auto text-sm font-mono text-zinc-100 bg-zinc-950">
        <code className="language-latex">{isGenerating ? '// Generating source...' : content || ''}</code>
      </pre>
    </div>
  );
}

function SimulationView({ images, isGenerating, onImageClick }: { images: string[]; isGenerating: boolean; onImageClick: (src: string) => void }) {
  if (images.length === 0 && !isGenerating) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <Zap className="w-16 h-16 mx-auto text-zinc-700 mb-4" />
          <p className="text-lg">No simulation results yet</p>
          <p className="text-sm mt-1">Run a generation to see IV curves, waveforms, and plots</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {isGenerating ? (
        <div className="animate-pulse space-y-6 max-w-3xl mx-auto">
          <div className="h-64 bg-zinc-800 rounded-lg"></div>
          <div className="h-64 bg-zinc-800 rounded-lg"></div>
          <div className="h-64 bg-zinc-800 rounded-lg"></div>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          {images.map((src, idx) => (
            <div key={idx} className="bg-zinc-900/50 border border-zinc-700 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-zinc-700 flex items-center justify-between bg-zinc-900">
                <span className="text-sm font-medium text-zinc-300">Simulation Plot {idx + 1}</span>
                <span className="text-xs text-zinc-500">Click to enlarge</span>
              </div>
              <img 
                src={src} 
                alt={`Simulation ${idx + 1}`}
                className="w-full h-auto cursor-zoom-in"
                onClick={() => onImageClick(src)}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.style.setProperty('display', 'block');
                }}
              />
              <div className="p-6 text-center text-zinc-500" style={{ display: 'none' }}>
                Failed to load image
              </div>
            </div>
          ))}
          {images.length === 0 && (
            <div className="text-center text-zinc-500 py-12">
              <p>No simulation images generated yet</p>
              <p className="text-sm mt-1">Simulation plots will appear here after generation completes</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CADViewer({ modelUrl, isGenerating }: { modelUrl?: string; isGenerating: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !modelUrl) return;
    // Three.js initialization would go here
    // For now, show placeholder with model info
  }, [modelUrl]);

  if (!modelUrl && !isGenerating) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <Box className="w-16 h-16 mx-auto text-zinc-700 mb-4" />
          <p className="text-lg">No 3D model available</p>
          <p className="text-sm mt-1">Provide a CAD prompt during generation to create 3D geometry</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative bg-zinc-950">
      <canvas 
        ref={canvasRef} 
        className="h-full w-full" 
        style={{ display: 'block' }}
      />
      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-3 border-zinc-100 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400">Loading CAD model...</p>
          </div>
        </div>
      )}
      {!isGenerating && modelUrl && (
        <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/80 backdrop-blur rounded-lg p-3 border border-zinc-700">
          <p className="text-xs text-zinc-400">Model: {modelUrl.split('/').pop()}</p>
          <p className="text-xs text-zinc-500">Three.js viewer - implement STEP/STL loading for full 3D interaction</p>
        </div>
      )}
    </div>
  );
}

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}