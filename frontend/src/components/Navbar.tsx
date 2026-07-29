'use client';
import React, { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/useStore';
import { 
  User as UserIcon, 
  LogOut, 
  ShieldCheck
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onSelectTab: (tab: any) => void;
  onOpenAuth: () => void;
}

export default function Navbar({ activeTab, onSelectTab, onOpenAuth }: NavbarProps) {
  const { user, logout } = useTradingStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 flex items-center justify-center text-zinc-950 font-black text-sm shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          LDM
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-zinc-100 tracking-tight">AI Trading Copilot</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Advisory v2.0
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">Nền tảng Cố vấn & Phân tích Vị thế AI</p>
        </div>
      </div>

      {/* Status & Account */}
      <div className="flex items-center gap-3">
        {/* Realtime WS Status */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span>Binance Stream</span>
        </div>

        {/* User Account Button */}
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
