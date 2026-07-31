import { create } from 'zustand';
import { UTCTimestamp } from 'lightweight-charts';

export type SignalMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
  price?: number;
};

export type IndicatorConfig = {
  instanceId: string;
  indicatorId: string;
  params: Record<string, any>;
  active: boolean;
};

export type User = {
  email: string;
  preferences?: any;
};

export type AIPlanStatus = 'PENDING' | 'ACTIVE' | 'PARTIAL_TP1' | 'WIN_100' | 'WIN_BE' | 'LOSS';

export type AIConsultPlan = {
  id?: string;
  timestamp?: number;
  activatedAt?: number;
  completedAt?: number;
  reanalyzedAt?: string;
  status?: AIPlanStatus;
  currentSlPrice?: number;
  symbol: string;
  interval: string;
  mode?: string;
  recommendation: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number;
  entryZone: {
    minPrice: number;
    maxPrice: number;
    idealEntry: number;
  };
  stopLoss: {
    price: number;
    percentage: number;
    rationale: string;
    method?: string;
  };
  takeProfit: Array<{
    level: string;
    price: number;
    rrRatio: string;
    closePct: number;
  }>;
  riskRewardRatio: number;
  suggestedLeverage: string;
  recommendedRiskPct: number;
  analysisSummary: {
    candlestickPattern?: string;
    technicalConfluence?: string;
    newsSentiment?: string;
    keyWarning?: string;
  };
  pendingAudit?: {
    tpProbability?: number;
    slProbability?: number;
    riskLevel?: string;
    actionAdvice?: string;
    auditReasoning?: string;
  };
  postMortemAnalysis?: {
    outcomeSummary?: string;
    keyFactors?: string;
    learnedLesson?: string;
  };
};

