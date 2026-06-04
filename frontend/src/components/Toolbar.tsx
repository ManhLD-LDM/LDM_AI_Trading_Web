'use client';
import { useState, useEffect, useRef } from 'react';
import { useTradingStore } from '@/store/useStore';
import { Search, ChevronDown, Activity } from 'lucide-react';
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

export default function Toolbar() {
  const { pair, interval, indicators, setPair, setInterval, toggleIndicator } = useTradingStore();
  
  const [pairs, setPairs] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']);
  const [isPairOpen, setIsPairOpen] = useState(false);
  const [searchPair, setSearchPair] = useState('');
  
  const [isIndLibraryOpen, setIsIndLibraryOpen] = useState(false);
  const [isIntervalOpen, setIsIntervalOpen] = useState(false);

  const pairRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<HTMLDivElement>(null);

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
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPairs = pairs.filter(p => p.toLowerCase().includes(searchPair.toLowerCase())).slice(0, 50); // limit to 50 for perf

  return (
    <div className="flex items-center gap-4 bg-slate-800/80 rounded-lg p-2 mb-4 border border-slate-700 shadow-sm relative z-40">
      
      {/* Pair Selector */}
      <div className="relative" ref={pairRef}>
        <button 
          onClick={() => setIsPairOpen(!isPairOpen)}
          className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 text-sm font-medium rounded-md px-3 py-1.5 hover:bg-slate-800 transition-colors w-32 justify-between"
        >
          {pair}
          <ChevronDown size={14} className="text-slate-400" />
        </button>
        
        {isPairOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-xl overflow-hidden flex flex-col max-h-64">
            <div className="p-2 border-b border-slate-700 flex items-center gap-2 bg-slate-900/50">
              <Search size={14} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Search pair..." 
                className="bg-transparent border-none outline-none text-sm text-slate-200 w-full"
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
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${pair === p ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-300 hover:bg-slate-700'}`}
                >
                  {p}
                </button>
              ))}
              {filteredPairs.length === 0 && (
                <div className="p-3 text-xs text-slate-500 text-center">No pairs found</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-slate-700"></div>

      {/* Timeframes */}
      <div className="relative shrink-0" ref={intervalRef}>
        <button 
          onClick={() => setIsIntervalOpen(!isIntervalOpen)}
          className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 text-sm font-medium rounded-md px-3 py-1.5 hover:bg-slate-800 transition-colors justify-between min-w-[70px]"
        >
          {ALL_INTERVALS.find(i => i.value === interval)?.label || interval}
          <ChevronDown size={14} className="text-slate-400" />
        </button>
        
        {isIntervalOpen && (
          <div className="absolute top-full left-0 mt-1 w-32 bg-slate-800 border border-slate-700 rounded-md shadow-xl overflow-hidden flex flex-col z-50">
            <div className="p-2 border-b border-slate-700 bg-slate-900/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Timeframe
            </div>
            <div className="grid grid-cols-2 gap-1 p-2">
              {ALL_INTERVALS.map((inv) => (
                <button
                  key={inv.value}
                  onClick={() => { setInterval(inv.value); setIsIntervalOpen(false); }}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    interval === inv.value
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-transparent text-slate-300 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  {inv.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-slate-700 shrink-0"></div>

      {/* Indicators Modal Trigger */}
      <div className="relative shrink-0">
        <button 
          onClick={() => setIsIndLibraryOpen(true)}
          className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm font-medium rounded-md px-3 py-1.5 hover:bg-indigo-500/20 transition-colors"
        >
          <Activity size={14} />
          Indicators
        </button>
      </div>

      <IndicatorLibraryModal 
        isOpen={isIndLibraryOpen} 
        onClose={() => setIsIndLibraryOpen(false)} 
      />
    </div>
  );
}
