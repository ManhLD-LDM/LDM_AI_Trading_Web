import { 
  SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ATR, ADX, 
  WMA, WEMA, ROC, CCI, AwesomeOscillator, WilliamsR, TRIX, ForceIndex, VWAP,
  KST, PSAR, ADL, OBV, MFI, StochasticRSI, IchimokuCloud
} from 'technicalindicators';

export type IndicatorCategory = 'Trend' | 'Oscillator' | 'Volatility' | 'Volume' | 'Other' | 'Momentum';
export type SeriesPlacement = 'overlay' | 'oscillator';

export interface IndicatorParamDef {
  name: string;
  type: 'number' | 'color';
  default: any;
  min?: number;
  max?: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  shortName: string;
  category: IndicatorCategory;
  placement: SeriesPlacement;
  params: Record<string, IndicatorParamDef>;
  calculate: (data: { time: number[], open: number[], high: number[], low: number[], close: number[], volume: number[] }, params: any) => any[];
  // Definition of the lines/series this indicator produces
  lines: {
    id: string;
    title: string;
    type: 'line' | 'histogram';
    colorParam?: string; // which param controls this color
    defaultColor?: string;
  }[];
}

export const INDICATOR_REGISTRY: IndicatorDef[] = [
  {
    id: 'sma',
    name: 'Simple Moving Average',
    shortName: 'SMA',
    category: 'Trend',
    placement: 'overlay',
    params: {
      period: { name: 'Period', type: 'number', default: 20, min: 1, max: 200 },
      color: { name: 'Color', type: 'color', default: '#f59e0b' }
    },
    lines: [{ id: 'main', title: 'SMA', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = SMA.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'ema',
    name: 'Exponential Moving Average',
    shortName: 'EMA',
    category: 'Trend',
    placement: 'overlay',
    params: {
      period: { name: 'Period', type: 'number', default: 20, min: 1, max: 200 },
      color: { name: 'Color', type: 'color', default: '#3b82f6' }
    },
    lines: [{ id: 'main', title: 'EMA', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = EMA.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'rsi',
    name: 'Relative Strength Index',
    shortName: 'RSI',
    category: 'Oscillator',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#8b5cf6' }
    },
    lines: [{ id: 'main', title: 'RSI', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = RSI.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period], main: v }));
    }
  },
  {
    id: 'macd',
    name: 'Moving Average Convergence Divergence',
    shortName: 'MACD',
    category: 'Oscillator',
    placement: 'oscillator',
    params: {
      fastPeriod: { name: 'Fast Period', type: 'number', default: 12, min: 1 },
      slowPeriod: { name: 'Slow Period', type: 'number', default: 26, min: 1 },
      signalPeriod: { name: 'Signal Period', type: 'number', default: 9, min: 1 },
    },
    lines: [
      { id: 'macd', title: 'MACD', type: 'line', defaultColor: '#2962FF' },
      { id: 'signal', title: 'Signal', type: 'line', defaultColor: '#FF6D00' },
      { id: 'histogram', title: 'Histogram', type: 'histogram' } // Special color handling in renderer
    ],
    calculate: (data, params) => {
      const result = MACD.calculate({ 
        fastPeriod: params.fastPeriod, 
        slowPeriod: params.slowPeriod, 
        signalPeriod: params.signalPeriod, 
        SimpleMAOscillator: false, 
        SimpleMASignal: false, 
        values: data.close 
      });
      // MACD uses slowPeriod - 1 elements, wait, technicalindicators MACD output length is close.length - slowPeriod + 1
      return result.map((v, i) => ({ 
        time: data.time[i + params.slowPeriod - 1], 
        macd: v.MACD, 
        signal: v.signal, 
        histogram: v.histogram 
      }));
    }
  },
  {
    id: 'bb',
    name: 'Bollinger Bands',
    shortName: 'BB',
    category: 'Volatility',
    placement: 'overlay',
    params: {
      period: { name: 'Period', type: 'number', default: 20, min: 1 },
      stdDev: { name: 'Std Dev', type: 'number', default: 2, min: 0.1 },
      color: { name: 'Color', type: 'color', default: '#0ea5e9' }
    },
    lines: [
      { id: 'upper', title: 'Upper', type: 'line', colorParam: 'color' },
      { id: 'middle', title: 'Middle', type: 'line', colorParam: 'color' },
      { id: 'lower', title: 'Lower', type: 'line', colorParam: 'color' },
    ],
    calculate: (data, params) => {
      const result = BollingerBands.calculate({ period: params.period, stdDev: params.stdDev, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], upper: v.upper, middle: v.middle, lower: v.lower }));
    }
  },
  {
    id: 'stoch',
    name: 'Stochastic Oscillator',
    shortName: 'Stoch',
    category: 'Oscillator',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1 },
      signalPeriod: { name: 'Signal Period', type: 'number', default: 3, min: 1 },
    },
    lines: [
      { id: 'k', title: '%K', type: 'line', defaultColor: '#3b82f6' },
      { id: 'd', title: '%D', type: 'line', defaultColor: '#f59e0b' }
    ],
    calculate: (data, params) => {
      const result = Stochastic.calculate({ period: params.period, signalPeriod: params.signalPeriod, high: data.high, low: data.low, close: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period + params.signalPeriod - 2], k: v.k, d: v.d }));
    }
  },
  {
    id: 'atr',
    name: 'Average True Range',
    shortName: 'ATR',
    category: 'Volatility',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1 },
      color: { name: 'Color', type: 'color', default: '#ef4444' }
    },
    lines: [{ id: 'main', title: 'ATR', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = ATR.calculate({ period: params.period, high: data.high, low: data.low, close: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'adx',
    name: 'Average Directional Index',
    shortName: 'ADX',
    category: 'Trend',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1 },
    },
    lines: [
      { id: 'adx', title: 'ADX', type: 'line', defaultColor: '#ec4899' },
      { id: 'pdi', title: '+DI', type: 'line', defaultColor: '#10b981' },
      { id: 'mdi', title: '-DI', type: 'line', defaultColor: '#ef4444' }
    ],
    calculate: (data, params) => {
      const result = ADX.calculate({ period: params.period, high: data.high, low: data.low, close: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period * 2 - 2], adx: v.adx, pdi: v.pdi, mdi: v.mdi }));
    }
  },
  {
    id: 'wma',
    name: 'Weighted Moving Average',
    shortName: 'WMA',
    category: 'Trend',
    placement: 'overlay',
    params: {
      period: { name: 'Period', type: 'number', default: 9, min: 1, max: 200 },
      color: { name: 'Color', type: 'color', default: '#ff9800' }
    },
    lines: [{ id: 'main', title: 'WMA', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = WMA.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'roc',
    name: 'Rate of Change',
    shortName: 'ROC',
    category: 'Momentum',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 12, min: 1, max: 200 },
      color: { name: 'Color', type: 'color', default: '#00bcd4' }
    },
    lines: [{ id: 'main', title: 'ROC', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = ROC.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period], main: v }));
    }
  },
  {
    id: 'cci',
    name: 'Commodity Channel Index',
    shortName: 'CCI',
    category: 'Oscillator',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 20, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#ff5722' }
    },
    lines: [{ id: 'main', title: 'CCI', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = CCI.calculate({ period: params.period, high: data.high, low: data.low, close: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'awesomeoscillator',
    name: 'Awesome Oscillator',
    shortName: 'AO',
    category: 'Oscillator',
    placement: 'oscillator',
    params: {
      fastPeriod: { name: 'Fast Period', type: 'number', default: 5, min: 1, max: 100 },
      slowPeriod: { name: 'Slow Period', type: 'number', default: 34, min: 1, max: 200 }
    },
    lines: [{ id: 'main', title: 'AO', type: 'histogram' }],
    calculate: (data, params) => {
      const result = AwesomeOscillator.calculate({ fastPeriod: params.fastPeriod, slowPeriod: params.slowPeriod, high: data.high, low: data.low });
      return result.map((v, i) => ({ time: data.time[i + params.slowPeriod - 1], main: v }));
    }
  },
  {
    id: 'williamsr',
    name: 'Williams %R',
    shortName: '%R',
    category: 'Momentum',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#9c27b0' }
    },
    lines: [{ id: 'main', title: '%R', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = WilliamsR.calculate({ period: params.period, high: data.high, low: data.low, close: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'trix',
    name: 'TRIX',
    shortName: 'TRIX',
    category: 'Momentum',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 18, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#3f51b5' }
    },
    lines: [{ id: 'main', title: 'TRIX', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = TRIX.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period * 3 - 3], main: v }));
    }
  },
  {
    id: 'forceindex',
    name: 'Force Index',
    shortName: 'FI',
    category: 'Volume',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 13, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#4caf50' }
    },
    lines: [{ id: 'main', title: 'FI', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = ForceIndex.calculate({ period: params.period, close: data.close, volume: data.volume });
      return result.map((v, i) => ({ time: data.time[i + params.period], main: v }));
    }
  },
  {
    id: 'vwap',
    name: 'Volume Weighted Average Price',
    shortName: 'VWAP',
    category: 'Volume',
    placement: 'overlay',
    params: {
      color: { name: 'Color', type: 'color', default: '#ff4081' }
    },
    lines: [{ id: 'main', title: 'VWAP', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = VWAP.calculate({ high: data.high, low: data.low, close: data.close, volume: data.volume });
      return result.map((v, i) => ({ time: data.time[i], main: v }));
    }
  },
  {
    id: 'wema',
    name: 'Wilders Smoothing (WEMA)',
    shortName: 'WEMA',
    category: 'Trend',
    placement: 'overlay',
    params: {
      period: { name: 'Period', type: 'number', default: 9, min: 1, max: 200 },
      color: { name: 'Color', type: 'color', default: '#ffeb3b' }
    },
    lines: [{ id: 'main', title: 'WEMA', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = WEMA.calculate({ period: params.period, values: data.close });
      return result.map((v, i) => ({ time: data.time[i + params.period - 1], main: v }));
    }
  },
  {
    id: 'kst',
    name: 'Know Sure Thing',
    shortName: 'KST',
    category: 'Momentum',
    placement: 'oscillator',
    params: {
      ROCPer1: { name: 'ROC Period 1', type: 'number', default: 10, min: 1, max: 50 },
      ROCPer2: { name: 'ROC Period 2', type: 'number', default: 15, min: 1, max: 50 },
      ROCPer3: { name: 'ROC Period 3', type: 'number', default: 20, min: 1, max: 50 },
      ROCPer4: { name: 'ROC Period 4', type: 'number', default: 30, min: 1, max: 50 },
      SMAROCPer1: { name: 'SMA ROC Period 1', type: 'number', default: 10, min: 1, max: 50 },
      SMAROCPer2: { name: 'SMA ROC Period 2', type: 'number', default: 10, min: 1, max: 50 },
      SMAROCPer3: { name: 'SMA ROC Period 3', type: 'number', default: 10, min: 1, max: 50 },
      SMAROCPer4: { name: 'SMA ROC Period 4', type: 'number', default: 15, min: 1, max: 50 },
      signalPeriod: { name: 'Signal Period', type: 'number', default: 9, min: 1, max: 50 }
    },
    lines: [
      { id: 'kst', title: 'KST', type: 'line', defaultColor: '#00bcd4' },
      { id: 'signal', title: 'Signal', type: 'line', defaultColor: '#ff5722' }
    ],
    calculate: (data, params) => {
      const result = KST.calculate({
        ROCPer1: params.ROCPer1, ROCPer2: params.ROCPer2, ROCPer3: params.ROCPer3, ROCPer4: params.ROCPer4,
        SMAROCPer1: params.SMAROCPer1, SMAROCPer2: params.SMAROCPer2, SMAROCPer3: params.SMAROCPer3, SMAROCPer4: params.SMAROCPer4,
        signalPeriod: params.signalPeriod,
        values: data.close
      });
      // KST starts generating values late due to multiple periods
      // KST length = close.length - (longest SMA ROC Per + longest ROC Per) or so
      // Assuming it drops around ROCPer4 + SMAROCPer4 - 1
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], kst: v.kst, signal: v.signal }));
    }
  },
  {
    id: 'psar',
    name: 'Parabolic SAR',
    shortName: 'PSAR',
    category: 'Trend',
    placement: 'overlay',
    params: {
      step: { name: 'Step', type: 'number', default: 0.02, min: 0.001, max: 0.5 },
      max: { name: 'Max', type: 'number', default: 0.2, min: 0.01, max: 2.0 },
      color: { name: 'Color', type: 'color', default: '#3f51b5' }
    },
    lines: [{ id: 'main', title: 'PSAR', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = PSAR.calculate({ step: params.step, max: params.max, high: data.high, low: data.low });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], main: v }));
    }
  },
  {
    id: 'obv',
    name: 'On Balance Volume',
    shortName: 'OBV',
    category: 'Volume',
    placement: 'oscillator',
    params: {
      color: { name: 'Color', type: 'color', default: '#e91e63' }
    },
    lines: [{ id: 'main', title: 'OBV', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = OBV.calculate({ close: data.close, volume: data.volume });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], main: v }));
    }
  },
  {
    id: 'adl',
    name: 'Accumulation Distribution Line',
    shortName: 'ADL',
    category: 'Volume',
    placement: 'oscillator',
    params: {
      color: { name: 'Color', type: 'color', default: '#795548' }
    },
    lines: [{ id: 'main', title: 'ADL', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = ADL.calculate({ high: data.high, low: data.low, close: data.close, volume: data.volume });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], main: v }));
    }
  },
  {
    id: 'mfi',
    name: 'Money Flow Index',
    shortName: 'MFI',
    category: 'Volume',
    placement: 'oscillator',
    params: {
      period: { name: 'Period', type: 'number', default: 14, min: 1, max: 100 },
      color: { name: 'Color', type: 'color', default: '#009688' }
    },
    lines: [{ id: 'main', title: 'MFI', type: 'line', colorParam: 'color' }],
    calculate: (data, params) => {
      const result = MFI.calculate({ period: params.period, high: data.high, low: data.low, close: data.close, volume: data.volume });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], main: v }));
    }
  },
  {
    id: 'stochasticrsi',
    name: 'Stochastic RSI',
    shortName: 'StochRSI',
    category: 'Momentum',
    placement: 'oscillator',
    params: {
      rsiPeriod: { name: 'RSI Period', type: 'number', default: 14, min: 1, max: 50 },
      stochasticPeriod: { name: 'Stoch Period', type: 'number', default: 14, min: 1, max: 50 },
      kPeriod: { name: '%K Period', type: 'number', default: 3, min: 1, max: 20 },
      dPeriod: { name: '%D Period', type: 'number', default: 3, min: 1, max: 20 }
    },
    lines: [
      { id: 'k', title: '%K', type: 'line', defaultColor: '#2962FF' },
      { id: 'd', title: '%D', type: 'line', defaultColor: '#FF6D00' }
    ],
    calculate: (data, params) => {
      const result = StochasticRSI.calculate({ 
        rsiPeriod: params.rsiPeriod, stochasticPeriod: params.stochasticPeriod, 
        kPeriod: params.kPeriod, dPeriod: params.dPeriod, values: data.close 
      });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ time: data.time[i + startIdx], k: v.k, d: v.d }));
    }
  },
  {
    id: 'ichimokucloud',
    name: 'Ichimoku Cloud',
    shortName: 'Ichimoku',
    category: 'Trend',
    placement: 'overlay',
    params: {
      conversionPeriod: { name: 'Conversion Line', type: 'number', default: 9, min: 1, max: 50 },
      basePeriod: { name: 'Base Line', type: 'number', default: 26, min: 1, max: 100 },
      spanPeriod: { name: 'Leading Span B', type: 'number', default: 52, min: 1, max: 150 },
      displacement: { name: 'Displacement', type: 'number', default: 26, min: 1, max: 100 }
    },
    lines: [
      { id: 'conversion', title: 'Tenkan', type: 'line', defaultColor: '#0496FF' },
      { id: 'base', title: 'Kijun', type: 'line', defaultColor: '#991515' },
      { id: 'spanA', title: 'Senkou A', type: 'line', defaultColor: '#008000' },
      { id: 'spanB', title: 'Senkou B', type: 'line', defaultColor: '#FF0000' }
    ],
    calculate: (data, params) => {
      const result = IchimokuCloud.calculate({ 
        conversionPeriod: params.conversionPeriod, 
        basePeriod: params.basePeriod, 
        spanPeriod: params.spanPeriod, 
        displacement: params.displacement, 
        high: data.high, low: data.low 
      });
      const startIdx = data.close.length - result.length;
      return result.map((v, i) => ({ 
        time: data.time[i + startIdx], 
        conversion: v.conversion, 
        base: v.base,
        spanA: v.spanA,
        spanB: v.spanB
      }));
    }
  }
];

export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return INDICATOR_REGISTRY.find(ind => ind.id === id);
}

export function getDefaultParams(def: IndicatorDef): Record<string, any> {
  const params: Record<string, any> = {};
  for (const [key, paramDef] of Object.entries(def.params)) {
    params[key] = paramDef.default;
  }
  return params;
}
