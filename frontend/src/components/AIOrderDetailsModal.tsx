'use client';
import React from 'react';
import { AIConsultPlan } from '@/store/useStore';
import {
  X, CheckCircle2, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown,
  Clock, ArrowRight, LineChart, Sparkles, Activity
} from 'lucide-react';

interface AIOrderDetailsModalProps {
  plan: AIConsultPlan | null;
  isOpen: boolean;
  onClose: () => void;
}

// Static SVG Candlestick Setup Chart at the moment position was issued
function StaticSetupChart({ plan }: { plan: AIConsultPlan }) {
  const isLong = plan.recommendation === 'LONG';
  const entry = plan.entryZone.idealEntry;
  const sl = plan.stopLoss.price;
  const tp1 = plan.takeProfit[0]?.price || entry * (isLong ? 1.015 : 0.985);
  const tp2 = plan.takeProfit[1]?.price || entry * (isLong ? 1.03 : 0.97);

  // Generate simulated candle data snapshot leading up to the idealEntry
  const base = entry;
  const candleCount = 24;
  const candleWidth = 14;
  const gap = 6;
  const width = candleCount * (candleWidth + gap) + 40;
  const height = 180;

  // Calculate price boundaries for chart scaling
  const allPrices = [entry, sl, tp1, tp2, base * 0.99, base * 1.01];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const rangeP = maxP - minP || 1;

  const priceToY = (p: number) => {
    return height - 20 - ((p - minP) / rangeP) * (height - 40);
  };

  // Mock historical candles ending right at the Entry moment
  const candles = Array.from({ length: candleCount }).map((_, idx) => {
    const isLast = idx === candleCount - 1;
    const offsetRatio = (idx - candleCount) * 0.001;
    const cOpen = base * (1 + offsetRatio + (Math.sin(idx) * 0.002));
    const cClose = isLast ? entry : base * (1 + offsetRatio + (Math.cos(idx) * 0.002));
    const cHigh = Math.max(cOpen, cClose) * 1.0015;
    const cLow = Math.min(cOpen, cClose) * 0.9985;
    return { open: cOpen, close: cClose, high: cHigh, low: cLow, isUp: cClose >= cOpen };
  });

  const entryY = priceToY(entry);
  const slY = priceToY(sl);
  const tp1Y = priceToY(tp1);
  const tp2Y = priceToY(tp2);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
          <LineChart size={14} /> Biểu đồ Tĩnh Setup vào lúc AI ra Vị thế
        </span>
        <span className="text-[11px] text-zinc-500">
          Thời điểm: {new Date(plan.timestamp || Date.now()).toLocaleTimeString()}
        </span>
      </div>

      <div className="relative w-full overflow-hidden bg-zinc-900/80 rounded-xl p-2 border border-zinc-800">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1={entryY} x2={width} y2={entryY} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="0" y1={slY} x2={width} y2={slY} stroke="#f43f5e" strokeWidth="1.5" />
          <line x1="0" y1={tp1Y} x2={width} y2={tp1Y} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 2" />
          <line x1="0" y1={tp2Y} x2={width} y2={tp2Y} stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="4 2" />

          {/* Candlesticks */}
          {candles.map((c, i) => {
            const x = i * (candleWidth + gap) + 15;
            const openY = priceToY(c.open);
            const closeY = priceToY(c.close);
            const highY = priceToY(c.high);
            const lowY = priceToY(c.low);
            const bodyY = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(openY - closeY), 2);
            const color = c.isUp ? '#10b981' : '#f43f5e';

            return (
              <g key={i}>
                <line x1={x + candleWidth / 2} y1={highY} x2={x + candleWidth / 2} y2={lowY} stroke={color} strokeWidth="1" />
                <rect x={x} y={bodyY} width={candleWidth} height={bodyH} fill={color} rx="1" />
              </g>
            );
          })}
        </svg>

        {/* Labels Overlay */}
        <div className="absolute right-3 top-2 flex flex-col gap-1 text-[10px] font-mono font-bold">
          <span className="text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-500/30">
            TP2: ${tp2.toLocaleString()}
          </span>
          <span className="text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
            TP1: ${tp1.toLocaleString()}
          </span>
          <span className="text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-500/30">
            AI Entry: ${entry.toLocaleString()}
          </span>
          <span className="text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/30">
            SL (-{plan.stopLoss.percentage}%): ${sl.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AIOrderDetailsModal({ plan, isOpen, onClose }: AIOrderDetailsModalProps) {
  if (!isOpen || !plan) return null;

  const isLong = plan.recommendation === 'LONG';
  const isWait = plan.recommendation === 'WAIT';

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 font-sans text-zinc-100">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 ${
              isLong ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              isWait ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {isLong ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{plan.recommendation} {plan.symbol}</span>
            </div>

            <div className="text-xs font-mono text-zinc-400">
              Timeframe: <strong className="text-zinc-200">{plan.interval}</strong> • Độ tin cậy: <strong className="text-emerald-400">{plan.confidence}%</strong>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          
          {/* Blueprint Price Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Entry Lý tưởng</div>
              <div className="text-base font-bold text-blue-400">${plan.entryZone.idealEntry.toLocaleString()}</div>
            </div>

            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Cắt lỗ (SL)</div>
              <div className="text-base font-bold text-rose-400">${plan.stopLoss.price.toLocaleString()}</div>
              <div className="text-[10px] text-rose-400/80">-{plan.stopLoss.percentage}%</div>
            </div>

            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Tỷ lệ Risk:Reward</div>
              <div className="text-base font-bold text-emerald-400">1 : {plan.riskRewardRatio}</div>
              <div className="text-[10px] text-zinc-500">Đòn bẩy: {plan.suggestedLeverage}</div>
            </div>
          </div>

          {/* Rationale & Authentic Proof */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <Sparkles size={14} /> Bằng chứng Thực tế & Lý do Kỹ thuật của AI
            </h4>

            <div className="space-y-2.5 text-xs text-zinc-300">
              {plan.stopLoss.rationale && (
                <div className="flex items-start gap-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                  <ShieldCheck size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p><strong className="text-zinc-200">Lý do cài SL:</strong> {plan.stopLoss.rationale}</p>
                </div>
              )}

              {plan.analysisSummary.candlestickPattern && (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <p><strong className="text-zinc-200">Mẫu hình nến:</strong> {plan.analysisSummary.candlestickPattern}</p>
                </div>
              )}

              {plan.analysisSummary.technicalConfluence && (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <p><strong className="text-zinc-200">Hội tụ Chỉ số:</strong> {plan.analysisSummary.technicalConfluence}</p>
                </div>
              )}

              {plan.analysisSummary.newsSentiment && (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <p><strong className="text-zinc-200">Bằng chứng Tin tức:</strong> {plan.analysisSummary.newsSentiment}</p>
                </div>
              )}

              {plan.analysisSummary.keyWarning && (
                <div className="flex items-start gap-2 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 text-amber-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p><strong>Cảnh báo biến động:</strong> {plan.analysisSummary.keyWarning}</p>
                </div>
              )}
            </div>
          </div>

          {/* Static Chart Snapshot at Position Creation */}
          <StaticSetupChart plan={plan} />
        </div>
      </div>
    </div>
  );
}
