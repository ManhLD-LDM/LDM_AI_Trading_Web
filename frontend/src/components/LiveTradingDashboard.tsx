'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';
import {
  Zap, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  DollarSign, ShieldCheck, ShieldAlert, Wallet, History,
  TrendingUp, TrendingDown, Ban
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
  const { token, pair } = useTradingStore();

  // Mode
  const [testnet, setTestnet] = useState(true);

  // Order form
  const [symbol, setSymbol] = useState(pair);
  const [usdtAmount, setUsdtAmount] = useState('');
  const [slPct, setSlPct] = useState('2');
  const [tpPct, setTpPct] = useState('4');
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
          text: `✓ BUY executed @ $${result.fill_price?.toFixed(4)} | TP: $${result.take_profit} | SL: $${result.stop_loss}`
        });
        setUsdtAmount('');
        await fetchAll();
      }
    } catch (e: any) {
      setOrderMsg({ type: 'error', text: e.message || 'Trade failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrders = async (sym: string) => {
    if (!token) return;
    try {
      await TradingAPI.cancelOrders(sym, testnet, token);
      setOrderMsg({ type: 'success', text: `Cancelled all orders for ${sym}` });
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
      setKeyMsg({ type: 'success', text: 'Binance keys saved securely ✓' });
      setApiKey('');
      setApiSecret('');
      await fetchAll();
    } catch (e: any) {
      setKeyMsg({ type: 'error', text: e.message || 'Failed to save keys' });
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleDeleteKeys = async () => {
    if (!token || !confirm('Delete Binance API keys?')) return;
    try {
      await TradingAPI.deleteBinanceKeys(token);
      setKeyMsg({ type: 'success', text: 'Binance keys deleted' });
      setKeyStatus({ has_keys: false, updated_at: null });
    } catch (e: any) {
      setKeyMsg({ type: 'error', text: e.message });
    }
  };

  const hasKeys = keyStatus?.has_keys ?? false;
  const usdtFree = balance?.usdt_free ?? 0;
  const usdtVal = parseFloat(usdtAmount || '0');

  return (
    <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Zap size={20} className="text-amber-400" />
            Live Trading
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Direct Binance order execution</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Testnet toggle */}
          <button
            onClick={() => setTestnet(!testnet)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              testnet
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
            }`}
          >
            {testnet ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
            {testnet ? 'TESTNET' : '⚠️ LIVE'}
          </button>
          <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Live mode warning */}
      {!testnet && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/40 rounded-xl p-4 text-rose-400">
          <AlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="text-sm font-bold">⚠️ LIVE TRADING MODE — Real Money</p>
            <p className="text-xs opacity-80 mt-0.5">Orders will execute with real funds on your Binance account. Risk Manager is enforced.</p>
          </div>
        </div>
      )}

      {/* No keys warning */}
      {!hasKeys && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-400">
          <AlertTriangle size={18} className="shrink-0" />
          <p className="text-sm">Binance API keys not configured. Add them in the section below to trade.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Order Panel ─────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <TrendingUp size={12} /> Market BUY + OCO
          </h3>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Symbol</label>
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
              placeholder="BTCUSDT" />
          </div>

          {/* USDT Amount */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              USDT Amount
              {usdtFree > 0 && <span className="ml-2 text-slate-600">(free: ${usdtFree.toFixed(2)})</span>}
            </label>
            <input type="number" value={usdtAmount} onChange={e => setUsdtAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
              placeholder="100" min="11" step="any" />
            {/* Quick presets */}
            <div className="flex gap-1.5">
              {[25, 50, 100, 250].map(v => (
                <button key={v} onClick={() => setUsdtAmount(String(v))}
                  className={`flex-1 py-1 text-[10px] rounded-md border transition-all cursor-pointer ${
                    usdtVal === v ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'border-white/10 text-slate-500 hover:text-slate-300'
                  }`}>${v}</button>
              ))}
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Stop Loss %</label>
              <div className="relative">
                <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-rose-400 focus:outline-none focus:border-rose-500/50 transition-colors font-mono"
                  min="0.5" max="10" step="0.5" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Take Profit %</label>
              <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-emerald-400 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                min="1" max="50" step="0.5" />
            </div>
          </div>

          {/* R:R preview */}
          {slPct && tpPct && (
            <div className="text-[10px] text-slate-600 bg-white/5 rounded-lg px-3 py-2 flex justify-between">
              <span>Risk:Reward</span>
              <span className="text-slate-400 font-mono">1 : {(parseFloat(tpPct) / parseFloat(slPct)).toFixed(2)}</span>
            </div>
          )}

          <button
            onClick={handleBuy}
            disabled={isSubmitting || !hasKeys || !usdtAmount}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              testnet
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 shadow-[0_4px_15px_rgba(251,191,36,0.25)]'
            }`}
          >
            {isSubmitting ? 'Executing...' : testnet ? 'Test BUY (Testnet)' : '⚡ Execute LIVE BUY'}
          </button>

          {orderMsg && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 ${
              orderMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {orderMsg.type === 'success' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
              <span>{orderMsg.text}</span>
            </div>
          )}
        </div>

        {/* ── Balance ──────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Wallet size={12} /> Account Balance
              {testnet && <span className="text-sky-500/70 text-[9px] font-bold">TESTNET</span>}
            </h3>

            {balance ? (
              <div className="space-y-2">
                <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500">USDT Free</div>
                    <div className="text-xl font-semibold text-slate-100 font-mono mt-0.5">
                      ${usdtFree.toLocaleString('en', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <DollarSign size={28} className="text-amber-400/30" />
                </div>
                {Object.entries(balance.balances).filter(([a]) => a !== 'USDT').slice(0, 5).map(([asset, b]) => (
                  <div key={asset} className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-300">{asset}</span>
                    <div className="text-right">
                      <div className="font-mono text-amber-400">{b.free.toFixed(6)}</div>
                      {b.locked > 0 && <div className="text-slate-600">locked: {b.locked.toFixed(6)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">
                {hasKeys ? 'Loading balance...' : 'Add Binance API keys to see balance'}
              </p>
            )}
          </div>

          {/* Open Orders */}
          <div className="glass-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <ShieldCheck size={12} /> Open Orders ({orders.length})
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No open orders</p>
            ) : (
              <div className="space-y-2">
                {orders.map(o => (
                  <div key={o.order_id} className="bg-white/5 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{o.symbol}</div>
                      <div className="text-[10px] text-slate-500">{o.type} | qty: {o.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        o.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>{o.side}</span>
                      <button onClick={() => handleCancelOrders(o.symbol)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer" title="Cancel">
                        <Ban size={12} />
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
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Binance API Keys
            </h3>

            {/* Status indicator */}
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
              hasKeys ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
            }`}>
              {hasKeys ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              <span>
                {hasKeys
                  ? `Keys configured${keyStatus?.updated_at ? ` (${new Date(keyStatus.updated_at).toLocaleDateString()})` : ''}`
                  : 'No keys configured'}
              </span>
            </div>

            {/* Key inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Your Binance API Key"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  API Secret
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={e => setApiSecret(e.target.value)}
                  placeholder="Your Binance API Secret"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveKeys}
                disabled={isSavingKeys || !apiKey || !apiSecret}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {isSavingKeys ? 'Saving...' : 'Save Encrypted'}
              </button>
              {hasKeys && (
                <button
                  onClick={handleDeleteKeys}
                  className="py-2 px-3 rounded-lg text-xs text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  Delete
                </button>
              )}
            </div>

            {keyMsg && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                keyMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {keyMsg.type === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {keyMsg.text}
              </div>
            )}

            <p className="text-[10px] text-slate-600 leading-relaxed">
              Keys are encrypted with Fernet/PBKDF2-SHA256 before storage.
              Never shared or logged. Recommended: enable IP whitelist on Binance.
            </p>
          </div>
        </div>
      </div>

      {/* ── Trade History ─────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4">
          <History size={12} /> Live Trade History
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-600 italic text-center py-4">No live trades yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="text-left pb-2">Symbol</th>
                  <th className="text-left pb-2">Side</th>
                  <th className="text-right pb-2">Fill Price</th>
                  <th className="text-right pb-2">Qty</th>
                  <th className="text-right pb-2">TP</th>
                  <th className="text-right pb-2">SL</th>
                  <th className="text-left pb-2">Mode</th>
                  <th className="text-right pb-2 hidden md:table-cell">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((t, i) => {
                  const side = t.action?.toUpperCase() || t.side?.toUpperCase() || 'BUY';
                  return (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-mono text-slate-200">{t.symbol}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>{side}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">${t.fill_price?.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 text-right font-mono text-slate-400">{t.quantity?.toFixed(6)}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400">{t.take_profit ? `$${t.take_profit}` : '—'}</td>
                      <td className="py-2.5 text-right font-mono text-rose-400">{t.stop_loss ? `$${t.stop_loss}` : '—'}</td>
                      <td className="py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          t.testnet ? 'bg-sky-500/15 text-sky-400' : 'bg-rose-500/20 text-rose-300'
                        }`}>{t.testnet ? 'TEST' : 'LIVE'}</span>
                      </td>
                      <td className="py-2.5 text-right text-slate-600 hidden md:table-cell">
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
