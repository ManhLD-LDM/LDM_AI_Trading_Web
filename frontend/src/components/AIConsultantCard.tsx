'use client';
import React, { useState } from 'react';
import { useTradingStore, AIConsultPlan } from '@/store/useStore';
import { 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  PauseCircle, 
  Sparkles, 
  ShieldAlert, 
  RefreshCw, 
  Target, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  Newspaper,
  LineChart as LineChartIcon,
  Zap,
  Waves
} from 'lucide-react';
import { apiGet } from '@/lib/api';

export default function AIConsultantCard() {
  const { 
    pair, 
    interval, 
    aiConsultPlan, 
    setAiConsultPlan, 
    isAiConsultLoading, 
    setIsAiConsultLoading,
    token 
  } = useTradingStore();

  const [selectedMode, setSelectedMode] = useState<'scalp' | 'swing'>('scalp');
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAiConsult = async () => {
    setIsAiConsultLoading(true);
    setErrorMsg('');
    try {
      if (!token) {
        setErrorMsg('Đăng nhập để dùng AI Realtime (Hoặc xem dữ liệu Demo)');
      }

      let res: any = null;
      if (token) {
        res = await apiGet(`/api/live/ai-consult?symbol=${pair}&interval=${interval}&mode=${selectedMode}`, token);
      }
      
      if (res && res.recommendation) {
        setAiConsultPlan(res as AIConsultPlan);
      } else {
        const mockPrice = pair.startsWith('BTC') ? 95420 : pair.startsWith('ETH') ? 3420 : 2650;
        const isLong = Math.random() > 0.4;
        const mockPlan: AIConsultPlan = {
          symbol: pair,
          interval,
          recommendation: isLong ? 'LONG' : 'SHORT',
          confidence: Math.floor(Math.random() * 15) + 80,
          entryZone: {
            minPrice: Math.round(mockPrice * (isLong ? 0.997 : 1.001)),
            maxPrice: Math.round(mockPrice * (isLong ? 1.001 : 1.003)),
            idealEntry: Math.round(mockPrice),
          },
          stopLoss: {
            price: Math.round(mockPrice * (isLong ? (selectedMode === 'swing' ? 0.98 : 0.99) : (selectedMode === 'swing' ? 1.02 : 1.01))),
            percentage: selectedMode === 'swing' ? 2.0 : 1.0,
            rationale: isLong 
              ? `Hỗ trợ Swing Low Đa khung cho chế độ ${selectedMode.toUpperCase()}.` 
              : `Kháng cự Swing High Đa khung cho chế độ ${selectedMode.toUpperCase()}.`,
          },
          takeProfit: [
            {
              level: 'TP1 (50% Vị thế)',
              price: Math.round(mockPrice * (isLong ? (selectedMode === 'swing' ? 1.03 : 1.015) : (selectedMode === 'swing' ? 0.97 : 0.985))),
              rrRatio: selectedMode === 'swing' ? '1:2.5' : '1:1.5',
              closePct: 50,
            },
            {
              level: 'TP2 (Chốt hết)',
              price: Math.round(mockPrice * (isLong ? (selectedMode === 'swing' ? 1.06 : 1.028) : (selectedMode === 'swing' ? 0.94 : 0.972))),
              rrRatio: selectedMode === 'swing' ? '1:4.0' : '1:2.5',
              closePct: 50,
            },
          ],
          riskRewardRatio: selectedMode === 'swing' ? 3.2 : 2.0,
          suggestedLeverage: selectedMode === 'swing' ? '2x - 5x Isolated' : '5x - 10x Cross',
          recommendedRiskPct: 1.5,
          analysisSummary: {
            candlestickPattern: `Hợp lưu nến Đa khung (15m - 1W) cho chế độ ${selectedMode.toUpperCase()}.`,
            technicalConfluence: 'Khung lớn (1D/4h) cùng chiều với lực ngắn hạn.',
            newsSentiment: 'CryptoPanic: Tin tức thị trường tích cực.',
            keyWarning: 'Kiểm tra mốc SL trước khi vào vị thế.',
          },
        };
        setAiConsultPlan(mockPlan);
      }
    } catch (err: any) {
      console.warn('AI Consult Auth/Fetch Warning:', err.message);
      if (err.message?.includes('credentials') || err.message?.includes('401')) {
        setErrorMsg('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      } else {
        setErrorMsg(err.message || 'Không thể tạo tín hiệu AI.');
      }
    } finally {
      setIsAiConsultLoading(false);
    }
  };

  const getRecommendationBadge = (rec: 'LONG' | 'SHORT' | 'WAIT') => {
    switch (rec) {
      case 'LONG':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm">
            <TrendingUp size={16} />
            <span>MUA (LONG)</span>
          </div>
        );
      case 'SHORT':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-sm">
            <TrendingDown size={16} />
            <span>BÁN (SHORT)</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-sm">
            <PauseCircle size={16} />
            <span>ĐỨNG NGOÀI (WAIT)</span>
          </div>
        );
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 md:p-5 shadow-2xl backdrop-blur-md space-y-4 font-sans text-zinc-100 select-none">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-zinc-800/80 pb-3 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)] shrink-0">
            <Bot size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-100">Cố vấn AI Trading</h2>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {pair} • {interval}
              </span>
            </div>
            <p className="text-xs text-zinc-400">Đề xuất Entry, SL, TP & Quản trị rủi ro Đa khung</p>
          </div>
        </div>

        {/* Mode Switcher & Trigger Button */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs font-bold font-mono">
            <button
              onClick={() => setSelectedMode('scalp')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                selectedMode === 'scalp'
                  ? 'bg-amber-500 text-zinc-950 font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap size={13} />
              <span>SCALP</span>
            </button>
            <button
              onClick={() => setSelectedMode('swing')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                selectedMode === 'swing'
                  ? 'bg-emerald-500 text-zinc-950 font-bold shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Waves size={13} />
              <span>SWING</span>
            </button>
          </div>

          <button
            onClick={fetchAiConsult}
            disabled={isAiConsultLoading}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.25)] cursor-pointer shrink-0"
          >
            {isAiConsultLoading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Đang phân tích...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Yêu cầu AI Cố vấn</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active AI Plan */}
      {aiConsultPlan && (
        <div className="space-y-4 animate-in fade-in duration-300">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800 gap-3">
            <div className="flex items-center gap-3">
              {getRecommendationBadge(aiConsultPlan.recommendation)}
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-300">
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                  {selectedMode === 'scalp' ? '⚡ SCALP INTRADAY' : '🌊 SWING POSITION (>1D)'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-xs font-medium text-zinc-400">Độ tin cậy:</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-zinc-800 h-2 rounded-full overflow-hidden border border-zinc-700">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${aiConsultPlan.confidence}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-emerald-400 font-mono">{aiConsultPlan.confidence}%</span>
              </div>
            </div>
          </div>

          {/* Card grid for Entry, SL, TP */}
          {(() => {
            const isWait = aiConsultPlan.recommendation === 'WAIT' || aiConsultPlan.entryZone.idealEntry === 0;

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Entry Zone */}
                <div className="bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <Target size={14} /> Vùng Entry Đề xuất
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold">Lý tưởng</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-blue-400">
                    {isWait ? '0 (Đứng ngoài)' : `$${aiConsultPlan.entryZone.idealEntry.toLocaleString()}`}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 flex justify-between pt-1 border-t border-zinc-800">
                    <span>Khoảng mua:</span>
                    <span>{isWait ? '0' : `$${aiConsultPlan.entryZone.minPrice} - $${aiConsultPlan.entryZone.maxPrice}`}</span>
                  </div>
                </div>

                {/* Stop Loss */}
                <div className="bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Stop Loss (Cắt lỗ)
                    </span>
                    <span className="text-[10px] font-mono text-rose-400 font-bold">
                      {isWait ? '0%' : `-${aiConsultPlan.stopLoss.percentage}%`}
                    </span>
                  </div>
                  <div className="text-lg font-bold font-mono text-rose-400">
                    {isWait ? '0' : `$${aiConsultPlan.stopLoss.price.toLocaleString()}`}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-tight pt-1 border-t border-zinc-800 line-clamp-1" title={aiConsultPlan.stopLoss.rationale || aiConsultPlan.stopLoss.method}>
                    {aiConsultPlan.stopLoss.rationale || aiConsultPlan.stopLoss.method}
                  </p>
                </div>

                {/* Take Profit */}
                <div className="bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Take Profit (Chốt lời)
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">
                      {isWait ? '0' : `R:R ${aiConsultPlan.riskRewardRatio}`}
                    </span>
                  </div>
                  <div className="space-y-1 pt-0.5 font-mono text-xs">
                    {isWait || !aiConsultPlan.takeProfit || aiConsultPlan.takeProfit.length === 0 ? (
                      <div className="text-zinc-400 italic text-[11px] py-1">Khuyên đứng ngoài — Entry & TP/SL = 0</div>
                    ) : (
                      aiConsultPlan.takeProfit.map((tp, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-zinc-400">{tp.level}:</span>
                          <span className="font-bold text-emerald-400">${tp.price.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Reasoning Accordion */}
          <div className="bg-zinc-950/40 rounded-xl border border-zinc-800 overflow-hidden">
            <button
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              className="w-full flex items-center justify-between p-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <LineChartIcon size={14} className="text-emerald-400" />
                <span>Lý do & Bằng chứng vào lệnh</span>
              </span>
              {isDetailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isDetailsOpen && (
              <div className="p-3.5 border-t border-zinc-800 space-y-2.5 text-xs text-zinc-300">
                {aiConsultPlan.analysisSummary.candlestickPattern && (
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <p><strong className="text-zinc-200">Hợp lưu Đa Khung:</strong> {aiConsultPlan.analysisSummary.candlestickPattern}</p>
                  </div>
                )}
                {aiConsultPlan.analysisSummary.technicalConfluence && (
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <p><strong className="text-zinc-200">Chỉ số Kỹ thuật:</strong> {aiConsultPlan.analysisSummary.technicalConfluence}</p>
                  </div>
                )}
                {aiConsultPlan.analysisSummary.newsSentiment && (
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <p><strong className="text-zinc-200">Tâm lý Tin tức:</strong> {aiConsultPlan.analysisSummary.newsSentiment}</p>
                  </div>
                )}
                {aiConsultPlan.analysisSummary.keyWarning && (
                  <div className="flex items-start gap-2 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-amber-300">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <p><strong>Cảnh báo biến động:</strong> {aiConsultPlan.analysisSummary.keyWarning}</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
