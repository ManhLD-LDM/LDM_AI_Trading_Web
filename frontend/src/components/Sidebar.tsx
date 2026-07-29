'use client';
import { useState } from 'react';
import { useTradingStore, AIConsultPlan } from '@/store/useStore';
import { X, Sparkles, Activity, History, TrendingUp, TrendingDown, Eye, ChevronRight } from 'lucide-react';
import AIOrderDetailsModal from './AIOrderDetailsModal';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { pair, interval, aiConsultHistory, aiConsultPlan } = useTradingStore();
  const [selectedPlan, setSelectedPlan] = useState<AIConsultPlan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenDetails = (plan: AIConsultPlan) => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  // Combine current active plan and historical plans
  const allPlans = aiConsultHistory.length > 0
    ? aiConsultHistory
    : (aiConsultPlan ? [aiConsultPlan] : []);

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
            <span>Lịch sử Lệnh AI Cố vấn</span>
            <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
              {allPlans.length}
            </span>
          </h2>
          <button 
            onClick={onClose}
            className="md:hidden p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-95 transition-all"
          >
            <X size={18} />
          </button>
        </div>
      
        {/* History List */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
          {allPlans.length === 0 ? (
            <div className="text-xs text-zinc-500 italic text-center py-10 space-y-2">
              <Sparkles size={24} className="mx-auto text-zinc-600 animate-pulse" />
              <p>Chưa có lịch sử lệnh AI.</p>
              <p className="text-[11px] text-zinc-600">Bấm "Yêu cầu AI Cố vấn" để tạo lệnh đầu tiên.</p>
            </div>
          ) : (
            allPlans.map((plan, idx) => {
              const isLong = plan.recommendation === 'LONG';
              const isWait = plan.recommendation === 'WAIT';
              return (
                <div
                  key={plan.id || idx}
                  onClick={() => handleOpenDetails(plan)}
                  className="group bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/90 hover:border-emerald-500/40 transition-all cursor-pointer space-y-2 font-mono text-xs shadow-md active:scale-[0.98]"
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
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(plan.timestamp || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span>Entry: <strong className="text-zinc-200">${plan.entryZone.idealEntry.toLocaleString()}</strong></span>
                    <span className="text-emerald-400 font-bold">{plan.confidence}% Tin cậy</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
                    <span className="text-rose-400">SL: ${plan.stopLoss.price}</span>
                    <span className="text-emerald-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform font-bold">
                      <span>Xem Chi Tiết</span>
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
            <span className="text-zinc-500">Cặp hiện tại:</span>
            <span className="text-zinc-200 font-bold">{pair}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Khung thời gian:</span>
            <span className="text-zinc-200 font-bold">{interval}</span>
          </div>
        </div>
      </div>

      {/* AI Order Details Modal */}
      <AIOrderDetailsModal
        plan={selectedPlan}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
