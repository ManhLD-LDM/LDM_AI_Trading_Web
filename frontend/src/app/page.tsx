'use client';
import { useState } from 'react';
import ChartComponent from '@/components/Chart';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import { LineChart, History, Settings, User, LogOut } from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import { useTradingStore } from '@/store/useStore';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'live' | 'backtest' | 'settings'>('live');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { user, logout } = useTradingStore();

  const handleTabChange = (tab: 'live' | 'backtest' | 'settings') => {
    if ((tab === 'backtest' || tab === 'settings') && !user) {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <main className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Sidebar for Navigation */}
      <div className="w-16 h-full bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-6 z-20 shrink-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg mb-4">
          LD
        </div>
        
        <button 
          onClick={() => handleTabChange('live')}
          className={`p-3 rounded-xl transition-all active:scale-95 ${activeTab === 'live' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Live Trading"
        >
          <LineChart size={24} />
        </button>
        
        <button 
          onClick={() => handleTabChange('backtest')}
          className={`p-3 rounded-xl transition-all active:scale-95 ${activeTab === 'backtest' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Backtest"
        >
          <History size={24} />
        </button>
        
        <button 
          onClick={() => handleTabChange('settings')}
          className={`p-3 rounded-xl transition-all active:scale-95 ${activeTab === 'settings' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          title="Settings"
        >
          <Settings size={24} />
        </button>

        <div className="mt-auto mb-4 flex flex-col gap-4">
          {user ? (
            <button 
              onClick={logout}
              className="p-3 rounded-xl transition-all text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 active:scale-95"
              title="Sign Out"
            >
              <LogOut size={24} />
            </button>
          ) : (
            <button 
              onClick={() => setIsAuthModalOpen(true)}
              className="p-3 rounded-xl transition-all text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95"
              title="Sign In"
            >
              <User size={24} />
            </button>
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
              <header className="h-14 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md flex items-center px-6 shrink-0 z-10 justify-between">
                <h1 className="text-lg font-bold text-slate-200">
                  Live Trading Dashboard
                </h1>
                <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-700/50">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  Binance WS Connected
                </div>
                {user && (
                  <div className="ml-4 text-sm text-emerald-400 font-medium">
                    {user.email}
                  </div>
                )}
              </header>

              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <Toolbar />
                <div className="flex-1 relative bg-slate-900/40 rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl backdrop-blur-sm">
                  <ChartComponent />
                </div>
              </div>
            </div>
            <Sidebar />
          </>
        )}

        {/* Tab: Backtest */}
        {activeTab === 'backtest' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 text-white">Backtest Strategy</h2>
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 max-w-2xl">
              <p className="text-slate-400 mb-6">Select parameters to run backtest against historical data.</p>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-slate-300">Select Bot / Strategy</label>
                  <select className="bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500">
                    <option>Kronos + Tech + Sentiment (Default)</option>
                    <option>MACD Crossover</option>
                    <option>RSI Mean Reversion</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-300">Pair</label>
                    <select className="bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500">
                      <option>BTCUSDT</option>
                      <option>ETHUSDT</option>
                      <option>SOLUSDT</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-300">Timeframe</label>
                    <select className="bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500">
                      <option>1h</option>
                      <option>4h</option>
                      <option>1d</option>
                    </select>
                  </div>
                </div>
                
                <button className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-md transition-colors">
                  Run Backtest
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Settings */}
        {activeTab === 'settings' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 text-white">System Settings</h2>
            <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 max-w-2xl">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-white mb-2">API Configuration</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Gemini API Key</label>
                      <input type="password" placeholder="AIzaSy..." className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Binance API Key (Optional for live execution)</label>
                      <input type="password" placeholder="..." className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-lg font-medium text-white mb-2">Risk Management</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Max Position Size (%)</label>
                      <input type="number" defaultValue="5" className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Stop Loss (%)</label>
                      <input type="number" defaultValue="2" className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>
                
                <button className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
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
