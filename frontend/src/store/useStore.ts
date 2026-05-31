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
  instanceId: string; // Unique ID for this instance on the chart (e.g. 'sma_1')
  indicatorId: string; // The ID from INDICATOR_REGISTRY (e.g. 'sma')
  params: Record<string, any>;
  active: boolean;
};

export type User = {
  email: string;
  preferences?: any;
};

interface TradingStore {
  user: User | null;
  token: string | null;
  pair: string;
  interval: string;
  signals: SignalMarker[];
  indicators: IndicatorConfig[];
  setPair: (pair: string) => void;
  setInterval: (interval: string) => void;
  addSignal: (signal: SignalMarker) => void;
  clearSignals: () => void;
  toggleIndicator: (instanceId: string) => void;
  addIndicator: (indicatorId: string, defaultParams: Record<string, any>) => void;
  removeIndicator: (instanceId: string) => void;
  updateIndicatorParams: (instanceId: string, params: Record<string, any>) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

// Keep some default active instances
const defaultIndicators: IndicatorConfig[] = [
  { instanceId: 'sma_1', indicatorId: 'sma', params: { period: 20, color: '#f59e0b' }, active: false },
  { instanceId: 'ema_1', indicatorId: 'ema', params: { period: 50, color: '#3b82f6' }, active: false },
  { instanceId: 'rsi_1', indicatorId: 'rsi', params: { period: 14, color: '#8b5cf6' }, active: false },
  { instanceId: 'macd_1', indicatorId: 'macd', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, active: false },
];

export const useTradingStore = create<TradingStore>((set) => ({
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  pair: 'BTCUSDT',
  interval: '1m',
  signals: [],
  indicators: defaultIndicators,
  setPair: (pair) => set({ pair }),
  setInterval: (interval) => set({ interval }),
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
  updateIndicatorParams: (instanceId, params) => set((state) => ({
    indicators: state.indicators.map(ind =>
      ind.instanceId === instanceId ? { ...ind, params: { ...ind.params, ...params } } : ind
    )
  })),
  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
    }
    
    // Sync preferences
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
}));
