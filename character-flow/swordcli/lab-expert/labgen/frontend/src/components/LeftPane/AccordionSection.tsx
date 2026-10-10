import { useState } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface AccordionSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function AccordionSection({ title, description, children, defaultOpen = true, className }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden', className)}>
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span className={cn(
            'w-5 h-5 flex items-center justify-center transition-transform duration-200',
            isOpen ? 'rotate-90' : 'rotate-0'
          )}>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </span>
          <div>
            <h3 className="font-medium text-white">{title}</h3>
            {description && <p className="text-xs text-zinc-500">{description}</p>}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 border-t border-zinc-700/50 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}