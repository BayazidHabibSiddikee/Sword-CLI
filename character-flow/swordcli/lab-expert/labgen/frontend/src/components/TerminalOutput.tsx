import { Terminal, X, Maximize2, Minimize2 } from 'lucide-react'
import { useRef, useEffect, useState, useMemo, UIEvent } from 'react'
import { cn } from '../lib/utils'

interface TerminalOutputProps {
  logs: string[]
  isActive: boolean
  onClose: () => void
}

export function TerminalOutput({ logs, isActive, onClose }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const terminalLines = useMemo(() => {
    if (logs.length === 0) {
      return [
        { type: 'system', content: 'LABGEN TERMINAL v2.4.1 INITIALIZED' },
        { type: 'system', content: 'AWAITING GENERATION COMMAND...' },
        { type: 'hint', content: 'Fill the form on the left and click INITIATE GENERATION' },
      ]
    }
    return logs.map(log => ({ type: 'log', content: log }))
  }, [logs])

  // Measure container height
  useEffect(() => {
    if (!isMinimized && containerRef.current) {
      const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
          setContainerHeight(entry.contentRect.height)
        }
      })
      observer.observe(containerRef.current)
      return () => observer.disconnect()
    }
  }, [isMinimized, isMaximized])

  // Scroll to bottom on new logs using requestAnimationFrame
  useEffect(() => {
    if (!isMinimized && containerRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      })
    }
  }, [logs.length, isMinimized])

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const ITEM_HEIGHT = 24
  const totalItems = terminalLines.length + 1 // +1 for prompt
  const totalHeight = totalItems * ITEM_HEIGHT

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5)
  const endIndex = Math.min(totalItems - 1, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 5)

  const visibleItems = []
  for (let i = startIndex; i <= endIndex; i++) {
    if (i === terminalLines.length) {
      visibleItems.push(
        <div key="prompt" style={{ position: 'absolute', top: i * ITEM_HEIGHT, height: ITEM_HEIGHT }} className="flex items-center gap-2 px-1 w-full">
          <span className="text-cyber-textDim text-xs font-mono tabular-nums w-10 text-right"></span>
          <span className="flex-shrink-0 px-2 text-cyber-primary">[CMD]</span>
          <span className="text-cyber-primary">root@labgen:</span>
          <span className="text-cyber-accent">~</span>
          <span className="text-cyber-primary">$</span>
          <span className="w-4 h-4 bg-cyber-primary animate-pulse inline-block ml-1" />
        </div>
      )
    } else {
      visibleItems.push(
        <TerminalLine key={i} line={terminalLines[i]} index={i} style={{ position: 'absolute', top: i * ITEM_HEIGHT, height: ITEM_HEIGHT, width: '100%' }} />
      )
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-4 z-40 animate-in slide-in-from-bottom-4">
        <button 
          onClick={() => setIsMinimized(false)}
          aria-label="Restore terminal"
          className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-cyber-surface border border-cyber-border rounded-lg shadow-lg hover:bg-cyber-border transition-colors"
        >
          <Terminal className="w-4 h-4 text-cyber-primary" />
          <span className="font-mono text-xs text-cyber-text">TERMINAL</span>
          <span className="px-1.5 py-0.5 text-xs bg-cyber-primary text-cyber-bg rounded font-mono">ACTIVE</span>
        </button>
      </div>
    )
  }

  return (
    <div className={cn(
      'fixed bottom-0 left-0 right-0 z-40 flex flex-col transition-all duration-300',
      isMaximized ? 'h-[80vh]' : 'h-64'
    )}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cyber-border bg-cyber-surface/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-cyber-secondary/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-400/50" />
          </div>
          <span className="font-mono text-xs text-cyber-textDim">terminal.tsx</span>
          <span className="px-2 py-0.5 text-xs bg-cyber-primary/10 text-cyber-primary rounded font-mono">
            {isActive ? 'ACTIVE' : 'IDLE'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsMaximized(!isMaximized)} 
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cyber-border rounded transition-colors" 
            title={isMaximized ? 'Minimize' : 'Maximize'}
            aria-label={isMaximized ? 'Minimize terminal' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsMinimized(true)} 
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cyber-border rounded transition-colors" 
            title="Minimize to tray"
            aria-label="Minimize terminal to tray"
          >
            <Minimize2 className="w-5 h-5 rotate-90" />
          </button>
          <button 
            onClick={onClose} 
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cyber-border rounded transition-colors" 
            title="Close"
            aria-label="Close terminal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 font-mono text-sm leading-relaxed bg-cyber-bg relative overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-cyber-border scrollbar-track-transparent" 
        style={{ fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace' }}
      >
        <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
          {visibleItems}
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-cyber-border bg-cyber-surface/95 flex items-center justify-between text-xs text-cyber-textDim">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyber-primary animate-pulse" />
            LINE {logs.length + 1}
          </span>
          <span>COL 1</span>
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-primary animate-pulse" />
            LIVE
          </span>
          <span className="px-2 py-0.5 text-[10px] bg-cyber-primary/10 text-cyber-primary rounded font-mono">
            {logs.length > 0 ? 'STREAMING' : 'IDLE'}
          </span>
        </div>
      </div>
    </div>
  )
}

function TerminalLine({ line, index, style }: { line: { type: string, content: string }, index: number, style: React.CSSProperties }) {
  const getPrefix = () => {
    switch (line.type) {
      case 'system': return <span className="text-cyber-accent">[SYS]</span>
      case 'error': return <span className="text-cyber-secondary">[ERR]</span>
      case 'warning': return <span className="text-yellow-400">[WARN]</span>
      case 'success': return <span className="text-green-400">[OK]</span>
      case 'hint': return <span className="text-cyber-textDim">[HINT]</span>
      case 'progress': return <span className="text-cyber-primary">[PROG]</span>
      default: return <span className="text-cyber-textDim">[LOG]</span>
    }
  }

  // Deterministic pseudo time to prevent re-renders changing the time
  const pseudoTime = String((10000 + index * 13) % 100000).padStart(5, '0')

  return (
    <div style={style} className="flex gap-2 px-1 items-center overflow-hidden">
      <span className="text-cyber-textDim text-xs font-mono tabular-nums w-10 text-right flex-shrink-0">
        {pseudoTime}
      </span>
      <span className="flex-shrink-0 px-2">{getPrefix()}</span>
      <span className="text-cyber-text truncate font-mono flex-1" title={line.content}>{line.content}</span>
    </div>
  )
}

export default TerminalOutput
