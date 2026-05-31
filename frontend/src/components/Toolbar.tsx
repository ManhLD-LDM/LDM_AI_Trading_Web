'use client';
import { useTradingStore } from '@/store/useStore';

export default function Toolbar() {
  const { pair, interval, setPair, setInterval } = useTradingStore();

  const pairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
  const intervals = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '1h', value: '1h' },
    { label: '4h', value: '4h' },
    { label: '1D', value: '1d' },
  ];

  return (
    <div className="flex items-center gap-4 bg-slate-800/80 rounded-lg p-2 mb-4 border border-slate-700 shadow-sm">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-400 font-medium">Pair:</label>
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {pairs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="h-4 w-[1px] bg-slate-700"></div>

      <div className="flex items-center gap-1">
        <span className="text-sm text-slate-400 font-medium mr-1">Timeframe:</span>
        {intervals.map((inv) => (
          <button
            key={inv.value}
            onClick={() => setInterval(inv.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              interval === inv.value
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                : 'bg-transparent text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-transparent'
            }`}
          >
            {inv.label}
          </button>
        ))}
      </div>
    </div>
  );
}