interface TradingStore {
  user: User | null;
  token: string | null;
  pair: string;
  interval: string;
  signals: SignalMarker[];
  indicators: IndicatorConfig[];
  aiConsultPlan: AIConsultPlan | null;
  aiConsultHistory: AIConsultPlan[];
  isAiConsultLoading: boolean;
  setPair: (pair: string) => void;
  setInterval: (interval: string) => void;
  addSignal: (signal: SignalMarker) => void;
  clearSignals: () => void;
  toggleIndicator: (instanceId: string) => void;
  addIndicator: (indicatorId: string, defaultParams: Record<string, any>) => void;
  removeIndicator: (instanceId: string) => void;
  updateIndicatorParams: (instanceId: string, params: Record<string, any>) => void;
  setAiConsultPlan: (plan: AIConsultPlan | null) => void;
  setAiConsultHistory: (history: AIConsultPlan[]) => void;
  updatePlanPriceTick: (symbol: string, currentPrice: number) => void;
  setIsAiConsultLoading: (loading: boolean) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const defaultIndicators: IndicatorConfig[] = [
  { instanceId: 'sma_1', indicatorId: 'sma', params: { period: 20, color: '#f59e0b' }, active: false },
  { instanceId: 'ema_1', indicatorId: 'ema', params: { period: 50, color: '#3b82f6' }, active: false },
  { instanceId: 'rsi_1', indicatorId: 'rsi', params: { period: 14, color: '#8b5cf6' }, active: false },
  { instanceId: 'macd_1', indicatorId: 'macd', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, active: false },
];

function getPlanDedupeKey(p: AIConsultPlan): string {
  if (p.id) return p.id;
  return `${p.timestamp || ''}_${p.symbol}_${p.interval}_${p.recommendation}_${p.entryZone?.idealEntry || ''}`;
}

export const useTradingStore = create<TradingStore>()((set, get) => {
  const syncPreferences = async () => {
    const state = get();
    if (state.token && typeof window !== 'undefined') {
      const { apiPut } = await import('@/lib/api');
      const preferences = {
        pair: state.pair,
        interval: state.interval,
        indicators: state.indicators
      };
      apiPut('/api/user/preferences', preferences, state.token).catch(() => {});
    }
  };

  return {
    user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
    token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
    pair: typeof window !== 'undefined' ? (localStorage.getItem('user_pair') || 'BTCUSDT') : 'BTCUSDT',
    interval: typeof window !== 'undefined' ? (localStorage.getItem('user_interval') || '15m') : '15m',
    signals: [],
    indicators: defaultIndicators,
    aiConsultPlan: null,
    aiConsultHistory: [],
    isAiConsultLoading: false,

    setAiConsultPlan: (plan) => set((state) => {
      if (!plan) return { aiConsultPlan: null };
      const planKey = getPlanDedupeKey(plan);
      const existing = state.aiConsultHistory.find(p => getPlanDedupeKey(p) === planKey);
      
      const currentStatus = plan.status || (existing && existing.status !== 'PENDING' ? existing.status : 'PENDING');

      const planWithMeta: AIConsultPlan = {
        ...plan,
        id: planKey,
        timestamp: plan.timestamp || Date.now(),
        status: currentStatus,
        activatedAt: plan.activatedAt || existing?.activatedAt,
        completedAt: plan.completedAt || existing?.completedAt,
        currentSlPrice: plan.currentSlPrice || existing?.currentSlPrice,
        pendingAudit: plan.pendingAudit || existing?.pendingAudit,
        postMortemAnalysis: plan.postMortemAnalysis || existing?.postMortemAnalysis,
      };
      
      const filtered = state.aiConsultHistory.filter(p => getPlanDedupeKey(p) !== planKey);
      return {
        aiConsultPlan: planWithMeta,
        aiConsultHistory: [planWithMeta, ...filtered].slice(0, 50),
      };
    }),

    setAiConsultHistory: (history) => set((state) => {
      const seen = new Set<string>();
      const deduplicated: AIConsultPlan[] = [];
      
      for (const p of history) {
        const key = getPlanDedupeKey(p);
        if (!seen.has(key)) {
          seen.add(key);
          const existing = state.aiConsultHistory.find(ex => getPlanDedupeKey(ex) === key);
          const finalStatus = p.status || (existing && existing.status !== 'PENDING' ? existing.status : 'PENDING');

          deduplicated.push({
            ...p,
            id: key,
            timestamp: p.timestamp || Date.now(),
            status: finalStatus,
            activatedAt: p.activatedAt || existing?.activatedAt,
            completedAt: p.completedAt || existing?.completedAt,
            currentSlPrice: p.currentSlPrice || existing?.currentSlPrice,
            pendingAudit: p.pendingAudit || existing?.pendingAudit,
            postMortemAnalysis: p.postMortemAnalysis || existing?.postMortemAnalysis,
          });
        }
      }
      return { aiConsultHistory: deduplicated.slice(0, 50) };
    }),

    updatePlanPriceTick: (symbol, price) => set((state) => {
      const symUpper = symbol.toUpperCase().replace('/', '');
      let hasStateChanges = false;

      const updatedHistory = state.aiConsultHistory.map((plan) => {
        const planSym = plan.symbol.toUpperCase().replace('/', '');
        if (planSym !== symUpper || plan.recommendation === 'WAIT' || plan.entryZone?.idealEntry === 0) return plan;

        const isLong = plan.recommendation === 'LONG';
        const currentStatus = plan.status || 'PENDING';
        const idealEntry = plan.entryZone.idealEntry;
        const minEntry = plan.entryZone.minPrice;
        const maxEntry = plan.entryZone.maxPrice;
        const sl = plan.stopLoss.price;
        const tp1 = plan.takeProfit[0]?.price || (isLong ? idealEntry * 1.015 : idealEntry * 0.985);
        const tp2 = plan.takeProfit[1]?.price || (isLong ? idealEntry * 1.03 : idealEntry * 0.97);

        let nextStatus: AIPlanStatus = currentStatus;
        let activatedAt = plan.activatedAt;
        let completedAt = plan.completedAt;
        let currentSlPrice = plan.currentSlPrice || sl;

        // RULE: Ignore ticks before position creation timestamp
        const planTime = plan.timestamp || 0;
        if (planTime > 0 && Date.now() < planTime - 15 * 60 * 1000) return plan;

        if (currentStatus === 'PENDING') {
          const entryMin = Math.min(minEntry, maxEntry);
          const entryMax = Math.max(minEntry, maxEntry);

          // Correct Limit Order Entry Activation:
          // LONG: Order triggers when price DROPS DOWN to or below entryMax
          // SHORT: Order triggers when price RALLIES UP to or above entryMin
          const isActivatedLong = isLong && price <= entryMax * 1.001;
          const isActivatedShort = !isLong && price >= entryMin * 0.999;

          if (isActivatedLong || isActivatedShort) {
            nextStatus = 'ACTIVE';
            activatedAt = Date.now();
            hasStateChanges = true;
          }
        }

        if (nextStatus === 'ACTIVE') {
          if (isLong) {
            if (price >= tp1) {
              nextStatus = 'PARTIAL_TP1';
              currentSlPrice = idealEntry;
              hasStateChanges = true;
            } else if (price <= sl) {
              nextStatus = 'LOSS';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          } else {
            if (price <= tp1) {
              nextStatus = 'PARTIAL_TP1';
              currentSlPrice = idealEntry;
              hasStateChanges = true;
            } else if (price >= sl) {
              nextStatus = 'LOSS';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          }
        }

        if (nextStatus === 'PARTIAL_TP1') {
          if (isLong) {
            if (price >= tp2) {
              nextStatus = 'WIN_100';
              completedAt = Date.now();
              hasStateChanges = true;
            } else if (price <= idealEntry) {
              nextStatus = 'WIN_BE';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          } else {
            if (price <= tp2) {
              nextStatus = 'WIN_100';
              completedAt = Date.now();
              hasStateChanges = true;
            } else if (price >= idealEntry) {
              nextStatus = 'WIN_BE';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          }
        }

        if (nextStatus === currentStatus) return plan;

        const updatedPlan: AIConsultPlan = {
          ...plan,
          status: nextStatus,
          activatedAt,
          completedAt,
          currentSlPrice,
        };

        if (state.token && plan.id) {
          import('@/lib/api').then(({ apiPut }) => {
            apiPut('/api/live/ai-consult/status', {
              id: plan.id,
              status: nextStatus,
              activatedAt,
              completedAt,
              currentSlPrice,
            }, state.token).then((res: any) => {
              if (res && res.postMortemAnalysis) {
                useTradingStore.setState((s) => ({
                  aiConsultHistory: s.aiConsultHistory.map(p => p.id === plan.id ? { ...p, postMortemAnalysis: res.postMortemAnalysis } : p)
                }));
              }
            }).catch(() => {});
          });
        }

        return updatedPlan;
      });

      return hasStateChanges ? { aiConsultHistory: updatedHistory } : {};
    }),

    setIsAiConsultLoading: (loading) => set({ isAiConsultLoading: loading }),
    setPair: (pair) => {
      if (typeof window !== 'undefined') localStorage.setItem('user_pair', pair);
      set({ pair });
      syncPreferences();
    },
    setInterval: (interval) => {
      if (typeof window !== 'undefined') localStorage.setItem('user_interval', interval);
      set({ interval });
      syncPreferences();
    },
    addSignal: (signal) => set((state) => ({ signals: [...state.signals, signal] })),
    clearSignals: () => set({ signals: [] }),
    toggleIndicator: (instanceId) => set((state) => ({
      indicators: state.indicators.map(ind => 
        ind.instanceId === instanceId ? { ...ind, active: !ind.active } : ind
      )
    })),
    addIndicator: (indicatorId, defaultParams) => set((state) => {
      const newInstanceId = `${indicatorId}_${Date.now()}`;
      return {
        indicators: [...state.indicators, {
          instanceId: newInstanceId,
          indicatorId,
          params: defaultParams,
          active: true
        }]
      };
    }),
    removeIndicator: (instanceId) => set((state) => ({
      indicators: state.indicators.filter(ind => ind.instanceId !== instanceId)
    })),
    updateIndicatorParams: (instanceId, params) => {
      set((state) => ({
        indicators: state.indicators.map(ind =>
          ind.instanceId === instanceId ? { ...ind, params: { ...ind.params, ...params } } : ind
        )
      }));
      syncPreferences();
    },
    login: (user, token) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
      }
      const updates: Partial<TradingStore> = { user, token };
      if (user.preferences) {
        if (user.preferences.pair) {
          updates.pair = user.preferences.pair;
          if (typeof window !== 'undefined') localStorage.setItem('user_pair', user.preferences.pair);
        }
        if (user.preferences.interval) {
          updates.interval = user.preferences.interval;
          if (typeof window !== 'undefined') localStorage.setItem('user_interval', user.preferences.interval);
        }
        if (user.preferences.indicators) updates.indicators = user.preferences.indicators;
      }
      set(updates);
    },
    logout: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
      set({ user: null, token: null });
    },
  };
});
