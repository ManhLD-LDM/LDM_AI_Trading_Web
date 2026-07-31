'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTradingStore, AIConsultPlan, AIPlanStatus } from '@/store/useStore';
import { apiGet } from '@/lib/api';
import { X, Sparkles, History, TrendingUp, TrendingDown, ChevronRight, RefreshCw, Clock, Zap, CheckCircle2, Trophy, ShieldCheck, AlertOctagon } from 'lucide-react';
import AIOrderDetailsModal from './AIOrderDetailsModal';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function getStatusBadge(status?: AIPlanStatus) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center gap-1 animate-pulse">
          <Zap size={11} /> ĐANG CHẠY
        </span>
      );
    case 'PARTIAL_TP1':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
          <CheckCircle2 size={11} /> THẮNG 50% (BE)
        </span>
      );
    case 'WIN_100':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/30 text-teal-300 border border-teal-400 flex items-center gap-1 shadow-[0_0_8px_rgba(20,184,166,0.3)]">
          <Trophy size={11} /> THẮNG 100%
        </span>
      );
    case 'WIN_BE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center gap-1">
          <ShieldCheck size={11} /> HÒA BE
        </span>
      );
    case 'LOSS':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1">
          <AlertOctagon size={11} /> HIT SL (THUA)
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
          <Clock size={11} /> CHỜ ENTRY
        </span>
      );
  }
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { pair, interval, aiConsultHistory, aiConsultPlan, token, setAiConsultHistory } = useTradingStore();
  const [selectedPlan, setSelectedPlan] = useState<AIConsultPlan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistoryFromDb = useCallback(async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await apiGet<{ history: AIConsultPlan[] }>('/api/live/ai-consult/history', token);
      if (res && res.history && Array.isArray(res.history)) {
        setAiConsultHistory(res.history);
      }
    } catch (e) {
      console.warn('Failed to fetch AI history from DB:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token, setAiConsultHistory]);

  useEffect(() => {
    fetchHistoryFromDb();
  }, [fetchHistoryFromDb]);

  const handleOpenDetails = (plan: AIConsultPlan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  const allPlans = aiConsultHistory;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <div className={`
        ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        fixed md:static inset-y-0 right-0
        w-80 h-full flex flex-col bg-zinc-900/90 border-l border-zinc-800 p-5 shrink-0 z-50 md:z-20 font-sans text-zinc-100 select-none
        transition-transform duration-300 ease-in-out
      `}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
            <History size={15} />
            <span>Lịch sử Tín hiệu AI</span>
            <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
              {allPlans.length}
            </span>
          </h2>
          <div className="flex items-center gap-1">
            <button 
              onClick={fetchHistoryFromDb}
              title="Làm mới"
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all cursor-pointer"
            >
              <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={onClose}
              className="md:hidden p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-95 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      
        {/* History List */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
          {allPlans.length === 0 ? (
            <div className="text-xs text-zinc-500 italic text-center py-10 space-y-2">
              <Sparkles size={24} className="mx-auto text-zinc-600 animate-pulse" />
              <p>Chưa có lịch sử tín hiệu.</p>
              <p className="text-[11px] text-zinc-600">Tạo lệnh mới bằng nút "Yêu cầu AI".</p>
            </div>
          ) : (
            allPlans.map((plan, idx) => {
              const isLong = plan.recommendation === 'LONG';
              const isWait = plan.recommendation === 'WAIT';
              return (
                <div
                  key={plan.id || idx}
                  onClick={() => handleOpenDetails(plan)}
                  className="group bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/90 hover:border-emerald-500/40 transition-all cursor-pointer space-y-2.5 font-mono text-xs shadow-md active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 ${
                        isLong ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                        isWait ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                        'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {plan.recommendation}
                      </span>
                      <span className="font-bold text-zinc-200">{plan.symbol}</span>
                    </div>

                    {getStatusBadge(plan.status)}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                    <span>Entry: <strong className="text-blue-400">{isWait || !plan.entryZone?.idealEntry ? '0 (Đứng ngoài)' : `$${plan.entryZone.idealEntry.toLocaleString()}`}</strong></span>
                    <span className="text-emerald-400 font-bold">{plan.confidence}%</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
                    <span className="text-rose-400">SL: {isWait || !(plan.currentSlPrice || plan.stopLoss?.price) ? '0' : `$${(plan.currentSlPrice || plan.stopLoss.price).toLocaleString()}`}</span>
                    <span className="text-emerald-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-bold">
                      <span>Chi tiết</span>
                      <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-4 border-t border-zinc-800 font-mono text-xs space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Cặp đang xem:</span>
            <span className="text-zinc-200 font-bold">{pair}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Khung thời gian:</span>
            <span className="text-zinc-200 font-bold">{interval}</span>
          </div>
        </div>
      </div>

      <AIOrderDetailsModal
        plan={selectedPlan}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
