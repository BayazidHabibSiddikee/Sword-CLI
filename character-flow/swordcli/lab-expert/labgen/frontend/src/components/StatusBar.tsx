import { useState, useEffect } from 'react'
import { Database, Zap, Brain, Wifi, WifiOff, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { cn } from '../lib/utils'
import { CONNECTION_STATUS } from '../lib/constants'

interface StatusBarProps {
  reportCount: number
  generating: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
}

export function StatusBar({ reportCount, generating, connectionStatus }: StatusBarProps) {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(interval)
  }, [])

  const config = CONNECTION_STATUS[connectionStatus]
  const Icon = connectionStatus === 'connected' ? Wifi : 
               connectionStatus === 'connecting' ? Zap :
               connectionStatus === 'disconnected' ? WifiOff : AlertTriangle;

  return (
    <footer className="h-10 border-t border-cyber-border bg-cyber-surface/80 backdrop-blur-sm flex items-center justify-between px-4 text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Database className="w-3 h-3 text-cyber-primary" />
          <span className="font-mono text-cyber-text">
            REPORTS: <span className="text-cyber-primary font-bold">{reportCount}</span>
          </span>
        </div>
        
        {generating && (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-cyber-primary/10 border border-cyber-primary/30 rounded">
            <Zap className="w-3 h-3 text-cyber-primary animate-spin" />
            <span className="font-mono text-cyber-primary">GENERATING...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Brain className="w-3 h-3 text-cyber-accent" />
          <span className="font-mono text-cyber-textDim">LIGHTGBM v1.0</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-cyber-textDim" />
          <span className="font-mono tabular-nums text-cyber-textDim">{time}</span>
        </div>

        <div className={cn('flex items-center gap-2 px-2 py-0.5 rounded', config.color)}>
          <Icon className="w-3 h-3" />
          <span className="font-mono">{config.label}</span>
        </div>
      </div>
    </footer>
  )
}