import { useState } from 'react';
import { cn } from '../../lib/utils';
import { FormData } from '../../types/pipeline';
import { Plus, Trash2, Key } from 'lucide-react';

interface KeyValuePair {
  key: string;
  value: string;
}

interface TechnicalConstraintsProps {
  formData: FormData;
  onChange: (field: keyof FormData, value: any) => void;
}

function KeyValueEditor({ 
  label, 
  pairs, 
  onChange, 
  addPair,
  removePair,
  placeholderKey = 'Parameter',
  placeholderValue = 'Value'
}: { 
  label: string;
  pairs: KeyValuePair[];
  onChange: (index: number, key: string, value: string) => void;
  addPair: () => void;
  removePair: (index: number) => void;
  placeholderKey?: string;
  placeholderValue?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-zinc-300">{label}</label>
        <button type="button"
          onClick={addPair}
          className="px-2 py-1 text-xs font-medium text-zinc-400 hover:text-blue-300 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      
      {pairs.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">No parameters defined. Click Add to define custom parameters.</p>
      ) : (
        <div className="space-y-2">
          {pairs.map((pair, index) => (
            <div key={index} className="flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type="text"
                value={pair.key}
                onChange={(e) => onChange(index, e.target.value, pair.value)}
                placeholder={placeholderKey}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-transparent transition-colors"
              />
              <input
                type="text"
                value={pair.value}
                onChange={(e) => onChange(index, pair.key, e.target.value)}
                placeholder={placeholderValue}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-transparent transition-colors"
              />
              <button type="button"
                onClick={() => removePair(index)}
                className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                aria-label="Remove parameter"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TechnicalConstraints({ formData, onChange }: TechnicalConstraintsProps) {
  const [boundaryConditions, setBoundaryConditions] = useState<KeyValuePair[]>(
    Object.entries(formData.boundaryConditions).map(([key, value]) => ({ key, value }))
  );
  const [cadParameters, setCadParameters] = useState<KeyValuePair[]>(
    Object.entries(formData.cadParameters).map(([key, value]) => ({ key, value }))
  );

  const handleBoundaryChange = (index: number, key: string, value: string) => {
    const newPairs = [...boundaryConditions];
    newPairs[index] = { key, value };
    setBoundaryConditions(newPairs);
    const obj = Object.fromEntries(newPairs.filter(p => p.key).map(p => [p.key, p.value]));
    onChange('boundaryConditions', obj);
  };

  const handleCadChange = (index: number, key: string, value: string) => {
    const newPairs = [...cadParameters];
    newPairs[index] = { key, value };
    setCadParameters(newPairs);
    const obj = Object.fromEntries(newPairs.filter(p => p.key).map(p => [p.key, p.value]));
    onChange('cadParameters', obj);
  };

  return (
    <div className="space-y-4">
      <KeyValueEditor
        label="Boundary Conditions"
        pairs={boundaryConditions}
        onChange={handleBoundaryChange}
        addPair={() => setBoundaryConditions([...boundaryConditions, { key: '', value: '' }])}
        removePair={(index) => setBoundaryConditions(boundaryConditions.filter((_, i) => i !== index))}
        placeholderKey="Parameter (e.g., voltage_max)"
        placeholderValue="Value (e.g., 15)"
      />
      
      <KeyValueEditor
        label="CAD Parameters"
        pairs={cadParameters}
        onChange={handleCadChange}
        addPair={() => setCadParameters([...cadParameters, { key: '', value: '' }])}
        removePair={(index) => setCadParameters(cadParameters.filter((_, i) => i !== index))}
        placeholderKey="Parameter (e.g., board_thickness)"
        placeholderValue="Value (e.g., 1.6)"
      />
    </div>
  );
}