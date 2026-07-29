'use client';
import React, { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/useStore';
import { 
  Bot, 
  ChevronDown, 
  User as UserIcon, 
  LogOut, 
  ShieldCheck, 
  Activity, 
  Sparkles,
  Zap,
  FlaskConical
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onSelectTab: (tab: any) => void;
  onOpenAuth: () => void;
}

const AVAILABLE_PAIRS = [
  { symbol: 'BTCUSDT', label: 'BTC/USDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', label: 'ETH/USDT', name: 'Ethereum' },
  { symbol: 'SOLUSDT', label: 'SOL/USDT', name: 'Solana' },
  { symbol: 'PAXGUSDT', label: 'GOLD/PAXG', name: 'Gold Token' },
];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h'];

export default function Navbar({ activeTab, onSelectTab, onOpenAuth }: NavbarProps) {
  const { pair, setPair, interval, setInterval, user, logout } = useTradingStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* ── Brand Logo & Asset Selector ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 flex items-center justify-center text-zinc-950 font-black text-sm shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            LDM
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-zinc-100 tracking-tight">AI Trading Copilot</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Advisory v2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">Nền tảng Cố vấn & Phân tích Vị thế AI</p>
          </div>
        </div>

        {/* Pair Selector Dropdown */}
        <div className="relative group">
          <select
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="appearance-none bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold px-3 py-1.5 pr-8 rounded-xl cursor-pointer focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
          >
            {AVAILABLE_PAIRS.map((p) => (
              <option key={p.symbol} value={p.symbol} className="bg-zinc-900 text-zinc-200 py-1">
                {p.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Timeframe Switcher ────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-2 bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800/80">
        <div className="flex items-center gap-1 px-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setInterval(tf)}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                interval === tf
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Status & Account ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Realtime WS Status */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span>Binance Stream</span>
        </div>

        {/* User Account Button — Protected with mounted check against React Hydration mismatch */}
        {!mounted ? (
          <div className="h-8 w-24 bg-zinc-900/60 animate-pulse rounded-xl" />
        ) : user ? (
          <div className="flex items-center gap-2 bg-zinc-900/90 pl-3 pr-1.5 py-1 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span className="text-xs font-medium text-zinc-200 truncate max-w-[120px]">{user.email}</span>
            </div>
            <button
              onClick={logout}
              title="Đăng xuất"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer ml-1"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer"
          >
            <UserIcon size={14} className="text-emerald-400" />
            <span>Đăng nhập</span>
          </button>
        )}
      </div>
    </header>
  );
}
