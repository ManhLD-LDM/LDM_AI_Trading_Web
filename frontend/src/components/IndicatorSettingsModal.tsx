import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTradingStore, IndicatorConfig } from '@/store/useStore';
import { INDICATOR_REGISTRY } from '@/lib/indicatorsRegistry';

interface Props {
  instanceId: string | null;
  onClose: () => void;
}

export default function IndicatorSettingsModal({ instanceId, onClose }: Props) {
  const { indicators, updateIndicatorParams } = useTradingStore();
  
  const indicator = indicators.find(ind => ind.instanceId === instanceId);
  const def = indicator ? INDICATOR_REGISTRY.find(d => d.id === indicator.indicatorId) : null;
  
  const [params, setParams] = useState<Record<string, any>>({});

  useEffect(() => {
    if (indicator) {
      setParams(indicator.params);
    }
  }, [indicator]);

  if (!instanceId || !indicator || !def) return null;

  const handleSave = () => {
    updateIndicatorParams(instanceId, params);
    onClose();
  };

  const handleChange = (key: string, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-slate-200">{def.name} Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {Object.entries(def.params).map(([key, paramDef]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-400 mb-1">{paramDef.name}</label>
              
              {paramDef.type === 'number' && (
                <input 
                  type="number"
                  min={paramDef.min}
                  max={paramDef.max}
                  value={params[key] ?? paramDef.default}
                  onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              )}

              {paramDef.type === 'color' && (
                <div className="flex items-center gap-2">
                  <input 
                    type="color"
                    value={params[key] ?? paramDef.default}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                  />
                  <span className="text-slate-300 text-sm">{params[key] ?? paramDef.default}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/50">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors text-sm font-medium border border-emerald-500/30"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}
