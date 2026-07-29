'use client';
import { useState, useEffect } from 'react';
import ChartComponent from '@/components/Chart';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import Navbar from '@/components/Navbar';
import AIConsultantCard from '@/components/AIConsultantCard';
import PaperTradingDashboard from '@/components/PaperTradingDashboard';
import BacktestPanel from '@/components/BacktestPanel';
import LiveTradingDashboard from '@/components/LiveTradingDashboard';
import { LineChart, History, Settings, User, LogOut, FlaskConical, Zap, Bot } from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import { useTradingStore } from '@/store/useStore';
import { TradingAPI } from '@/lib/api';

type Tab = 'live' | 'paper' | 'live-trade' | 'backtest' | 'settings';

const NAV_ITEMS: Array<{ id: Tab; icon: React.ReactNode; label: string; requiresAuth: boolean }> = [
  { id: 'live', icon: <Bot size={20} strokeWidth={1.75} />, label: 'AI Copilot', requiresAuth: false },
  { id: 'paper', icon: <FlaskConical size={20} strokeWidth={1.75} />, label: 'Paper Sim', requiresAuth: true },
  { id: 'live-trade', icon: <Zap size={20} strokeWidth={1.75} />, label: 'Live Exec', requiresAuth: true },
  { id: 'backtest', icon: <History size={20} strokeWidth={1.75} />, label: 'Backtest', requiresAuth: true },
  { id: 'settings', icon: <Settings size={20} strokeWidth={1.75} />, label: 'Settings', requiresAuth: true },
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
      setSettingsMsg('Đã lưu cấu hình hệ thống ✓');
    } catch (e: any) {
      setSettingsMsg('Lỗi: ' + (e.message || 'Lưu thất bại'));
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
    <main className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* ── Left Sidebar Nav ─────────────────────────────────────────────────── */}
      <div className="fixed md:static bottom-0 left-0 w-full md:w-16 h-16 md:h-full bg-zinc-900/90 border-t md:border-r md:border-t-0 border-zinc-800 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-4 z-40 shrink-0">
        {/* Logo Icon */}
        <div className="hidden md:flex w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center font-bold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] mb-4 shrink-0">
          LD
        </div>

        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleTabChange(item.id)}
            title={item.label}
            className={`p-3 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer group relative ${
              activeTab === item.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {item.icon}
            <span className="hidden md:block absolute left-full ml-3 px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-50">
              {item.label}
            </span>
          </button>
        ))}

        {/* Auth Buttons */}
        <div className="md:mt-auto md:mb-4 flex flex-row md:flex-col gap-0 md:gap-4">
          {mounted &&
            (user ? (
              <button
                onClick={logout}
                className="p-3 rounded-xl transition-all text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 active:scale-95 cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut size={20} strokeWidth={1.75} />
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="p-3 rounded-xl transition-all text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 cursor-pointer"
                title="Đăng nhập"
              >
                <User size={20} strokeWidth={1.75} />
              </button>
            ))}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      {/* ── Main Layout Workspace ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          activeTab={activeTab}
          onSelectTab={handleTabChange}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {/* Workspace Body */}
        <div className="flex-1 flex min-w-0 h-full relative overflow-hidden">
          {/* Tab 1: AI Copilot Dashboard */}
          {activeTab === 'live' && (
            <>
              <div className="flex-1 flex flex-col min-w-0 h-full p-3 md:p-4 gap-3 md:gap-4 overflow-y-auto custom-scrollbar">
                {/* 1. AI Copilot Consulting Advisory Card */}
                <AIConsultantCard />

                {/* 2. Chart Toolbar & Interactive Candlestick Chart */}
                <div className="flex-1 min-h-[450px] flex flex-col gap-2">
                  <Toolbar onToggleAiSidebar={() => setIsAiSidebarOpen(true)} />
                  <div className="flex-1 relative bg-zinc-900/60 rounded-2xl border border-zinc-800 overflow-hidden shadow-xl">
                    <ChartComponent />
                  </div>
                </div>
              </div>

              {/* AI Realtime Thought Stream Sidebar */}
              <Sidebar isOpen={isAiSidebarOpen} onClose={() => setIsAiSidebarOpen(false)} />
            </>
          )}

          {/* Tab 2: Paper Trading Simulator */}
          {activeTab === 'paper' && <PaperTradingDashboard />}

          {/* Tab 3: Binance Live Trading Executions */}
          {activeTab === 'live-trade' && <LiveTradingDashboard />}

          {/* Tab 4: Strategy Backtesting */}
          {activeTab === 'backtest' && <BacktestPanel />}

          {/* Tab 5: Settings */}
          {activeTab === 'settings' && (
            <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto space-y-5">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Cấu hình Hệ thống</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Quản lý API Key, Kênh Cảnh báo Discord/Telegram & Động cơ Quản trị Rủi ro
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
                {/* API Keys */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    Cấu hình API Key AI
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Gemini API Key
                      </label>
                      <input
                        type="password"
                        value={settings.geminiApiKey}
                        onChange={(e) =>
                          setSettings({ ...settings, geminiApiKey: e.target.value })
                        }
                        placeholder="AIzaSy..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Alert Webhooks */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    Kênh Cảnh báo
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Discord Webhook URL
                      </label>
                      <input
                        type="password"
                        value={settings.discordWebhook}
                        onChange={(e) =>
                          setSettings({ ...settings, discordWebhook: e.target.value })
                        }
                        placeholder="https://discord.com/api/webhooks/..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Telegram Bot Token
                        </label>
                        <input
                          type="password"
                          value={settings.telegramBotToken}
                          onChange={(e) =>
                            setSettings({ ...settings, telegramBotToken: e.target.value })
                          }
                          placeholder="1234:abc..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          Chat ID
                        </label>
                        <input
                          type="text"
                          value={settings.telegramChatId}
                          onChange={(e) =>
                            setSettings({ ...settings, telegramChatId: e.target.value })
                          }
                          placeholder="-100..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk Parameters */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4 md:col-span-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    Tham số Động cơ Rủi ro (Risk Guardrails)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { key: 'maxPositionSize', label: 'Tối đa Portfolio / Lệnh (%)', min: 1, max: 100 },
                      { key: 'stopLoss', label: 'Cắt lỗ tối đa (%)', min: 0.5, max: 20 },
                      { key: 'maxDrawdown', label: 'Drawdown tối đa (%)', min: 5, max: 50 },
                      { key: 'dailyLossLimit', label: 'Giới hạn lỗ ngày (%)', min: 1, max: 20 },
                    ].map(({ key, label, min, max }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                          {label}
                        </label>
                        <input
                          type="number"
                          value={settings[key as keyof typeof settings]}
                          onChange={(e) =>
                            setSettings({ ...settings, [key]: Number(e.target.value) })
                          }
                          min={min}
                          max={max}
                          step="0.5"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
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
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold py-2.5 px-8 rounded-xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.25)] cursor-pointer"
                >
                  {isSavingSettings ? 'Đang lưu...' : 'Lưu Cấu hình'}
                </button>
                {settingsMsg && (
                  <span
                    className={`text-sm font-medium ${
                      settingsMsg.startsWith('Lỗi') ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {settingsMsg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
