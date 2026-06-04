import React, { useState } from 'react';
import { Search, X, Plus, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { useTradingStore } from '@/store/useStore';
import { INDICATOR_REGISTRY, getDefaultParams } from '@/lib/indicatorsRegistry';
import IndicatorSettingsModal from './IndicatorSettingsModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function IndicatorLibraryModal({ isOpen, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(null);
  
  const { indicators, addIndicator, removeIndicator, toggleIndicator } = useTradingStore();

  if (!isOpen) return null;

  const categories = ['All', 'Trend', 'Oscillator', 'Volatility', 'Volume'];
  
  const filteredRegistry = INDICATOR_REGISTRY.filter(ind => {
    const matchesSearch = ind.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ind.shortName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || ind.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAdd = (indicatorId: string) => {
    const def = INDICATOR_REGISTRY.find(i => i.id === indicatorId);
    if (def) {
      addIndicator(indicatorId, getDefaultParams(def));
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-xl font-bold text-slate-200">Indicators</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Active Indicators */}
        {indicators.length > 0 && (
          <div className="p-4 border-b border-slate-800 bg-slate-900">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Active Indicators ({indicators.length})</h3>
            <div className="flex flex-wrap gap-2">
              {indicators.map(ind => {
                const def = INDICATOR_REGISTRY.find(i => i.id === ind.indicatorId);
                return (
                  <div key={ind.instanceId} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${ind.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
                    <button onClick={() => toggleIndicator(ind.instanceId)} className="text-sm font-medium hover:opacity-80">
                      {def?.shortName}
                    </button>
                    <button 
                      onClick={() => setSettingsInstanceId(ind.instanceId)}
                      className="opacity-50 hover:opacity-100 transition-opacity"
                    >
                      <SettingsIcon size={14} />
                    </button>
                    <button onClick={() => removeIndicator(ind.instanceId)} className="opacity-50 hover:opacity-100 hover:text-rose-400 transition-colors ml-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="p-4 border-b border-slate-800 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search indicators..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Library List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredRegistry.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No indicators found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredRegistry.map(ind => (
                <div key={ind.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 border border-transparent hover:border-slate-700 transition-all">
                  <div>
                    <div className="font-medium text-slate-200">{ind.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{ind.category} • {ind.shortName}</div>
                  </div>
                  <button 
                    onClick={() => handleAdd(ind.id)}
                    className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-emerald-500 hover:text-slate-950"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      
      {/* Settings Sub-modal */}
      <IndicatorSettingsModal 
        instanceId={settingsInstanceId} 
        onClose={() => setSettingsInstanceId(null)} 
      />
    </div>
  );
}
