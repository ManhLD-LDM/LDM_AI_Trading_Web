'use client';
import { useState, useEffect } from 'react';
import ChartComponent from '@/components/Chart';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import { LineChart, History, Settings, User, LogOut } from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import { useTradingStore } from '@/store/useStore';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'live' | 'backtest' | 'settings'>('live');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const { user, logout } = useTradingStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTabChange = (tab: 'live' | 'backtest' | 'settings') => {
    if ((tab === 'backtest' || tab === 'settings') && !user) {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <main className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Sidebar for Navigation -> Bottom Nav on Mobile */}
      <div className="fixed md:static bottom-0 left-0 w-full md:w-16 h-16 md:h-full glass-panel border-t md:border-r md:border-t-0 border-white/5 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-4 z-50 shrink-0">
        <div className="hidden md:flex w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-violet-600 items-center justify-center font-bold text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.3)] mb-4">
          LD
        </div>
        
        <button 
          onClick={() => handleTabChange('live')}
          className={`p-3 rounded-xl transition-all duration-300 active:scale-95 ${activeTab === 'live' ? 'bg-white/10 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Live Trading"
        >
          <LineChart size={22} strokeWidth={1.5} />
        </button>
        
        <button 
          onClick={() => handleTabChange('backtest')}
          className={`p-3 rounded-xl transition-all duration-300 active:scale-95 ${activeTab === 'backtest' ? 'bg-white/10 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Backtest"
        >
          <History size={22} strokeWidth={1.5} />
        </button>
        
        <button 
          onClick={() => handleTabChange('settings')}
          className={`p-3 rounded-xl transition-all duration-300 active:scale-95 ${activeTab === 'settings' ? 'bg-white/10 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Settings"
        >
          <Settings size={22} strokeWidth={1.5} />
        </button>

        <div className="md:mt-auto md:mb-4 flex flex-row md:flex-col gap-0 md:gap-4">
          {mounted && (
            user ? (
              <button 
                onClick={logout}
                className="p-3 rounded-xl transition-all text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 active:scale-95"
                title="Sign Out"
              >
                <LogOut size={22} strokeWidth={1.5} />
              </button>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="p-3 rounded-xl transition-all duration-300 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 active:scale-95"
                title="Sign In"
              >
                <User size={22} strokeWidth={1.5} />
              </button>
            )
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0 h-full relative">
        {/* Tab: Live Trading */}
        {activeTab === 'live' && (
          <>
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
              <header className="h-16 border-b border-white/5 glass-panel flex items-center px-6 shrink-0 z-10 justify-between">
                <h1 className="text-lg font-medium tracking-wide text-slate-100">
                  Live Trading Dashboard
                </h1>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span>
                  Binance WS
                </div>
                {mounted && user && (
                  <div className="ml-4 text-sm text-amber-400 font-medium">
                    {user.email}
                  </div>
                )}
              </header>

              <div className="flex-1 flex flex-col p-4 pb-20 md:pb-4 overflow-hidden gap-4">
                <Toolbar onToggleAiSidebar={() => setIsAiSidebarOpen(true)} />
                <div className="flex-1 relative glass-panel rounded-2xl overflow-hidden shadow-2xl">
                  <ChartComponent />
                </div>
              </div>
            </div>
            <Sidebar isOpen={isAiSidebarOpen} onClose={() => setIsAiSidebarOpen(false)} />
          </>
        )}

        {/* Tab: Backtest */}
        {activeTab === 'backtest' && (
          <div className="flex-1 p-8 pb-24 md:pb-8 overflow-y-auto">
            <h2 className="text-2xl font-light mb-8 text-white tracking-wide">Backtest Strategy</h2>
            <div className="glass-panel p-8 rounded-2xl max-w-2xl">
              <p className="text-slate-400 text-sm mb-8">Select parameters to run backtest against historical data.</p>
              
              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Select Bot / Strategy</label>
                  <select className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
                    <option className="bg-slate-900">Kronos + Tech + Sentiment (Default)</option>
                    <option className="bg-slate-900">MACD Crossover</option>
                    <option className="bg-slate-900">RSI Mean Reversion</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Pair</label>
                    <select className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
                      <option className="bg-slate-900">BTCUSDT</option>
                      <option className="bg-slate-900">ETHUSDT</option>
                      <option className="bg-slate-900">SOLUSDT</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-wider font-semibold text-slate-400">Timeframe</label>
                    <select className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors">
                      <option className="bg-slate-900">1h</option>
                      <option className="bg-slate-900">4h</option>
                      <option className="bg-slate-900">1d</option>
                    </select>
                  </div>
                </div>
                
                <button className="mt-8 w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold py-3 rounded-lg transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(251,191,36,0.25)]">
                  Run Backtest
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Settings */}
        {activeTab === 'settings' && (
          <div className="flex-1 p-8 pb-24 md:pb-8 overflow-y-auto">
            <h2 className="text-2xl font-light mb-8 text-white tracking-wide">System Settings</h2>
            <div className="glass-panel p-8 rounded-2xl max-w-2xl">
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Gemini API Key</label>
                      <input type="password" placeholder="AIzaSy..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Binance API Key (Optional)</label>
                      <input type="password" placeholder="..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                  </div>
                </div>
                
                <div className="pt-6 border-t border-white/5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Risk Management</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Max Position Size (%)</label>
                      <input type="number" defaultValue="5" className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Stop Loss (%)</label>
                      <input type="number" defaultValue="2" className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                  </div>
                </div>
                
                <button className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold py-3 px-8 rounded-lg transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(251,191,36,0.25)]">
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
