import { cn } from '../../lib/utils';
import { FormData } from '../../types/pipeline';

interface AdminMetadataProps {
  formData: FormData;
  onChange: (field: keyof FormData, value: any) => void;
  errors?: Partial<Record<keyof FormData, string>>;
}

export function AdminMetadata({ formData, onChange, errors }: AdminMetadataProps) {
  const fields = [
    { key: 'studentName' as const, label: 'Student Name', placeholder: 'John Doe' },
    { key: 'rollNumber' as const, label: 'Roll Number', placeholder: '1901000' },
    { key: 'section' as const, label: 'Section', type: 'select' as const, options: ['A', 'B', 'C', 'D'] },
    { key: 'group' as const, label: 'Group', type: 'number' as const, placeholder: '1' },
  ];

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label className="block text-xs font-medium text-zinc-300">{field.label}</label>
          {field.type === 'select' ? (
            <select
              value={formData[field.key]}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={cn(
                'w-full px-3 py-2 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-transparent',
                'transition-colors',
                errors?.[field.key] && 'border-red-500/50 focus:ring-red-500/50'
              )}
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={formData[field.key]}
              onChange={(e) => onChange(field.key, field.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
              placeholder={field.placeholder}
              className={cn(
                'w-full px-3 py-2 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-transparent',
                'transition-colors',
                errors?.[field.key] && 'border-red-500/50 focus:ring-red-500/50'
              )}
            />
          )}
          {errors?.[field.key] && (
            <p className="text-xs text-red-400">{errors[field.key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}