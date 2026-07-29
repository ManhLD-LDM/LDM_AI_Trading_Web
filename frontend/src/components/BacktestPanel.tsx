'use client';
import { useState } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import { Play, Activity, BarChart3, Calendar, Clock, Info, Sparkles } from 'lucide-react';

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
  { value: 'kronos', label: 'Kronos AI (MTF)', description: 'Mô hình lượng tử đa khung thời gian' },
  { value: 'macd', label: 'MACD Crossover', description: 'Chiến lược cắt đường trung bình động' },
  { value: 'rsi', label: 'RSI Mean Reversion', description: 'Giao dịch vùng quá mua / quá bán' },
];
const MODEL_TYPES = ['lstm', 'tcn', 'transformer', 'xgboost'];
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'];
const INTERVALS = ['15m', '1h', '4h', '1d'];
const LIMITS = [500, 1000, 2000, 5000];

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const color = positive === undefined ? 'text-zinc-100' : positive ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">{label}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function EquitySparkline({ data }: { data: Array<{ equity: number }> }) {
  if (!data || data.length < 2) return null;
  const equities = data.map(d => d.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  const range = max - min || 1;
  const w = 400; const h = 80;
  const pts = equities
    .map((e, i) => `${(i / (equities.length - 1)) * w},${h - ((e - min) / range) * h}`)
    .join(' ');
  const isUp = equities[equities.length - 1] >= equities[0];
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
        <Activity size={14} /> Biểu đồ Tăng trưởng Vốn (Equity Curve)
      </div>
      <div className="relative bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#10b981' : '#f43f5e'} stopOpacity="0.3" />
              <stop offset="100%" stopColor={isUp ? '#10b981' : '#f43f5e'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={pts} fill="none" stroke={isUp ? '#10b981' : '#f43f5e'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#eqGrad)" />
        </svg>
        <div className="absolute top-3 right-4 flex gap-4 text-xs font-mono">
          <span className="text-zinc-500">Min: ${min.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
          <span className="text-emerald-400 font-bold">Max: ${max.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function BacktestPanel() {
  const { token } = useTradingStore();

  const [mode, setMode] = useState<'limit' | 'date_range'>('limit');
  const [strategy, setStrategy] = useState('kronos');
  const [pair, setPair] = useState('BTCUSDT');
  const [modelType, setModelType] = useState('lstm');

  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState(1000);

  const [startDate, setStartDate] = useState(daysAgo(7));
  const [endDate, setEndDate] = useState(today());

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [fetchSummary, setFetchSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!token) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    setFetchSummary('');
    try {
      const payload: Record<string, unknown> = {
        strategy,
        symbol: pair,
        model_type: modelType,
      };

      if (mode === 'date_range') {
        payload.start_date = startDate;
        payload.end_date = endDate;
      } else {
        payload.interval = interval;
        payload.limit = limit;
      }

      const res = await TradingAPI.runBacktest(payload as any, token) as {
        data: BacktestResult;
        fetch_summary?: string;
      };
      setResult(res.data);
      setFetchSummary(res.fetch_summary || '');
    } catch (e: any) {
      setError(e.message || 'Backtest thất bại');
    } finally {
      setIsRunning(false);
    }
  };

  const isPositive = (result?.roi_percent ?? 0) >= 0;

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-5 font-sans text-zinc-100">

      <div>
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <BarChart3 size={20} className="text-emerald-400" />
          <span>Backtest Chiến lược AI</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">Kiểm thử hiệu năng mô hình AI & chiến lược với dữ liệu nến Binance quá khứ</p>
      </div>

      {/* Config Card */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Thiết lập Tham số Backtest</h3>

        {/* Strategy */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STRATEGIES.map(s => (
            <button key={s.value} onClick={() => setStrategy(s.value)}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                strategy === s.value
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}>
              <div className="text-xs font-bold">{s.label}</div>
              <div className="text-[11px] font-normal opacity-80 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl p-1 w-fit">
          <button onClick={() => setMode('limit')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === 'limit' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}>
            <Clock size={12} /> N nến gần nhất
          </button>
          <button onClick={() => setMode('date_range')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === 'date_range' ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}>
            <Calendar size={12} /> Theo khoảng ngày (1m)
          </button>
        </div>

        {/* Params */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Cặp Tài sản</label>
            <select value={pair} onChange={e => setPair(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
              {PAIRS.map(p => <option key={p} className="bg-zinc-900">{p}</option>)}
            </select>
          </div>

          {mode === 'limit' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Khung thời gian</label>
                <select value={interval} onChange={e => setInterval(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
                  {INTERVALS.map(i => <option key={i} className="bg-zinc-900">{i}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Số lượng nến</label>
                <select value={limit} onChange={e => setLimit(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
                  {LIMITS.map(l => <option key={l} className="bg-zinc-900">{l}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Ngày bắt đầu</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Ngày kết thúc</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono" />
              </div>
            </>
          )}

          {strategy === 'kronos' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Mô hình AI</label>
              <select value={modelType} onChange={e => setModelType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono">
                {MODEL_TYPES.map(m => <option key={m} value={m} className="bg-zinc-900">{m.toUpperCase()}</option>)}
              </select>
            </div>
          )}
        </div>

        <button onClick={handleRun} disabled={isRunning || !token}
          className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.2)] cursor-pointer uppercase tracking-wider text-xs">
          <Play size={15} fill="currentColor" />
          {isRunning ? 'Đang chạy backtest...' : 'Bắt đầu Chạy Backtest'}
        </button>
        {!token && <p className="text-xs text-zinc-500 text-center">Đăng nhập để chạy backtest</p>}
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
          {fetchSummary && (
            <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5">
              <Activity size={13} className="text-emerald-400" /> {fetchSummary}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Tổng Vốn Cuối" value={`$${result.final_equity.toLocaleString('en', { maximumFractionDigits: 0 })}`} sub={`Vốn ban đầu $${result.initial_balance.toLocaleString()}`} />
            <MetricCard label="Tỷ lệ Lợi nhuận ROI" value={`${result.roi_percent >= 0 ? '+' : ''}${result.roi_percent}%`} positive={isPositive} />
            <MetricCard label="Tỷ lệ Thắng (Win Rate)" value={`${result.win_rate}%`} positive={result.win_rate >= 50} sub={`${result.total_trades} lệnh`} />
            <MetricCard label="Profit Factor" value={result.profit_factor === Infinity ? '∞' : result.profit_factor.toFixed(2)} positive={result.profit_factor > 1} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Sụt giảm tối đa (Max DD)" value={`${result.max_drawdown_percent}%`} positive={result.max_drawdown_percent < 20} />
            <MetricCard label="Chỉ số Sharpe" value={result.sharpe_ratio.toFixed(2)} positive={result.sharpe_ratio > 1} />
            <MetricCard label="Tổng số Lệnh" value={result.total_trades.toString()} />
            <MetricCard label="Vốn Ban Đầu" value={`$${result.initial_balance.toLocaleString()}`} />
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <EquitySparkline data={result.equity_curve} />

            {result.trades && result.trades.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
                  <BarChart3 size={14} /> Chi tiết Lịch sử Giao dịch Backtest (20 lệnh gần nhất)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                        <th className="text-left pb-2">Loại lệnh</th>
                        <th className="text-right pb-2">Giá khớp</th>
                        <th className="text-right pb-2">Số lượng</th>
                        <th className="text-right pb-2">PnL ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {result.trades.slice(-20).reverse().map((t, i) => (
                        <tr key={i} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              t.type === 'buy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              t.type.startsWith('sell') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-zinc-800 text-zinc-400'
                            }`}>{t.type.replace('_', ' ').toUpperCase()}</span>
                          </td>
                          <td className="py-2.5 text-right text-zinc-200">${t.price.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                          <td className="py-2.5 text-right text-zinc-400">{t.qty?.toFixed(5)}</td>
                          <td className="py-2.5 text-right">
                            {t.pnl != null ? (
                              <span className={`font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
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
