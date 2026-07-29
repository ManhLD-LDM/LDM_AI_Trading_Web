'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import {
  Zap, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  DollarSign, ShieldCheck, ShieldAlert, Wallet, History,
  TrendingUp, TrendingDown, Ban, Sparkles, ArrowRight
} from 'lucide-react';

interface LiveBalance {
  balances: Record<string, { free: number; locked: number }>;
  usdt_free: number;
  testnet: boolean;
}

interface OpenOrder {
  order_id: number;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
}

interface LiveTrade {
  symbol: string;
  side?: string;
  action?: string;
  quantity: number;
  fill_price: number;
  take_profit?: number;
  stop_loss?: number;
  usdt_spent?: number;
  testnet: boolean;
  timestamp: string;
  success: boolean;
}

interface KeyStatus {
  has_keys: boolean;
  updated_at: string | null;
}

export default function LiveTradingDashboard() {
  const { token, pair, aiConsultPlan } = useTradingStore();

  // Mode
  const [testnet, setTestnet] = useState(true);

  // Order form
  const [symbol, setSymbol] = useState(pair);
  const [usdtAmount, setUsdtAmount] = useState('100');
  const [slPct, setSlPct] = useState('1.5');
  const [tpPct, setTpPct] = useState('3.0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [balance, setBalance] = useState<LiveBalance | null>(null);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [history, setHistory] = useState<LiveTrade[]>([]);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Binance key form
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { setSymbol(pair); }, [pair]);

  // Import parameters from active AI Consult Plan
  const handleApplyAiPlan = () => {
    if (!aiConsultPlan) return;
    setSymbol(aiConsultPlan.symbol);
    setSlPct(aiConsultPlan.stopLoss.percentage.toString());
    const tp1Pct = ((aiConsultPlan.takeProfit[0]?.price - aiConsultPlan.entryZone.idealEntry) / aiConsultPlan.entryZone.idealEntry * 100).toFixed(1);
    setTpPct(Math.abs(parseFloat(tp1Pct)).toString());
  };

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [bal, ord, hist, ks] = await Promise.allSettled([
        TradingAPI.getLiveBalance(testnet, token) as Promise<LiveBalance>,
        TradingAPI.getLiveOrders(token, undefined, testnet) as Promise<{ orders: OpenOrder[] }>,
        TradingAPI.getLiveHistory(token, 20) as Promise<{ trades: LiveTrade[] }>,
        TradingAPI.getBinanceKeysStatus(token),
      ]);
      if (bal.status === 'fulfilled') setBalance(bal.value);
      if (ord.status === 'fulfilled') setOrders(ord.value.orders || []);
      if (hist.status === 'fulfilled') setHistory(hist.value.trades || []);
      if (ks.status === 'fulfilled') setKeyStatus(ks.value);
    } finally {
      setIsLoading(false);
    }
  }, [token, testnet]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleBuy = async () => {
    if (!token || !usdtAmount) return;
    setIsSubmitting(true);
    setOrderMsg(null);
    try {
      const result = await TradingAPI.liveBuy({
        symbol: symbol.toUpperCase(),
        usdt_amount: parseFloat(usdtAmount),
        stop_loss_pct: parseFloat(slPct) / 100,
        take_profit_pct: parseFloat(tpPct) / 100,
        testnet,
      }, token) as LiveTrade & { error?: string };

      if (result.error) {
        setOrderMsg({ type: 'error', text: result.error });
      } else {
        setOrderMsg({
          type: 'success',
          text: `✓ Lệnh MUA thực thi @ $${result.fill_price?.toFixed(2)} | TP: $${result.take_profit} | SL: $${result.stop_loss}`
        });
        setUsdtAmount('');
        await fetchAll();
      }
    } catch (e: any) {
      setOrderMsg({ type: 'error', text: e.message || 'Lỗi đặt lệnh' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrders = async (sym: string) => {
    if (!token) return;
    try {
      await TradingAPI.cancelOrders(sym, testnet, token);
      setOrderMsg({ type: 'success', text: `Đã hủy tất cả lệnh chờ của ${sym}` });
      await fetchAll();
    } catch (e: any) {
      setOrderMsg({ type: 'error', text: e.message });
    }
  };

  const handleSaveKeys = async () => {
    if (!token || !apiKey || !apiSecret) return;
    setIsSavingKeys(true);
    setKeyMsg(null);
    try {
      await TradingAPI.saveBinanceKeys(apiKey, apiSecret, token);
      setKeyMsg({ type: 'success', text: 'Đã mã hóa & lưu API Key Binance thành công ✓' });
      setApiKey('');
      setApiSecret('');
      await fetchAll();
    } catch (e: any) {
      setKeyMsg({ type: 'error', text: e.message || 'Lưu thất bại' });
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleDeleteKeys = async () => {
    if (!token || !confirm('Xóa API Key Binance khỏi tài khoản?')) return;
    try {
      await TradingAPI.deleteBinanceKeys(token);
      setKeyMsg({ type: 'success', text: 'Đã xóa API Key' });
      setKeyStatus({ has_keys: false, updated_at: null });
    } catch (e: any) {
      setKeyMsg({ type: 'error', text: e.message });
    }
  };

  const hasKeys = keyStatus?.has_keys ?? false;
  const usdtFree = balance?.usdt_free ?? 0;
  const usdtVal = parseFloat(usdtAmount || '0');

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-4 font-sans text-zinc-100">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Zap size={20} className="text-emerald-400" />
            <span>Thực thi Giao dịch Binance Live</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Đặt lệnh trực tiếp sàn Binance Spot/Futures với mã hóa API Key bảo mật</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Testnet toggle */}
          <button
            onClick={() => setTestnet(!testnet)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
              testnet
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
            }`}
          >
            {testnet ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            {testnet ? 'BINANCE TESTNET' : '⚠️ LIVE REAL MONEY'}
          </button>
          <button onClick={fetchAll} className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl border border-zinc-800 transition-all cursor-pointer">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Live mode warning */}
      {!testnet && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/40 rounded-2xl p-4 text-rose-400">
          <AlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="text-sm font-bold">⚠️ CHẾ ĐỘ TIỀN THẬT (LIVE TRADING MODE)</p>
            <p className="text-xs opacity-90 mt-0.5">Mọi lệnh sẽ được khớp trên tài khoản Binance thực với quỹ vốn thật của bạn. Động cơ Quản trị Rủi ro được kích hoạt.</p>
          </div>
        </div>
      )}

      {/* No keys warning */}
      {!hasKeys && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-amber-400">
          <AlertTriangle size={18} className="shrink-0" />
          <p className="text-xs font-medium">Chưa cấu hình API Key Binance. Vui lòng nhập API Key & Secret bên dưới để bắt đầu đặt lệnh.</p>
        </div>
      )}

      {/* AI Consult Active Banner */}
      {aiConsultPlan && (
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 p-4 rounded-2xl border border-emerald-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-200">Kế hoạch AI Cố vấn {aiConsultPlan.symbol}:</span>
                <span className="text-xs font-mono font-bold text-emerald-400">SL: -{aiConsultPlan.stopLoss.percentage}%</span>
                <span className="text-xs font-mono text-zinc-400">• TP1: ${aiConsultPlan.takeProfit[0]?.price}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Khuyến nghị đòn bẩy: {aiConsultPlan.suggestedLeverage} • Tỷ lệ R:R 1:{aiConsultPlan.riskRewardRatio}</p>
            </div>
          </div>

          <button
            onClick={handleApplyAiPlan}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer shrink-0"
          >
            <span>Đồng bộ mốc AI SL/TP</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Order Panel ─────────────────────────────────────────────────── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
            <TrendingUp size={14} /> Đặt Lệnh Market + OCO (SL/TP)
          </h3>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Cặp Tài sản</label>
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="BTCUSDT" />
          </div>

          {/* USDT Amount */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex justify-between">
              <span>Số lượng USDT</span>
              {usdtFree > 0 && <span className="text-emerald-400 font-mono">(Khả dụng: ${usdtFree.toFixed(2)})</span>}
            </label>
            <input type="number" value={usdtAmount} onChange={e => setUsdtAmount(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              placeholder="100" min="11" step="any" />
            {/* Quick presets */}
            <div className="flex gap-1.5">
              {[25, 50, 100, 250].map(v => (
                <button key={v} onClick={() => setUsdtAmount(String(v))}
                  className={`flex-1 py-1 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                    usdtVal === v ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>${v}</button>
              ))}
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Stop Loss (%)</label>
              <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-rose-400 focus:outline-none focus:border-rose-500/50 transition-colors font-mono font-bold"
                min="0.5" max="10" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Take Profit (%)</label>
              <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-emerald-400 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono font-bold"
                min="1" max="50" step="0.5" />
            </div>
          </div>

          {/* R:R preview */}
          {slPct && tpPct && (
            <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950 rounded-xl p-2.5 border border-zinc-800 flex justify-between">
              <span>Tỷ lệ Risk:Reward</span>
              <span className="text-emerald-400 font-bold">1 : {(parseFloat(tpPct) / parseFloat(slPct)).toFixed(2)}</span>
            </div>
          )}

          <button
            onClick={handleBuy}
            disabled={isSubmitting || !hasKeys || !usdtAmount}
            className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              testnet
                ? 'bg-blue-500 hover:bg-blue-400 text-zinc-950 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
            }`}
          >
            {isSubmitting ? 'Đang thực thi...' : testnet ? 'Thực thi Lệnh Testnet' : '⚡ Thực thi Lệnh Tiền Thật LIVE'}
          </button>

          {orderMsg && (
            <div className={`flex items-start gap-2 text-xs rounded-xl p-3 border ${
              orderMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {orderMsg.type === 'success' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
              <span>{orderMsg.text}</span>
            </div>
          )}
        </div>

        {/* ── Balance ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-2"><Wallet size={14} /> Số dư Tài khoản Binance</span>
              {testnet && <span className="text-blue-400 text-[10px] font-mono font-bold">TESTNET</span>}
            </h3>

            {balance ? (
              <div className="space-y-2">
                <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-zinc-400">USDT Khả dụng</div>
                    <div className="text-xl font-bold text-zinc-100 font-mono mt-0.5">
                      ${usdtFree.toLocaleString('en', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <DollarSign size={28} className="text-emerald-500/30" />
                </div>
                {Object.entries(balance.balances).filter(([a]) => a !== 'USDT').slice(0, 5).map(([asset, b]) => (
                  <div key={asset} className="flex justify-between items-center bg-zinc-950 rounded-xl p-2.5 border border-zinc-800 text-xs font-mono">
                    <span className="font-bold text-zinc-200">{asset}</span>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{b.free.toFixed(4)}</div>
                      {b.locked > 0 && <div className="text-[10px] text-zinc-500">Khóa: {b.locked.toFixed(4)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic py-2">
                {hasKeys ? 'Đang tải số dư...' : 'Vui lòng thêm API Key để xem số dư'}
              </p>
            )}
          </div>

          {/* Open Orders */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-2"><ShieldCheck size={14} /> Lệnh Đang Chờ ({orders.length})</span>
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">Chưa có lệnh chờ nào</p>
            ) : (
              <div className="space-y-2">
                {orders.map(o => (
                  <div key={o.order_id} className="bg-zinc-950 rounded-xl p-3 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-200">{o.symbol}</div>
                      <div className="text-[10px] font-mono text-zinc-500">{o.type} | Số lượng: {o.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        o.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>{o.side}</span>
                      <button onClick={() => handleCancelOrders(o.symbol)}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer" title="Hủy lệnh">
                        <Ban size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Binance API Keys ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
              Quản lý API Key Binance
            </h3>

            {/* Status indicator */}
            <div className={`flex items-center gap-2 text-xs rounded-xl p-3 border ${
              hasKeys ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}>
              {hasKeys ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span>
                {hasKeys
                  ? `Đã cấu hình API Key (${new Date(keyStatus?.updated_at || Date.now()).toLocaleDateString()})`
                  : 'Chưa cấu hình API Key'}
              </span>
            </div>

            {/* Key inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Binance API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Nhập Binance API Key"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Binance API Secret
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={e => setApiSecret(e.target.value)}
                  placeholder="Nhập Binance API Secret"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveKeys}
                disabled={isSavingKeys || !apiKey || !apiSecret}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isSavingKeys ? 'Đang lưu...' : 'Mã hóa & Lưu Key'}
              </button>
              {hasKeys && (
                <button
                  onClick={handleDeleteKeys}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  Xóa Key
                </button>
              )}
            </div>

            {keyMsg && (
              <div className={`flex items-center gap-2 text-xs rounded-xl p-3 border ${
                keyMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                {keyMsg.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{keyMsg.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Trade History ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400 flex items-center gap-2 mb-4">
          <History size={14} /> Lịch sử Giao dịch Live
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-4">Chưa có lịch sử khớp lệnh</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left pb-2">Cặp coin</th>
                  <th className="text-left pb-2">Loại lệnh</th>
                  <th className="text-right pb-2">Giá Khớp</th>
                  <th className="text-right pb-2">Số lượng</th>
                  <th className="text-right pb-2">TP ($)</th>
                  <th className="text-right pb-2">SL ($)</th>
                  <th className="text-left pb-2">Môi trường</th>
                  <th className="text-right pb-2 hidden md:table-cell">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {history.map((t, i) => {
                  const side = t.action?.toUpperCase() || t.side?.toUpperCase() || 'BUY';
                  return (
                    <tr key={i} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 font-bold text-zinc-100">{t.symbol}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>{side}</span>
                      </td>
                      <td className="py-2.5 text-right text-zinc-200">${t.fill_price?.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 text-right text-zinc-400">{t.quantity?.toFixed(4)}</td>
                      <td className="py-2.5 text-right text-emerald-400">{t.take_profit ? `$${t.take_profit}` : '—'}</td>
                      <td className="py-2.5 text-right text-rose-400">{t.stop_loss ? `$${t.stop_loss}` : '—'}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.testnet ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-rose-500/20 text-rose-300'
                        }`}>{t.testnet ? 'TESTNET' : 'LIVE'}</span>
                      </td>
                      <td className="py-2.5 text-right text-zinc-500 hidden md:table-cell">
                        {new Date(t.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
