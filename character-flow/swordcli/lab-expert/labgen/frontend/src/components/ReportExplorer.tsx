import { 
  FileText, FolderOpen, FolderClosed, ChevronRight, ChevronDown, 
  Eye, Download, Trash2, CheckCircle, AlertTriangle, Zap, Brain,
  Clock, Search, Filter
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { Report } from '../../App'
import { REPORT_STATUS } from '../lib/constants'

interface ReportExplorerProps {
  reports: Report[]
  selectedReport: Report | null
  onSelect: (report: Report) => void
  onDelete: (id: string) => void
  onOpen: (report: Report) => void
}

export function ReportExplorer({ reports, selectedReport, onSelect, onDelete, onOpen }: ReportExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<Report['status'] | 'all'>('all')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['all']))

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesSearch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.experiment.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = filterStatus === 'all' || report.status === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [reports, searchTerm, filterStatus])

  const groupedReports = useMemo(() => {
    const groups: Record<string, Report[]> = {}
    filteredReports.forEach(report => {
      const date = new Date(report.createdAt).toISOString().split('T')[0]
      if (!groups[date]) groups[date] = []
      groups[date].push(report)
    })
    return groups
  }, [filteredReports])

  const toggleFolder = (date: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const isExpanded = (date: string) => expandedFolders.has(date)

  if (reports.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-cyber-textDim p-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full border-2 border-cyber-border flex items-center justify-center">
            <Zap className="w-10 h-10 text-cyber-textDim" />
          </div>
          <div>
            <p className="font-display text-lg text-cyber-text">NO REPORTS YET</p>
            <p className="text-sm mt-1">Generate your first report to begin</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-cyber-textDim">
            <span className="px-2 py-1 bg-cyber-border rounded">0 TOTAL</span>
            <span className="px-2 py-1 bg-cyber-border rounded">0 COMPLETE</span>
            <span className="px-2 py-1 bg-cyber-border rounded">0 PENDING</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search & Filter */}
      <div className="p-4 space-y-3 border-b border-cyber-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -tranzinc-y-1/2 w-4 h-4 text-cyber-textDim" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reports..."
            className="cyber-input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="cyber-input flex-1 text-xs"
          >
            <option value="all">ALL STATUS</option>
            <option value="idle">IDLE</option>
            <option value="generating">GENERATING</option>
            <option value="verifying">VERIFYING</option>
            <option value="complete">COMPLETE</option>
            <option value="error">ERROR</option>
          </select>
        </div>
      </div>

      {/* Reports Tree */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedReports).map(([date, dateReports]) => (
          <div key={date} className="border-b border-cyber-border/50">
            <button
              onClick={() => toggleFolder(date)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cyber-border/50 transition-colors"
            >
              <ChevronRight className={cn('w-4 h-4 text-cyber-textDim transition-transform', isExpanded(date) ? 'rotate-90' : '')} />
              <span className="font-mono text-xs text-cyber-textDim uppercase tracking-wider flex-1">{date.toUpperCase()}</span>
              <span className="px-2 py-0.5 text-xs bg-cyber-border rounded font-mono text-cyber-textDim">
                {dateReports.length}
              </span>
            </button>

            {isExpanded(date) && (
              <div className="ml-4 border-l border-cyber-border/50 pl-2">
                {dateReports.map(report => (
                  <ReportItem
                    key={report.id}
                    report={report}
                    isSelected={selectedReport?.id === report.id}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        
        {filteredReports.length === 0 && reports.length > 0 && (
          <div className="p-8 text-center text-cyber-textDim">
            <Filter className="w-12 h-12 mx-auto text-cyber-border mb-2" />
            <p>No reports match your filters</p>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="p-4 border-t border-cyber-border bg-cyber-bg/50">
        <div className="flex items-center justify-between text-xs text-cyber-textDim">
          <span>TOTAL: <span className="text-cyber-text font-mono">{reports.length}</span></span>
          <div className="flex gap-4">
            <span className="text-green-400">✓ {reports.filter(r => r.status === 'complete').length}</span>
            <span className="text-cyber-primary">⟳ {reports.filter(r => r.status === 'generating' || r.status === 'verifying').length}</span>
            <span className="text-cyber-secondary">✗ {reports.filter(r => r.status === 'error').length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportItem({ report, isSelected, onSelect, onOpen, onDelete }: {
  report: Report
  isSelected: boolean
  onSelect: (report: Report) => void
  onOpen: (report: Report) => void
  onDelete: (id: string) => void
}) {
  const config = REPORT_STATUS[report.status]

  return (
    <div>
      <div className={cn(
        'group file-item flex items-center justify-between w-full pr-2',
        isSelected && 'active'
      )}>
        <button className="flex items-center gap-2 flex-1 text-left min-w-0 py-2" onClick={() => onSelect(report)} aria-label={`Select report ${report.name}`}>
          <span className={cn('text-lg', config.color)}>{config.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm truncate">{report.name}</p>
            <p className="text-xs text-cyber-textDim truncate">{report.experiment}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 opacity-0 group-[.active]:opacity-100 lg:group-hover:opacity-100 transition-opacity focus-within:opacity-100">
          <button 
            onClick={(e) => { e.stopPropagation(); onOpen(report) }} 
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cyber-border rounded text-cyber-textDim hover:text-cyber-primary" 
            title="Open"
            aria-label={`Open report ${report.name}`}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(report.id) }} 
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-cyber-border rounded text-cyber-textDim hover:text-cyber-secondary" 
            title="Delete"
            aria-label={`Delete report ${report.name}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="ml-6 h-1 bg-cyber-border/20 mt-1">
        <div className={cn('h-full transition-all duration-300', report.status === 'generating' || report.status === 'verifying' ? 'animate-pulse-slow' : '')} style={{ width: `${report.progress}%` }} />
      </div>
    </div>
  )
}