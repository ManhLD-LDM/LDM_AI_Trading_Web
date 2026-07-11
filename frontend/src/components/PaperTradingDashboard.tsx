'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, Wallet, BarChart3, Clock
} from 'lucide-react';

interface Portfolio {
  balance: number;
  positions: Record<string, { quantity: number; avg_price: number }>;
  total_equity: number;
  position_count: number;
}

interface Trade {
  _id: string;
  symbol: string;
  action: string;
  price: number;
  quantity: number;
  pnl: number | null;
  fee: number;
  timestamp: string;
}

interface RiskStatus {
  trading_halted: boolean;
  halt_reason: string;
  consecutive_losses: number;
  max_consecutive_losses: number;
  daily_pnl: number;
  peak_equity: number;
}

export default function PaperTradingDashboard() {
  const { token, pair } = useTradingStore();

  // Paper trade form
  const [symbol, setSymbol] = useState(pair);
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Portfolio data
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<Trade[]>([]);
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    if (!token) return;
    try {
      const [port, hist, risk] = await Promise.all([
        TradingAPI.getPortfolio(token) as Promise<Portfolio>,
        TradingAPI.getTradeHistory(token, 1, 10) as Promise<{ trades: Trade[] }>,
        fetch(`${process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:8000`}/api/paper/risk-status`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()) as Promise<RiskStatus>,
      ]);
      setPortfolio(port);
      setHistory(hist.trades || []);
      setRiskStatus(risk);
    } catch (e) {
      console.error('Failed to fetch portfolio', e);
    }
  }, [token]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  // Sync symbol with selected pair
  useEffect(() => { setSymbol(pair); }, [pair]);

  const handleExecute = async () => {
    if (!token || !price || !quantity) return;
    setIsSubmitting(true);
    setTradeMessage(null);
    try {
      const result = await TradingAPI.executePaperTrade({
        symbol: symbol.toUpperCase(),
        action,
        price: parseFloat(price),
        quantity: parseFloat(quantity),
      }, token) as { balance: number; pnl: number | null };
      setTradeMessage({ type: 'success', text: `✓ ${action.toUpperCase()} executed. Balance: $${result.balance?.toFixed(2)}${result.pnl != null ? ` | PnL: $${result.pnl.toFixed(2)}` : ''}` });
      setPrice('');
      setQuantity('');
      await fetchPortfolio();
    } catch (e: any) {
      setTradeMessage({ type: 'error', text: e.message || 'Trade failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!token || !confirm('Reset paper portfolio to $10,000? This will delete all trade history.')) return;
    try {
      await TradingAPI.resetPortfolio(token);
      setTradeMessage({ type: 'success', text: 'Portfolio reset to $10,000' });
      await fetchPortfolio();
    } catch (e: any) {
      setTradeMessage({ type: 'error', text: e.message || 'Reset failed' });
    }
  };

  const posValue = parseFloat(price || '0') * parseFloat(quantity || '0');

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Paper Trading</h2>
          <p className="text-xs text-slate-500 mt-0.5">Simulated trading — no real funds at risk</p>
        </div>
        <button onClick={fetchPortfolio} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Risk Alert Banner */}
      {riskStatus?.trading_halted && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400">
          <AlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="text-sm font-semibold">Trading Halted</p>
            <p className="text-xs opacity-80 mt-0.5">{riskStatus.halt_reason}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Order Panel ─────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">New Order</h3>

          {/* Buy / Sell toggle */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setAction('buy')}
              className={`flex-1 py-2 text-sm font-semibold transition-all cursor-pointer ${action === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
            >BUY</button>
            <button
              onClick={() => setAction('sell')}
              className={`flex-1 py-2 text-sm font-semibold transition-all cursor-pointer ${action === 'sell' ? 'bg-rose-500/20 text-rose-400' : 'text-slate-500 hover:text-slate-300'}`}
            >SELL</button>
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Symbol</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
              placeholder="BTCUSDT"
            />
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Price (USDT)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
              placeholder="0.00"
              min="0"
              step="any"
            />
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
              placeholder="0.001"
              min="0"
              step="any"
            />
          </div>

          {/* Position value preview */}
          {posValue > 0 && (
            <div className="text-xs text-slate-500 bg-white/5 rounded-lg px-3 py-2 flex justify-between">
              <span>Position Value</span>
              <span className="text-slate-300 font-mono">${posValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={handleExecute}
            disabled={isSubmitting || !price || !quantity || riskStatus?.trading_halted}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              action === 'buy'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
            }`}
          >
            {isSubmitting ? 'Executing...' : `${action === 'buy' ? 'Place Buy' : 'Place Sell'} Order`}
          </button>

          {/* Trade message */}
          {tradeMessage && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 ${
              tradeMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {tradeMessage.type === 'success' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              <span>{tradeMessage.text}</span>
            </div>
          )}
        </div>

        {/* ── Portfolio Stats ──────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Balance + Equity */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Wallet size={14} /> Portfolio
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">Cash Balance</div>
                <div className="text-lg font-semibold text-slate-100 font-mono">
                  ${portfolio?.balance?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <div className="text-xs text-slate-500 mb-1">Total Equity</div>
                <div className={`text-lg font-semibold font-mono ${(portfolio?.total_equity ?? 0) >= 10000 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${portfolio?.total_equity?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <BarChart3 size={14} /> Positions ({portfolio?.position_count ?? 0})
            </h3>
            {portfolio && Object.keys(portfolio.positions).length === 0 ? (
              <p className="text-xs text-slate-600 italic">No open positions</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(portfolio?.positions ?? {}).map(([sym, pos]) => (
                  <div key={sym} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2.5">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{sym}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Avg: ${pos.avg_price.toFixed(4)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-amber-400">{pos.quantity.toFixed(6)}</div>
                      <div className="text-[10px] text-slate-500">${(pos.quantity * pos.avg_price).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Risk Status ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <AlertTriangle size={14} /> Risk Status
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Consecutive Losses</span>
                <span className={`font-mono ${(riskStatus?.consecutive_losses ?? 0) >= 3 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {riskStatus?.consecutive_losses ?? 0} / {riskStatus?.max_consecutive_losses ?? 5}
                </span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <div
                  className="bg-rose-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(((riskStatus?.consecutive_losses ?? 0) / (riskStatus?.max_consecutive_losses ?? 5)) * 100, 100)}%` }}
                />
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500">Daily PnL</span>
                <span className={`font-mono ${(riskStatus?.daily_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${(riskStatus?.daily_pnl ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Peak Equity</span>
                <span className="font-mono text-slate-300">${(riskStatus?.peak_equity ?? 10000).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="w-full py-2 rounded-xl text-xs text-slate-500 border border-white/10 hover:border-rose-500/30 hover:text-rose-400 hover:bg-rose-500/5 transition-all cursor-pointer"
          >
            Reset Portfolio to $10,000
          </button>
        </div>
      </div>

      {/* ── Trade History ────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4">
          <Clock size={14} /> Recent Trades
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-600 italic text-center py-4">No trades yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="text-left pb-2">Symbol</th>
                  <th className="text-left pb-2">Action</th>
                  <th className="text-right pb-2">Price</th>
                  <th className="text-right pb-2">Qty</th>
                  <th className="text-right pb-2">PnL</th>
                  <th className="text-right pb-2 hidden md:table-cell">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((t) => (
                  <tr key={t._id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 font-mono text-slate-200">{t.symbol}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.action === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {t.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-300">${t.price.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 text-right font-mono text-slate-400">{t.quantity.toFixed(6)}</td>
                    <td className="py-2.5 text-right font-mono">
                      {t.pnl != null ? (
                        <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right text-slate-600 hidden md:table-cell">
                      {new Date(t.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
