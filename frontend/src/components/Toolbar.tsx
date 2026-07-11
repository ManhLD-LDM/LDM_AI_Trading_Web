'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTradingStore } from '@/store/useStore';
import { Search, ChevronDown, Activity, Zap, Bot } from 'lucide-react';
import IndicatorLibraryModal from './IndicatorLibraryModal';

const ALL_INTERVALS = [
  { label: '1s', value: '1s' },
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '1h' },
  { label: '2h', value: '2h' },
  { label: '4h', value: '4h' },
  { label: '6h', value: '6h' },
  { label: '8h', value: '8h' },
  { label: '12h', value: '12h' },
  { label: '1D', value: '1d' },
  { label: '3D', value: '3d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1M' },
];

export default function Toolbar({ onToggleAiSidebar }: { onToggleAiSidebar?: () => void }) {
  const { pair, interval, setPair, setInterval, token } = useTradingStore();
  
  const [pairs, setPairs] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']);
  const [isPairOpen, setIsPairOpen] = useState(false);
  const [searchPair, setSearchPair] = useState('');
  
  const [isIndLibraryOpen, setIsIndLibraryOpen] = useState(false);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);

  const pairRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const [modelType, setModelType] = useState('lstm');
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const ALL_MODELS = [
    { label: '🔵 LSTM', value: 'lstm' },
    { label: '🟢 XGBoost', value: 'xgboost' },
    { label: '🟣 Transformer', value: 'transformer' },
    { label: '🟡 TCN', value: 'tcn' },
  ];

  const handleAnalyzeAI = async () => {
    setIsAnalyzing(true);
    try {
      const host = window.location.hostname;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
      await fetch(`${API_URL}/api/analysis/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ symbol: pair, interval: interval, model_type: modelType })
      });
    } catch (err) {
      console.error("Failed to trigger AI analysis", err);
    } finally {
      setTimeout(() => setIsAnalyzing(false), 2000);
    }
  };

  useEffect(() => {
    // Fetch all pairs from Binance
    fetch('https://api.binance.com/api/v3/exchangeInfo')
      .then(res => res.json())
      .then(data => {
        if (data && data.symbols) {
          const spotPairs = data.symbols
            .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map((s: any) => s.symbol);
          setPairs(spotPairs);
        }
      })
      .catch(err => console.error('Failed to fetch exchange info', err));
      
    const handleClickOutside = (event: MouseEvent) => {
      if (pairRef.current && !pairRef.current.contains(event.target as Node)) setIsPairOpen(false);
      if (intervalRef.current && !intervalRef.current.contains(event.target as Node)) setIsIntervalOpen(false);
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) setIsModelOpen(false);
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPairs = useMemo(() => {
    return pairs.filter(p => p.toLowerCase().includes(searchPair.toLowerCase())).slice(0, 50);
  }, [pairs, searchPair]);

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4 glass-panel rounded-xl md:rounded-2xl p-2 md:p-2.5 mb-2 md:mb-4 relative z-40 w-full shadow-xl">
      
      {/* Top row for mobile: Buttons */}
      <div className="flex flex-wrap items-center gap-2 justify-between md:justify-start w-full md:w-auto flex-1">
        
        {/* Pair Selector */}
        <div className="relative shrink-0 flex-1 md:flex-none min-w-[100px]" ref={pairRef}>
          <button 
            onClick={() => setIsPairOpen(!isPairOpen)}
            className="flex items-center gap-1.5 md:gap-2 w-full bg-white/5 border border-white/10 text-slate-200 text-xs md:text-sm font-medium rounded-lg md:rounded-xl px-2.5 md:px-4 py-2 hover:bg-white/10 transition-all duration-300 justify-between"
          >
            {pair}
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          
          {isPairOpen && (
            <div className="absolute top-full left-0 mt-2 w-48 md:w-52 glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-72 z-50">
              <div className="p-3 border-b border-white/10 flex items-center gap-2 bg-slate-950/50">
                <Search size={14} className="text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search pair..." 
                  className="bg-transparent border-none outline-none text-xs md:text-sm text-slate-200 w-full"
                  value={searchPair}
                  onChange={(e) => setSearchPair(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                {filteredPairs.map(p => (
                  <button
                    key={p}
                    onClick={() => { setPair(p); setIsPairOpen(false); setSearchPair(''); }}
                    className={`w-full text-left px-4 py-2.5 text-xs md:text-sm transition-colors ${pair === p ? 'bg-amber-500/10 text-amber-400 font-medium' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    {p}
                  </button>
                ))}
                {filteredPairs.length === 50 && (
                  <div className="p-4 text-[10px] md:text-xs text-slate-500 text-center italic">
                    Hiển thị 50 cặp đầu tiên.
                  </div>
                )}
                {filteredPairs.length === 0 && (
                  <div className="p-4 text-[10px] md:text-xs text-slate-500 text-center">No pairs found</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeframes */}
        <div className="relative shrink-0" ref={intervalRef}>
          <button 
            onClick={() => setIsIntervalOpen(!isIntervalOpen)}
            className="flex items-center gap-1.5 md:gap-2 w-full bg-white/5 border border-white/10 text-slate-200 text-xs md:text-sm font-medium rounded-lg md:rounded-xl px-2.5 md:px-4 py-2 hover:bg-white/10 transition-all duration-300 justify-between min-w-[60px] md:min-w-[80px]"
          >
            {ALL_INTERVALS.find(i => i.value === interval)?.label || interval}
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          
          {isIntervalOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 md:translate-x-0 md:left-0 mt-2 w-40 glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50">
              <div className="p-3 border-b border-white/10 bg-slate-950/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Timeframe
              </div>
              <div className="grid grid-cols-3 gap-1 p-2">
                {ALL_INTERVALS.map((inv) => (
                  <button
                    key={inv.value}
                    onClick={() => { setInterval(inv.value); setIsIntervalOpen(false); }}
                    className={`px-2 py-2 text-[10px] md:text-xs font-medium rounded-lg transition-all duration-200 active:scale-95 ${
                      interval === inv.value
                        ? 'bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/20'
                        : 'bg-transparent border border-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100'
                    }`}
                  >
                    {inv.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Model Selector */}
        <div className="relative shrink-0 flex-1 md:flex-none min-w-[110px]" ref={modelRef}>
          <button 
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="flex items-center gap-1.5 md:gap-2 w-full bg-white/5 border border-white/10 text-slate-200 text-xs md:text-sm font-medium rounded-lg md:rounded-xl px-2.5 md:px-4 py-2 hover:bg-white/10 transition-all duration-300 justify-between min-w-[110px] md:min-w-[140px]"
          >
            <span className="truncate">{ALL_MODELS.find(m => m.value === modelType)?.label || modelType}</span>
            <ChevronDown size={14} className="text-slate-400 shrink-0" />
          </button>
          
          {isModelOpen && (
            <div className="absolute top-full right-0 md:left-0 md:right-auto mt-2 w-40 md:w-48 glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50">
              <div className="p-3 border-b border-white/10 bg-slate-950/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                AI Core Engine
              </div>
              <div className="flex flex-col p-1.5 gap-1">
                {ALL_MODELS.map((mod) => (
                  <button
                    key={mod.value}
                    onClick={() => { setModelType(mod.value); setIsModelOpen(false); }}
                    className={`px-3 py-2 text-xs md:text-sm text-left transition-all duration-200 rounded-lg active:scale-95 ${
                      modelType === mod.value
                        ? 'bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20'
                        : 'bg-transparent border border-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100'
                    }`}
                  >
                    {mod.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Indicators Modal Trigger */}
        <div className="relative shrink-0">
          <button 
            onClick={() => setIsIndLibraryOpen(true)}
            className="flex items-center justify-center gap-1.5 w-full md:w-auto bg-white/5 border border-white/10 text-slate-300 text-xs md:text-sm font-medium rounded-lg md:rounded-xl px-2.5 md:px-4 py-2 hover:bg-white/10 hover:text-slate-100 transition-all duration-300"
            title="Indicators Library"
          >
            <Activity size={16} className="md:w-3.5 md:h-3.5" />
            <span className="hidden md:inline">Indicators</span>
          </button>
        </div>
      </div>

      <div className="hidden md:block h-5 w-[1px] bg-white/10 shrink-0 mx-2"></div>

      {/* Bottom row for mobile: AI actions */}
      <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
        {onToggleAiSidebar && (
          <button 
            onClick={onToggleAiSidebar}
            className="md:hidden flex items-center justify-center w-10 h-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all active:scale-95 shrink-0"
            title="Open AI Stream"
          >
            <Bot size={18} />
          </button>
        )}
        
        <button 
          onClick={handleAnalyzeAI}
          disabled={isAnalyzing}
          className={`flex flex-1 md:flex-none justify-center items-center gap-2 px-4 md:px-6 py-2.5 md:py-2 text-xs md:text-sm font-semibold rounded-lg md:rounded-xl transition-all duration-300 active:scale-95 ${
            isAnalyzing 
              ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-[0_4px_15px_rgba(251,191,36,0.25)] hover:shadow-[0_4px_20px_rgba(251,191,36,0.4)] hover:scale-[1.02]'
          }`}
        >
          <Zap size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
          {isAnalyzing ? 'Đang phân tích...' : 'Phân tích AI'}
        </button>
      </div>

      <IndicatorLibraryModal 
        isOpen={isIndLibraryOpen} 
        onClose={() => setIsIndLibraryOpen(false)} 
      />
    </div>
  );
}
