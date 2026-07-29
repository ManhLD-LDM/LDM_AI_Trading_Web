'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, Wallet, BarChart3, Clock, Sparkles, Target, ArrowRight
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
  const { token, pair, aiConsultPlan } = useTradingStore();

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

  // Auto fill parameters from active AI Consult Plan if clicked
  const handleApplyAiPlan = () => {
    if (!aiConsultPlan) return;
    setSymbol(aiConsultPlan.symbol);
    setAction(aiConsultPlan.recommendation === 'SHORT' ? 'sell' : 'buy');
    setPrice(aiConsultPlan.entryZone.idealEntry.toString());
    const estQty = (100 / aiConsultPlan.entryZone.idealEntry).toFixed(5);
    setQuantity(estQty);
  };

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
      setTradeMessage({ type: 'success', text: `✓ Lệnh ${action.toUpperCase()} thành công. Khớp giá: $${parseFloat(price).toLocaleString()} | Số dư: $${result.balance?.toFixed(2)}${result.pnl != null ? ` | PnL: $${result.pnl.toFixed(2)}` : ''}` });
      setPrice('');
      setQuantity('');
      await fetchPortfolio();
    } catch (e: any) {
      setTradeMessage({ type: 'error', text: e.message || 'Lỗi đặt lệnh' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!token || !confirm('Khôi phục danh mục Paper Trading về $10,000 vốn ban đầu?')) return;
    try {
      await TradingAPI.resetPortfolio(token);
      setTradeMessage({ type: 'success', text: 'Đã khôi phục vốn về $10,000' });
      await fetchPortfolio();
    } catch (e: any) {
      setTradeMessage({ type: 'error', text: e.message || 'Khôi phục thất bại' });
    }
  };

  const posValue = parseFloat(price || '0') * parseFloat(quantity || '0');

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-4 font-sans text-zinc-100">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <span>Paper Trading Simulator</span>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Số dư Giả lập
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Giả lập giao dịch thời gian thực với $10,000 vốn ảo — không rủi ro tài sản thật</p>
        </div>
        <button onClick={fetchPortfolio} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all cursor-pointer border border-zinc-800">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Risk Alert Banner */}
      {riskStatus?.trading_halted && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400">
          <AlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="text-sm font-semibold">Tạm dừng Giao dịch (Trading Halted)</p>
            <p className="text-xs opacity-80 mt-0.5">{riskStatus.halt_reason}</p>
          </div>
        </div>
      )}

      {/* AI Consult Active Banner (If Available) */}
      {aiConsultPlan && (
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 p-4 rounded-2xl border border-emerald-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-200">Kế hoạch AI Cố vấn Đang mở:</span>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  aiConsultPlan.recommendation === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {aiConsultPlan.recommendation} {aiConsultPlan.symbol}
                </span>
                <span className="text-xs font-mono text-zinc-400">Target Ideal Entry: ${aiConsultPlan.entryZone.idealEntry.toLocaleString()}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">SL: ${aiConsultPlan.stopLoss.price} (-{aiConsultPlan.stopLoss.percentage}%) • R:R 1:{aiConsultPlan.riskRewardRatio}</p>
            </div>
          </div>

          <button
            onClick={handleApplyAiPlan}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer shrink-0"
          >
            <span>Nạp Tham số AI</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Order Panel ─────────────────────────────────────────────────── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Đặt Lệnh Giả Lập</h3>

          {/* Buy / Sell toggle */}
          <div className="flex rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 p-1 gap-1">
            <button
              onClick={() => setAction('buy')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                action === 'buy' ? 'bg-emerald-500 text-zinc-950 shadow-md font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              MUA (LONG)
            </button>
            <button
              onClick={() => setAction('sell')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                action === 'sell' ? 'bg-rose-500 text-zinc-950 shadow-md font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              BÁN (SHORT)
            </button>
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Cặp Tài sản (Symbol)</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="BTCUSDT"
            />
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Giá Khớp (USDT)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="0.00"
              min="0"
              step="any"
            />
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Số lượng Coin</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="0.001"
              min="0"
              step="any"
            />
          </div>

          {/* Position value preview */}
          {posValue > 0 && (
            <div className="text-xs text-zinc-400 bg-zinc-950 rounded-xl p-3 flex justify-between border border-zinc-800 font-mono">
              <span>Giá trị Vị thế:</span>
              <span className="text-emerald-400 font-bold">${posValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={handleExecute}
            disabled={isSubmitting || !price || !quantity || riskStatus?.trading_halted}
            className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              action === 'buy'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-rose-500 hover:bg-rose-400 text-zinc-950 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
            }`}
          >
            {isSubmitting ? 'Đang gửi lệnh...' : `${action === 'buy' ? 'Mở Lệnh MUA (LONG)' : 'Mở Lệnh BÁN (SHORT)'}`}
          </button>

          {/* Trade message */}
          {tradeMessage && (
            <div className={`flex items-center gap-2 text-xs rounded-xl p-3 border ${
              tradeMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {tradeMessage.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span>{tradeMessage.text}</span>
            </div>
          )}
        </div>

        {/* ── Portfolio Stats ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Balance + Equity */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
              <Wallet size={14} /> Tài khoản & Tổng Tài sản
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-800">
                <div className="text-[11px] text-zinc-400 mb-1">Số dư Tiền mặt</div>
                <div className="text-lg font-bold text-zinc-100 font-mono">
                  ${portfolio?.balance?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
                </div>
              </div>
              <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-800">
                <div className="text-[11px] text-zinc-400 mb-1">Tổng Vốn Equity</div>
                <div className={`text-lg font-bold font-mono ${(portfolio?.total_equity ?? 0) >= 10000 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${portfolio?.total_equity?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-2"><BarChart3 size={14} /> Vị thế Đang mở</span>
              <span className="font-mono text-zinc-400">({portfolio?.position_count ?? 0})</span>
            </h3>
            {portfolio && Object.keys(portfolio.positions).length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">Chưa có vị thế nào đang mở</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(portfolio?.positions ?? {}).map(([sym, pos]) => (
                  <div key={sym} className="flex items-center justify-between bg-zinc-950 rounded-xl p-3 border border-zinc-800">
                    <div>
                      <div className="text-xs font-bold text-zinc-100">{sym}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Giá TB: ${pos.avg_price.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-emerald-400">{pos.quantity.toFixed(4)}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">${(pos.quantity * pos.avg_price).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Risk Status ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
              <AlertTriangle size={14} /> Trạng thái Rủi ro
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Mạch thua liên tiếp:</span>
                <span className={`font-mono font-bold ${(riskStatus?.consecutive_losses ?? 0) >= 3 ? 'text-rose-400' : 'text-zinc-200'}`}>
                  {riskStatus?.consecutive_losses ?? 0} / {riskStatus?.max_consecutive_losses ?? 5}
                </span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                <div
                  className="bg-rose-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(((riskStatus?.consecutive_losses ?? 0) / (riskStatus?.max_consecutive_losses ?? 5)) * 100, 100)}%` }}
                />
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-zinc-800/80">
                <span className="text-zinc-400">PnL trong ngày:</span>
                <span className={`font-mono font-bold ${(riskStatus?.daily_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${(riskStatus?.daily_pnl ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Vốn đỉnh (Peak Equity):</span>
                <span className="font-mono font-bold text-zinc-200">${(riskStatus?.peak_equity ?? 10000).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="w-full py-2.5 rounded-xl text-xs text-zinc-400 border border-zinc-800 hover:border-rose-500/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer font-medium"
          >
            Khôi phục Tài khoản về $10,000
          </button>
        </div>
      </div>

      {/* ── Trade History ────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center gap-2 mb-4">
          <Clock size={14} /> Lịch sử Lệnh gần đây
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-4">Chưa có lịch sử lệnh</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left pb-2">Cặp coin</th>
                  <th className="text-left pb-2">Loại lệnh</th>
                  <th className="text-right pb-2">Giá</th>
                  <th className="text-right pb-2">Số lượng</th>
                  <th className="text-right pb-2">PnL ($)</th>
                  <th className="text-right pb-2 hidden md:table-cell">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {history.map((t) => (
                  <tr key={t._id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 font-bold text-zinc-100">{t.symbol}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded font-bold ${t.action === 'buy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {t.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-zinc-200">${t.price.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 text-right text-zinc-400">{t.quantity.toFixed(4)}</td>
                    <td className="py-2.5 text-right">
                      {t.pnl != null ? (
                        <span className={`font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                        </span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="py-2.5 text-right text-zinc-500 hidden md:table-cell">
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
