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
  id: string;
  type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BB';
  period?: number;
  color?: string;
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
  toggleIndicator: (id: string) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const defaultIndicators: IndicatorConfig[] = [
  { id: 'sma_20', type: 'SMA', period: 20, color: '#f59e0b', active: false },
  { id: 'ema_50', type: 'EMA', period: 50, color: '#3b82f6', active: false },
  { id: 'rsi_14', type: 'RSI', period: 14, color: '#8b5cf6', active: false },
  { id: 'macd', type: 'MACD', active: false },
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
  toggleIndicator: (id) => set((state) => ({
    indicators: state.indicators.map(ind => 
      ind.id === id ? { ...ind, active: !ind.active } : ind
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
