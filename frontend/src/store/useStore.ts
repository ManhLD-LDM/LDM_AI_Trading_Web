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

interface TradingStore {
  pair: string;
  interval: string;
  signals: SignalMarker[];
  setPair: (pair: string) => void;
  setInterval: (interval: string) => void;
  addSignal: (signal: SignalMarker) => void;
  clearSignals: () => void;
}

export const useTradingStore = create<TradingStore>((set) => ({
  pair: 'BTCUSDT',
  interval: '1m',
  signals: [],
  setPair: (pair) => set({ pair }),
  setInterval: (interval) => set({ interval }),
  addSignal: (signal) => set((state) => ({ signals: [...state.signals, signal] })),
  clearSignals: () => set({ signals: [] }),
}));
