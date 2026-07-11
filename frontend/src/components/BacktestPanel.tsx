'use client';
import { useState } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import { Play, TrendingUp, TrendingDown, BarChart3, Activity, Percent, Target } from 'lucide-react';

interface BacktestResult {
  initial_balance: number;
  final_equity: number;
  roi_percent: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown_percent: number;
  sharpe_ratio: number;
  trades: Array<{ time: string; type: string; price: number; qty: number; pnl?: number }>;
  equity_curve: Array<{ time: string; equity: number }>;
}

const STRATEGIES = [
  { value: 'kronos', label: 'Kronos AI (MTF)', description: 'ML model with 5-timeframe analysis' },
  { value: 'macd', label: 'MACD Crossover', description: 'Classic momentum strategy' },
  { value: 'rsi', label: 'RSI Mean Reversion', description: 'Oversold/overbought signals' },
];

const MODEL_TYPES = ['lstm', 'xgboost', 'transformer', 'tcn'];
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'];
const INTERVALS = ['15m', '1h', '4h', '1d'];
const LIMITS = [200, 500, 1000, 2000, 5000];

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const color = positive === undefined ? 'text-slate-100' : positive ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className={`text-xl font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-1">{sub}</div>}
    </div>
  );
}

// Micro equity chart using SVG sparkline
function EquitySparkline({ data }: { data: Array<{ equity: number }> }) {
  if (!data || data.length < 2) return null;
  const equities = data.map(d => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;
  const w = 400;
  const h = 80;
  const pts = equities
    .map((e, i) => `${(i / (equities.length - 1)) * w},${h - ((e - min) / range) * h}`)
    .join(' ');
  const isUp = equities[equities.length - 1] >= equities[0];

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
        <Activity size={12} /> Equity Curve
      </div>
      <div className="relative bg-white/5 rounded-xl p-4 overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
              <stop offset="100%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            points={pts}
            fill="none"
            stroke={isUp ? '#10b981' : '#ef4444'}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon
            points={`0,${h} ${pts} ${w},${h}`}
            fill="url(#eqGrad)"
          />
        </svg>
        <div className="absolute top-3 right-4 flex gap-4 text-xs">
          <span className="text-slate-600">${min.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
          <span className="text-slate-400">${max.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>
    </div>
  );
}

export default function BacktestPanel() {
  const { token } = useTradingStore();
  const [strategy, setStrategy] = useState('kronos');
  const [pair, setPair] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState(1000);
  const [modelType, setModelType] = useState('lstm');

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!token) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const data = await TradingAPI.runBacktest({
        strategy,
        symbol: pair,
        interval,
        limit,
        model_type: modelType,
      }, token) as { data: BacktestResult };
      setResult(data.data);
    } catch (e: any) {
      setError(e.message || 'Backtest failed');
    } finally {
      setIsRunning(false);
    }
  };

  const isPositive = (result?.roi_percent ?? 0) >= 0;

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-5">

      <div>
        <h2 className="text-xl font-semibold text-white">Strategy Backtest</h2>
        <p className="text-xs text-slate-500 mt-0.5">Test strategies against historical market data</p>
      </div>

      {/* Config Card */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Configuration</h3>

        {/* Strategy selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          {STRATEGIES.map(s => (
            <button
              key={s.value}
              onClick={() => setStrategy(s.value)}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                strategy === s.value
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
              }`}
            >
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-[11px] opacity-70 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>

        {/* Params row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pair</label>
            <select value={pair} onChange={e => setPair(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
              {PAIRS.map(p => <option key={p} className="bg-slate-900">{p}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Timeframe</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
              {INTERVALS.map(i => <option key={i} className="bg-slate-900">{i}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Candles</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
              {LIMITS.map(l => <option key={l} className="bg-slate-900">{l}</option>)}
            </select>
          </div>
          {strategy === 'kronos' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Model</label>
              <select value={modelType} onChange={e => setModelType(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
                {MODEL_TYPES.map(m => <option key={m} className="bg-slate-900">{m.toUpperCase()}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleRun}
          disabled={isRunning || !token}
          className="mt-5 flex items-center justify-center gap-2 w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold py-3 rounded-xl transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(251,191,36,0.2)] cursor-pointer"
        >
          <Play size={15} fill="currentColor" />
          {isRunning ? 'Running...' : 'Run Backtest'}
        </button>
        {!token && <p className="text-xs text-slate-600 text-center mt-2">Sign in to run backtests</p>}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Final Equity" value={`$${result.final_equity.toLocaleString('en', { maximumFractionDigits: 0 })}`} sub={`Started $${result.initial_balance.toLocaleString()}`} />
            <MetricCard label="ROI" value={`${result.roi_percent >= 0 ? '+' : ''}${result.roi_percent}%`} positive={isPositive} />
            <MetricCard label="Win Rate" value={`${result.win_rate}%`} positive={result.win_rate >= 50} sub={`${result.total_trades} trades`} />
            <MetricCard label="Profit Factor" value={result.profit_factor === Infinity ? '∞' : result.profit_factor.toFixed(2)} positive={result.profit_factor > 1} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Max Drawdown" value={`${result.max_drawdown_percent}%`} positive={result.max_drawdown_percent < 20} />
            <MetricCard label="Sharpe Ratio" value={result.sharpe_ratio.toFixed(2)} positive={result.sharpe_ratio > 1} />
            <MetricCard label="Total Trades" value={result.total_trades.toString()} />
            <MetricCard label="Initial Balance" value={`$${result.initial_balance.toLocaleString()}`} />
          </div>

          {/* Equity curve */}
          <div className="glass-panel rounded-2xl p-5">
            <EquitySparkline data={result.equity_curve} />

            {/* Recent trades */}
            {result.trades && result.trades.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <BarChart3 size={12} /> Recent Trades (last 20)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-600 uppercase tracking-wider border-b border-white/5">
                        <th className="text-left pb-2">Type</th>
                        <th className="text-right pb-2">Price</th>
                        <th className="text-right pb-2">Qty</th>
                        <th className="text-right pb-2">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {result.trades.slice(-20).reverse().map((t, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded font-semibold ${
                              t.type === 'buy' ? 'bg-emerald-500/15 text-emerald-400' :
                              t.type.startsWith('sell') ? 'bg-rose-500/15 text-rose-400' :
                              'bg-slate-500/15 text-slate-400'
                            }`}>{t.type.replace('_', ' ').toUpperCase()}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-slate-300">${t.price.toLocaleString('en', { maximumFractionDigits: 2 })}</td>
                          <td className="py-2 text-right font-mono text-slate-500">{t.qty?.toFixed(5)}</td>
                          <td className="py-2 text-right font-mono">
                            {t.pnl != null ? (
                              <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
