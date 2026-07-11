'use client';
import { useState, useEffect } from 'react';
import ChartComponent from '@/components/Chart';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import PaperTradingDashboard from '@/components/PaperTradingDashboard';
import BacktestPanel from '@/components/BacktestPanel';
import LiveTradingDashboard from '@/components/LiveTradingDashboard';
import { LineChart, History, Settings, User, LogOut, FlaskConical, Zap } from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';

type Tab = 'live' | 'paper' | 'live-trade' | 'backtest' | 'settings';

const NAV_ITEMS: Array<{ id: Tab; icon: React.ReactNode; label: string; requiresAuth: boolean }> = [
  { id: 'live', icon: <LineChart size={22} strokeWidth={1.5} />, label: 'Live', requiresAuth: false },
  { id: 'paper', icon: <FlaskConical size={22} strokeWidth={1.5} />, label: 'Paper', requiresAuth: true },
  { id: 'live-trade', icon: <Zap size={22} strokeWidth={1.5} />, label: 'Live Trade', requiresAuth: true },
  { id: 'backtest', icon: <History size={22} strokeWidth={1.5} />, label: 'Backtest', requiresAuth: true },
  { id: 'settings', icon: <Settings size={22} strokeWidth={1.5} />, label: 'Settings', requiresAuth: true },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const { user, token, logout } = useTradingStore();

  const [settings, setSettings] = useState({
    geminiApiKey: '',
    discordWebhook: '',
    telegramBotToken: '',
    telegramChatId: '',
    maxPositionSize: 10,
    stopLoss: 2,
    maxDrawdown: 20,
    dailyLossLimit: 5,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  useEffect(() => {
    setMounted(true);
    if (user?.preferences?.settings) {
      setSettings(s => ({ ...s, ...user.preferences.settings }));
    }
  }, [user]);

  const handleSaveSettings = async () => {
    if (!token) return;
    setIsSavingSettings(true);
    setSettingsMsg('');
    try {
      await TradingAPI.me(token); // ensure token valid
      const { apiPut } = await import('@/lib/api');
      await apiPut('/api/user/preferences', { settings }, token);
      setSettingsMsg('Settings saved ✓');
    } catch (e: any) {
      setSettingsMsg('Error: ' + (e.message || 'save failed'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    const item = NAV_ITEMS.find(n => n.id === tab);
    if (item?.requiresAuth && !user) {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <main className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">

      {/* ── Sidebar Nav ──────────────────────────────────────────────────────── */}
      <div className="fixed md:static bottom-0 left-0 w-full md:w-16 h-16 md:h-full glass-panel border-t md:border-r md:border-t-0 border-white/5 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-4 z-50 shrink-0">

        {/* Logo */}
        <div className="hidden md:flex w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-violet-600 items-center justify-center font-bold text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.3)] mb-4 shrink-0">
          LD
        </div>

        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => handleTabChange(item.id)}
            title={item.label}
            className={`p-3 rounded-xl transition-all duration-300 active:scale-95 cursor-pointer group relative ${
              activeTab === item.id
                ? 'bg-white/10 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {item.icon}
            {/* Tooltip on hover (desktop) */}
            <span className="hidden md:block absolute left-full ml-3 px-2 py-1 bg-slate-800 text-xs text-slate-300 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
              {item.label}
            </span>
          </button>
        ))}

        {/* Auth buttons */}
        <div className="md:mt-auto md:mb-4 flex flex-row md:flex-col gap-0 md:gap-4">
          {mounted && (
            user ? (
              <button
                onClick={logout}
                className="p-3 rounded-xl transition-all text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 active:scale-95 cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={22} strokeWidth={1.5} />
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="p-3 rounded-xl transition-all duration-300 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 active:scale-95 cursor-pointer"
                title="Sign In"
              >
                <User size={22} strokeWidth={1.5} />
              </button>
            )
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-w-0 h-full relative">

        {/* Tab: Live */}
        {activeTab === 'live' && (
          <>
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
              <header className="h-16 border-b border-white/5 glass-panel flex items-center px-6 shrink-0 z-10 justify-between">
                <h1 className="text-xl md:text-2xl font-bold text-gray-100">Dashboard</h1>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                    Binance WS
                  </div>
                  {mounted && user && (
                    <div className="text-sm text-amber-400 font-medium truncate max-w-[150px]">
                      {user.email}
                    </div>
                  )}
                </div>
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

        {/* Tab: Paper Trading */}
        {activeTab === 'paper' && <PaperTradingDashboard />}

        {/* Tab: Live Trading */}
        {activeTab === 'live-trade' && <LiveTradingDashboard />}

        {/* Tab: Backtest */}
        {activeTab === 'backtest' && <BacktestPanel />}

        {/* Tab: Settings */}
        {activeTab === 'settings' && (
          <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">System Settings</h2>
              <p className="text-xs text-slate-500 mt-0.5">Configure API keys, alerts, and risk parameters</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">

              {/* API Keys */}
              <div className="glass-panel rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">API Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Gemini API Key</label>
                    <input type="password" value={settings.geminiApiKey} onChange={e => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      placeholder="AIzaSy..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                </div>
              </div>

              {/* Alert Webhooks */}
              <div className="glass-panel rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Alert Channels</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Discord Webhook URL</label>
                    <input type="password" value={settings.discordWebhook} onChange={e => setSettings({ ...settings, discordWebhook: e.target.value })}
                      placeholder="https://discord.com/api/webhooks/..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Telegram Bot Token</label>
                      <input type="password" value={settings.telegramBotToken} onChange={e => setSettings({ ...settings, telegramBotToken: e.target.value })}
                        placeholder="1234:abc..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Chat ID</label>
                      <input type="text" value={settings.telegramChatId} onChange={e => setSettings({ ...settings, telegramChatId: e.target.value })}
                        placeholder="-100..." className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk Parameters */}
              <div className="glass-panel rounded-2xl p-5 space-y-4 md:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Risk Parameters</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'maxPositionSize', label: 'Max Position Size (%)', min: 1, max: 100 },
                    { key: 'stopLoss', label: 'Stop Loss (%)', min: 0.5, max: 20 },
                    { key: 'maxDrawdown', label: 'Max Drawdown (%)', min: 5, max: 50 },
                    { key: 'dailyLossLimit', label: 'Daily Loss Limit (%)', min: 1, max: 20 },
                  ].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
                      <input
                        type="number"
                        value={settings[key as keyof typeof settings]}
                        onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })}
                        min={min} max={max} step="0.5"
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 max-w-4xl">
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-semibold py-2.5 px-8 rounded-xl transition-all active:scale-[0.98] shadow-[0_4px_15px_rgba(251,191,36,0.25)] cursor-pointer"
              >
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
              {settingsMsg && (
                <span className={`text-sm ${settingsMsg.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {settingsMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
