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
    pair: 'BTCUSDT',
    interval: '1m',
    signals: [],
    indicators: defaultIndicators,
    aiConsultPlan: null,
    aiConsultHistory: [],
    isAiConsultLoading: false,

    setAiConsultPlan: (plan) => set((state) => {
      if (!plan) return { aiConsultPlan: null };
      const planKey = getPlanDedupeKey(plan);
      const planWithMeta: AIConsultPlan = {
        ...plan,
        id: planKey,
        timestamp: plan.timestamp || Date.now(),
        status: plan.status || 'PENDING',
      };
      
      const filtered = state.aiConsultHistory.filter(p => getPlanDedupeKey(p) !== planKey);
      return {
        aiConsultPlan: planWithMeta,
        aiConsultHistory: [planWithMeta, ...filtered].slice(0, 50),
      };
    }),

    setAiConsultHistory: (history) => set(() => {
      const seen = new Set<string>();
      const deduplicated: AIConsultPlan[] = [];
      for (const p of history) {
        const key = getPlanDedupeKey(p);
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push({
            ...p,
            id: key,
            timestamp: p.timestamp || Date.now(),
            status: p.status || 'PENDING',
          });
        }
      }
      return { aiConsultHistory: deduplicated.slice(0, 50) };
    }),

    // Realtime Evaluation Engine: Updates AI Signal Status against live market price
    updatePlanPriceTick: (symbol, price) => set((state) => {
      const symUpper = symbol.toUpperCase().replace('/', '');
      let hasStateChanges = false;

      const updatedHistory = state.aiConsultHistory.map((plan) => {
        const planSym = plan.symbol.toUpperCase().replace('/', '');
        if (planSym !== symUpper) return plan;

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

        // Rule 1: PENDING -> ACTIVE (When live price reaches Entry Zone)
        if (currentStatus === 'PENDING') {
          const entryMin = Math.min(minEntry, maxEntry) * 0.999;
          const entryMax = Math.max(minEntry, maxEntry) * 1.001;
          if (price >= entryMin && price <= entryMax) {
            nextStatus = 'ACTIVE';
            activatedAt = Date.now();
            hasStateChanges = true;
          }
        }

        // Rule 2: ACTIVE -> PARTIAL_TP1 (Hit TP1) or LOSS (Hit SL)
        if (nextStatus === 'ACTIVE') {
          if (isLong) {
            if (price >= tp1) {
              nextStatus = 'PARTIAL_TP1';
              currentSlPrice = idealEntry; // Move SL to Break-Even (BE)
              hasStateChanges = true;
            } else if (price <= sl) {
              nextStatus = 'LOSS';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          } else { // SHORT
            if (price <= tp1) {
              nextStatus = 'PARTIAL_TP1';
              currentSlPrice = idealEntry; // Move SL to Break-Even (BE)
              hasStateChanges = true;
            } else if (price >= sl) {
              nextStatus = 'LOSS';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          }
        }

        // Rule 3: PARTIAL_TP1 -> WIN_100 (Hit TP2) or WIN_BE (Hit BE)
        if (nextStatus === 'PARTIAL_TP1') {
          if (isLong) {
            if (price >= tp2) {
              nextStatus = 'WIN_100';
              completedAt = Date.now();
              hasStateChanges = true;
            } else if (price <= idealEntry) { // Hit BE
              nextStatus = 'WIN_BE';
              completedAt = Date.now();
              hasStateChanges = true;
            }
          } else { // SHORT
            if (price <= tp2) {
              nextStatus = 'WIN_100';
              completedAt = Date.now();
              hasStateChanges = true;
            } else if (price >= idealEntry) { // Hit BE
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

        // Sync updated status to MongoDB
        if (state.token && plan.id) {
          import('@/lib/api').then(({ apiPut }) => {
            apiPut('/api/live/ai-consult/status', {
              id: plan.id,
              status: nextStatus,
              activatedAt,
              completedAt,
              currentSlPrice,
            }, state.token).catch(() => {});
          });
        }

        return updatedPlan;
      });

      return hasStateChanges ? { aiConsultHistory: updatedHistory } : {};
    }),

    setIsAiConsultLoading: (loading) => set({ isAiConsultLoading: loading }),
    setPair: (pair) => { set({ pair }); syncPreferences(); },
    setInterval: (interval) => { set({ interval }); syncPreferences(); },
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
        if (user.preferences.pair) updates.pair = user.preferences.pair;
        if (user.preferences.interval) updates.interval = user.preferences.interval;
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
