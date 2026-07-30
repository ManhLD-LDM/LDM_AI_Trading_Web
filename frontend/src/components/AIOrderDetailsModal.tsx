'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useTradingStore, AIConsultPlan } from '@/store/useStore';
import { getStatusBadge } from './Sidebar';
import { apiPost } from '@/lib/api';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, CandlestickSeries } from 'lightweight-charts';
import {
  X, CheckCircle2, AlertTriangle, ShieldCheck, ShieldAlert, TrendingUp, TrendingDown,
  Clock, ArrowRight, LineChart, Sparkles, Activity, Target, RefreshCw, ZoomIn, GraduationCap, RotateCw, AlertOctagon, Trophy
} from 'lucide-react';

interface AIOrderDetailsModalProps {
  plan: AIConsultPlan | null;
  isOpen: boolean;
  onClose: () => void;
}

// Official TradingView Lightweight Charts Interactive Snapshot Component
function RealLightweightSetupChart({ plan }: { plan: AIConsultPlan }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const isLong = plan.recommendation === 'LONG';
  const entry = plan.entryZone.idealEntry;
  const sl = plan.currentSlPrice || plan.stopLoss.price;
  const tp1 = plan.takeProfit[0]?.price || (isLong ? entry * 1.015 : entry * 0.985);
  const tp2 = plan.takeProfit[1]?.price || (isLong ? entry * 1.03 : entry * 0.97);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d14' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const fetchKlines = async () => {
      setIsLoading(true);
      try {
        const sym = plan.symbol.toUpperCase().replace('/', '');
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=15m&limit=100`);
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
          const parsed = data.map((d: any) => ({
            time: (d[0] / 1000) as UTCTimestamp,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
          }));

          series.setData(parsed);

          priceLinesRef.current.forEach(l => series.removePriceLine(l));
          priceLinesRef.current = [];

          // Overlay Price Lines
          const lineEntry = series.createPriceLine({
            price: entry,
            color: '#3b82f6',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title: `ENTRY: $${entry.toLocaleString()}`,
          });

          const isSlBe = plan.status === 'PARTIAL_TP1' || plan.status === 'WIN_BE';
          const lineSL = series.createPriceLine({
            price: sl,
            color: isSlBe ? '#06b6d4' : '#f43f5e',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title: isSlBe ? `SL (Đã dời BE): $${sl.toLocaleString()}` : `SL (-${plan.stopLoss.percentage}%): $${sl.toLocaleString()}`,
          });

          const lineTP1 = series.createPriceLine({
            price: tp1,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP1 (Thắng 50%): $${tp1.toLocaleString()}`,
          });

          const lineTP2 = series.createPriceLine({
            price: tp2,
            color: '#14b8a6',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP2 (Thắng 100%): $${tp2.toLocaleString()}`,
          });

          priceLinesRef.current = [lineEntry, lineSL, lineTP1, lineTP2];
          chart.timeScale().fitContent();
        }
      } catch (err) {
        console.warn('Failed to load Binance 15m klines for static chart:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKlines();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [plan]);

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3 font-sans">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
          <LineChart size={15} /> 100 nến 15M ({plan.symbol}) - Theo dõi Tiến trình Realtime
        </span>
        <span className="text-[11px] text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded-lg border border-zinc-800 font-mono flex items-center gap-1">
          <ZoomIn size={12} className="text-emerald-400" /> Thu phóng co giãn
        </span>
      </div>

      <div className="relative w-full h-72 overflow-hidden bg-[#090d14] rounded-xl border border-zinc-800 shadow-inner">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-zinc-950/80 backdrop-blur-xs flex items-center justify-center gap-2 text-xs font-mono text-emerald-400">
            <RefreshCw size={16} className="animate-spin" />
            <span>Đang nạp dữ liệu nến...</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full cursor-crosshair" />
      </div>

      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 pt-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-blue-500 rounded inline-block" /> Entry AI</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-emerald-500 rounded inline-block" /> TP1 (50%) / TP2 (100%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-rose-500 rounded inline-block" /> Stop Loss (BE)</span>
        </div>
        <span className="text-zinc-400 font-bold">Khung: 15M • Chế độ: {plan.mode || 'SCALP'}</span>
      </div>
    </div>
  );
}

export default function AIOrderDetailsModal({ plan, isOpen, onClose }: AIOrderDetailsModalProps) {
  const { pair, setPair, token, setAiConsultPlan, aiConsultPlan: currentMainPlan } = useTradingStore();
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState('');
  const [attachMsg, setAttachMsg] = useState('');

  if (!isOpen || !plan) return null;

  const isLong = plan.recommendation === 'LONG';
  const isWait = plan.recommendation === 'WAIT';
  const isPending = !plan.status || plan.status === 'PENDING';

  // Can attach to main chart ONLY if order is PENDING ("chờ Entry") or ACTIVE/PARTIAL_TP1 ("Đang chạy")
  // Disabled if order has hit SL or closed completely (WIN_100, WIN_BE, LOSS)
  const isAttachable = !plan.status || plan.status === 'PENDING' || plan.status === 'ACTIVE' || plan.status === 'PARTIAL_TP1';
  const isAttachedToMainChart = currentMainPlan?.id === plan.id || (currentMainPlan?.symbol === plan.symbol && currentMainPlan?.entryZone?.idealEntry === plan.entryZone?.idealEntry);

  const handleAttachToMainChart = () => {
    if (!isAttachable) return;
    if (plan.symbol && plan.symbol !== pair) {
      setPair(plan.symbol);
    }
    setAiConsultPlan(plan);
    setAttachMsg(`✓ Đã gắn mốc Entry, SL, TP của lệnh ${plan.symbol} lên Chart lớn!`);
    setTimeout(() => setAttachMsg(''), 4000);
  };

  const handleReanalyze = async () => {
    if (!token || !plan.id || !isPending) return;
    setIsReanalyzing(true);
    setReanalyzeMsg('');
    try {
      const updatedPlan = await apiPost<AIConsultPlan>('/api/live/ai-consult/reanalyze', { id: plan.id }, token);
      if (updatedPlan) {
        setAiConsultPlan(updatedPlan);
        setReanalyzeMsg('✓ Đã phân tích lại vị thế thành công!');
      }
    } catch (err: any) {
      setReanalyzeMsg(err.message || 'Lỗi khi phân tích lại');
    } finally {
      setIsReanalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 font-sans text-zinc-100 select-none">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        
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

            {getStatusBadge(plan.status)}

            <div className="text-xs font-mono text-zinc-400 hidden sm:block">
              Khung: <strong className="text-zinc-200 uppercase">15M</strong> • Tin cậy: <strong className="text-emerald-400">{plan.confidence}%</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Attach to Main Chart Button (Enabled ONLY if PENDING or ACTIVE) */}
            <button
              onClick={handleAttachToMainChart}
              disabled={!isAttachable}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isAttachable
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-sm active:scale-95 cursor-pointer'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60 cursor-not-allowed opacity-60'
              }`}
              title={
                isAttachable
                  ? 'Gắn mốc Entry, SL, TP của lệnh này lên Chart lớn'
                  : 'Lệnh đã đóng/kết thúc (WIN/LOSS/SL) — không thể gắn lên Chart lớn'
              }
            >
              <Target size={13} />
              <span>{isAttachedToMainChart ? '✓ Đã gắn Chart' : 'Gắn lên Chart lớn'}</span>
            </button>

            {/* Re-Analyze Button for PENDING orders ONLY */}
            {isPending && (
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                title="Phân tích lại mốc Entry/SL/TP dựa trên nến mới nhất"
              >
                <RotateCw size={13} className={isReanalyzing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{isReanalyzing ? 'Đang phân tích...' : 'Phân tích lại'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {attachMsg && (
          <div className="px-4 py-2 bg-emerald-500/10 text-emerald-300 text-xs font-mono border-b border-emerald-500/20 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-400" />
              {attachMsg}
            </span>
            <button onClick={() => setAttachMsg('')} className="text-zinc-400 hover:text-zinc-100">✕</button>
          </div>
        )}

        {reanalyzeMsg && (
          <div className="px-4 py-2 bg-amber-500/10 text-amber-300 text-xs font-mono border-b border-amber-500/20 flex items-center justify-between">
            <span>{reanalyzeMsg}</span>
            <button onClick={() => setReanalyzeMsg('')} className="text-zinc-400 hover:text-zinc-100">✕</button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          
          {/* Blueprint Price Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Entry Lý tưởng</div>
              <div className="text-base font-bold text-blue-400">${plan.entryZone.idealEntry.toLocaleString()}</div>
            </div>

            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Stop Loss hiện tại</div>
              <div className="text-base font-bold text-rose-400">${(plan.currentSlPrice || plan.stopLoss.price).toLocaleString()}</div>
              <div className="text-[10px] text-rose-400/80">{plan.status === 'PARTIAL_TP1' ? 'Đã dời BE' : `-${plan.stopLoss.percentage}%`}</div>
            </div>

            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
              <div className="text-[10px] text-zinc-400 mb-1">Risk:Reward</div>
              <div className="text-base font-bold text-emerald-400">1 : {plan.riskRewardRatio}</div>
              <div className="text-[10px] text-zinc-500">Leverage: {plan.suggestedLeverage}</div>
            </div>
          </div>

          {/* Rationale & Technical Proof */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <Sparkles size={14} /> Tiến trình & Lý do Kỹ thuật của AI
            </h4>

            <div className="space-y-2.5 text-xs text-zinc-300">
              {plan.activatedAt && (
                <div className="flex items-center gap-2 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20 text-blue-300 font-mono">
                  <Clock size={14} />
                  <span>Đã khớp Entry lúc: {new Date(plan.activatedAt).toLocaleTimeString()}</span>
                </div>
              )}

              {plan.completedAt && (
                <div className="flex items-center gap-2 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-emerald-300 font-mono">
                  <CheckCircle2 size={14} />
                  <span>Kết thúc lệnh lúc: {new Date(plan.completedAt).toLocaleTimeString()}</span>
                </div>
              )}

              {plan.stopLoss.rationale && (
                <div className="flex items-start gap-2 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                  <ShieldCheck size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p><strong className="text-zinc-200">Quản trị SL:</strong> {plan.stopLoss.rationale}</p>
                </div>
              )}

              {plan.analysisSummary.candlestickPattern && (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <p><strong className="text-zinc-200">Hợp lưu Đa Khung:</strong> {plan.analysisSummary.candlestickPattern}</p>
                </div>
              )}

              {plan.analysisSummary.newsSentiment && (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <p><strong className="text-zinc-200">Tâm lý Tin tức:</strong> {plan.analysisSummary.newsSentiment}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pre-Reanalysis Risk & Feasibility Audit Card (When Pending Plan is Re-analyzed) */}
          {plan.pendingAudit && (
            <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-4 rounded-xl border border-amber-500/40 space-y-3 font-sans shadow-lg">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <ShieldAlert size={16} /> Kết quả Đánh giá Rủi ro & Tình trạng Vị thế Chờ
                </h4>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  plan.pendingAudit.riskLevel === 'THẤP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  plan.pendingAudit.riskLevel === 'TRUNG BÌNH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  RỦI RO: {plan.pendingAudit.riskLevel || 'TRUNG BÌNH'}
                </span>
              </div>

              {/* Progress bar TP vs SL probability */}
              <div className="space-y-1 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-emerald-400 font-bold">Khả năng Hit TP: {plan.pendingAudit.tpProbability || 65}%</span>
                  <span className="text-rose-400 font-bold">Rủi ro Dính SL: {plan.pendingAudit.slProbability || 35}%</span>
                </div>
                <div className="w-full bg-rose-500/30 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${plan.pendingAudit.tpProbability || 65}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2 text-xs text-zinc-300">
                {plan.pendingAudit.actionAdvice && (
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-zinc-400 font-bold">Đề xuất hành động:</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20">
                      {plan.pendingAudit.actionAdvice}
                    </span>
                  </div>
                )}

                {plan.pendingAudit.auditReasoning && (
                  <div className="p-2.5 bg-zinc-900/80 rounded-lg border border-zinc-800 text-zinc-300 leading-relaxed">
                    <strong className="text-amber-400 font-bold">Phân tích rủi ro: </strong>
                    {plan.pendingAudit.auditReasoning}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Post-Mortem Strategy Learning Section (After Trade Finishes) */}
          {plan.postMortemAnalysis && (
            <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-4 rounded-xl border border-teal-500/40 space-y-3 font-sans shadow-lg">
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-2">
                <GraduationCap size={16} /> Phân tích Rút kinh nghiệm & Bài học Tự học của AI
              </h4>

              <div className="space-y-2 text-xs text-zinc-300">
                {plan.postMortemAnalysis.outcomeSummary && (
                  <div className="flex items-start gap-2 bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-teal-400 font-bold shrink-0">📌 Đánh giá:</span>
                    <p>{plan.postMortemAnalysis.outcomeSummary}</p>
                  </div>
                )}

                {plan.postMortemAnalysis.keyFactors && (
                  <div className="flex items-start gap-2 bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-amber-400 font-bold shrink-0">⚡ Yếu tố nến:</span>
                    <p>{plan.postMortemAnalysis.keyFactors}</p>
                  </div>
                )}

                {plan.postMortemAnalysis.learnedLesson && (
                  <div className="flex items-start gap-2 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30 text-emerald-300">
                    <Sparkles size={14} className="shrink-0 mt-0.5" />
                    <p><strong className="text-emerald-400">Bài học tự học AI:</strong> {plan.postMortemAnalysis.learnedLesson}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interactive TradingView Setup Chart */}
          <RealLightweightSetupChart plan={plan} />

          {/* Action Bar: Attach to Main Chart */}
          <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 text-xs font-mono">
              {isAttachable ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  <span>Lệnh {isPending ? 'CHỜ ENTRY' : 'ĐANG CHẠY'} — Sẵn sàng gắn mốc lên Chart lớn</span>
                </span>
              ) : (
                <span className="text-rose-400 font-medium flex items-center gap-1.5">
                  <AlertOctagon size={15} />
                  <span>Lệnh đã kết thúc (Hit SL/TP) — Không thể gắn mốc lên Chart lớn</span>
                </span>
              )}
            </div>

            <button
              onClick={handleAttachToMainChart}
              disabled={!isAttachable}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isAttachable
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.2)] active:scale-95 cursor-pointer'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60 cursor-not-allowed opacity-60'
              }`}
              title={
                isAttachable
                  ? 'Gắn mốc Entry, SL, TP của lệnh này lên Chart lớn'
                  : 'Lệnh đã đóng/kết thúc (WIN/LOSS/SL) — Không thể sử dụng chức năng này'
              }
            >
              <Target size={14} />
              <span>{isAttachedToMainChart ? '✓ Đã gắn mốc lên Chart lớn' : 'Gắn mốc lên Chart lớn'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
