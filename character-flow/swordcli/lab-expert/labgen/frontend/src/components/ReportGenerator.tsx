import { useState } from 'react'
import { Brain, Zap, AlertTriangle, CheckCircle, Loader2, X, Settings } from 'lucide-react'
import { cn } from '../lib/utils'
import { Question } from '../../App'

interface ReportGeneratorProps {
  questions: Question[]
  onChange: (id: string, value: string | number) => void
  onSubmit: () => void
  isGenerating: boolean
  validation: boolean
}

export function ReportGenerator({ questions, onChange, onSubmit, isGenerating, validation }: ReportGeneratorProps) {
  const [expanded, setExpanded] = useState<string[]>(['experimentName', 'circuitPrompt'])

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-cyber-primary flex items-center gap-2">
          <Brain className="w-5 h-5" />
          REPORT GENERATOR
        </h2>
        {isGenerating && (
          <div className="flex items-center gap-2 px-2 py-1 bg-cyber-primary/10 border border-cyber-primary/30 rounded text-cyber-primary text-xs font-mono">
            <Loader2 className="w-3 h-3 animate-spin" />
            GENERATING...
          </div>
        )}
      </div>

      <div className="cyber-panel space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {questions.map((question, index) => (
            <QuestionField
              key={question.id}
              question={question}
              onChange={onChange}
              index={index}
              expanded={expanded.includes(question.id)}
              onToggleExpand={() => toggleExpand(question.id)}
            />
          ))}
        </div>

        <div className="pt-4 border-t border-cyber-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono', validation 
              ? 'bg-green-400/10 border-green-400/30 text-green-400' 
              : 'bg-cyber-secondary/10 border-cyber-secondary/30 text-cyber-secondary')}>
              <span className={cn(validation ? 'text-green-400' : 'text-cyber-secondary')}>
                {validation ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              </span>
              <span className="font-mono">
                {validation ? 'ALL REQUIRED FIELDS COMPLETE' : 'MISSING REQUIRED FIELDS'}
              </span>
            </div>
          </div>

          <button
            onClick={onSubmit}
            disabled={!validation || isGenerating}
            className={cn(
              'w-full py-3 px-4 rounded font-mono text-sm transition-all duration-200 flex items-center justify-center gap-2',
              'border border-cyber-primary bg-cyber-primary text-cyber-bg hover:bg-cyber-primary/90 hover:shadow-glow',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                GENERATING REPORT...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                INITIATE GENERATION
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionField({ question, onChange, index, expanded, onToggleExpand }: { 
  question: Question
  onChange: (id: string, value: string | number) => void
  index: number
  expanded: boolean
  onToggleExpand: () => void
}) {
  const [localValue, setLocalValue] = useState<string>(String(question.value || ''))
  const isRequired = question.required

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = question.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
    setLocalValue(e.target.value)
    onChange(question.id, value)
  }

  return (
    <div className={cn('cyber-panel', expanded && 'ring-1 ring-cyber-primary/30')}>
      <button 
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-2 rounded hover:bg-cyber-border/50 transition-colors"
        aria-expanded={expanded}
        aria-controls={`${question.id}-content`}
      >
        <div className="flex items-center gap-3">
          <span className="text-cyber-textDim text-sm font-mono">{String(index + 1).padStart(2, '0')}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{question.label}</span>
            {question.required && <span className="text-cyber-secondary text-xs">REQUIRED</span>}
          </div>
        </div>
        <X className={cn('w-4 h-4 transition-transform', expanded ? 'rotate-45 text-cyber-primary' : 'text-cyber-textDim')} />
      </button>

      {expanded && (
        <div id={`${question.id}-content`} className="border-t border-cyber-border pt-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            <label htmlFor={question.id} className="sr-only">{question.label}</label>
            {question.type === 'textarea' && (
              <textarea id={question.id} aria-label={question.label}
                value={localValue}
                onChange={handleChange}
                placeholder={question.placeholder}
                rows={4}
                className="cyber-input resize-y min-h-[100px]"
              />
            )}
            {question.type === 'select' && (
              <select id={question.id} aria-label={question.label} value={localValue} onChange={handleChange} className="cyber-input">
                <option value="">Select...</option>
                {question.options?.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
            {(question.type === 'text' || question.type === 'number') && (
              <input id={question.id} aria-label={question.label}
                type={question.type}
                value={localValue}
                onChange={handleChange}
                placeholder={question.placeholder}
                className="cyber-input"
              />
            )}
            {question.placeholder && (
              <p className="text-xs text-cyber-textDim font-mono">
                {question.placeholder}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}