import ChartComponent from '@/components/Chart';
import Sidebar from '@/components/Sidebar';

export default function Home() {
  return (
    <main className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Header & Chart Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Navbar */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md flex items-center px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg">
              LD
            </div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-indigo-400">
              LDM AI Trading
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-700/50">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Binance WS Connected
            </div>
          </div>
        </header>

        {/* Chart Container */}
        <div className="flex-1 relative p-4">
          <div className="absolute inset-4 bg-slate-900/40 rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl backdrop-blur-sm">
            <ChartComponent />
          </div>
        </div>
      </div>

      {/* AI Sidebar */}
      <Sidebar />
    </main>
  );
}
