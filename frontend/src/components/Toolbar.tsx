'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTradingStore } from '@/store/useStore';
import { Search, ChevronDown, Activity, Sparkles, History } from 'lucide-react';
import IndicatorLibraryModal from './IndicatorLibraryModal';

const ALL_INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
];

export default function Toolbar({ onToggleAiSidebar }: { onToggleAiSidebar?: () => void }) {
  const { pair, interval, setPair, setInterval } = useTradingStore();
  
  const [pairs, setPairs] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'PAXGUSDT']);
  const [isPairOpen, setIsPairOpen] = useState(false);
  const [searchPair, setSearchPair] = useState('');
  
  const [isIndLibraryOpen, setIsIndLibraryOpen] = useState(false);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);

  const pairRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPairs = useMemo(() => {
    return pairs.filter(p => p.toLowerCase().includes(searchPair.toLowerCase())).slice(0, 50);
  }, [pairs, searchPair]);

  return (
    <div className="flex items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-2.5 z-30 w-full font-sans text-zinc-100 select-none shadow-xl">
      
      {/* Left controls: Asset selector, Timeframe, Indicators */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        
        {/* Pair Selector */}
        <div className="relative shrink-0" ref={pairRef}>
          <button 
            onClick={() => setIsPairOpen(!isPairOpen)}
            className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono font-bold rounded-xl px-3 py-2 hover:bg-zinc-800 transition-all cursor-pointer min-w-[120px] justify-between"
          >
            <span>{pair}</span>
            <ChevronDown size={14} className="text-zinc-400" />
          </button>
          
          {isPairOpen && (
            <div className="absolute top-full left-0 mt-2 w-52 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-72 z-50">
              <div className="p-3 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/60">
                <Search size={14} className="text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Tìm cặp coin..." 
                  className="bg-transparent border-none outline-none text-xs text-zinc-200 w-full font-mono"
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
                    className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors ${pair === p ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-zinc-300 hover:bg-zinc-800/50'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="relative shrink-0" ref={intervalRef}>
          <button 
            onClick={() => setIsIntervalOpen(!isIntervalOpen)}
            className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-mono font-bold rounded-xl px-3 py-2 hover:bg-zinc-800 transition-all cursor-pointer min-w-[70px] justify-between"
          >
            <span>{ALL_INTERVALS.find(i => i.value === interval)?.label || interval}</span>
            <ChevronDown size={14} className="text-zinc-400" />
          </button>
          
          {isIntervalOpen && (
            <div className="absolute top-full left-0 mt-2 w-40 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50">
              <div className="p-2.5 border-b border-zinc-800 text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
                Timeframe
              </div>
              <div className="grid grid-cols-2 gap-1 p-2 font-mono">
                {ALL_INTERVALS.map((inv) => (
                  <button
                    key={inv.value}
                    onClick={() => { setInterval(inv.value); setIsIntervalOpen(false); }}
                    className={`px-2 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                      interval === inv.value
                        ? 'bg-emerald-500 text-zinc-950 font-bold'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {inv.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Indicators Modal Trigger */}
        <button 
          onClick={() => setIsIndLibraryOpen(true)}
          className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-medium rounded-xl px-3 py-2 hover:bg-zinc-800 transition-all cursor-pointer"
          title="Chỉ số kỹ thuật"
        >
          <Activity size={14} className="text-emerald-400" />
          <span className="hidden sm:inline">Chỉ số Kỹ thuật</span>
        </button>
      </div>

      {/* Right controls: AI Log Toggle */}
      {onToggleAiSidebar && (
        <button 
          onClick={onToggleAiSidebar}
          className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded-xl px-3 py-2 hover:bg-emerald-500/20 transition-all cursor-pointer text-xs"
        >
          <History size={14} />
          <span className="hidden sm:inline">Lịch sử Lệnh AI</span>
        </button>
      )}

      <IndicatorLibraryModal 
        isOpen={isIndLibraryOpen} 
        onClose={() => setIsIndLibraryOpen(false)} 
      />
    </div>
  );
}
