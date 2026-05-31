'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, LogicalRange } from 'lightweight-charts';
import { useTradingStore } from '@/store/useStore';
import { SMA, EMA, RSI, MACD } from 'technicalindicators';

type KlineData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function ChartComponent() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indicatorsSeriesRef = useRef<{ [id: string]: ISeriesApi<any> }>({});
  
  const [chartData, setChartData] = useState<KlineData[]>([]);
  const chartDataRef = useRef<KlineData[]>([]);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  const { pair, interval, signals, indicators } = useTradingStore();

  const fetchKlines = async (endTime?: number) => {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=1000${endTime ? `&endTime=${endTime}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      
      return data.map((d: any) => ({
        time: (d[0] / 1000) as UTCTimestamp,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
    } catch (err) {
      console.error("Failed to fetch klines", err);
      return [];
    }
  };

  // 1. Setup Chart and Handle Infinite Scroll
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#374151', style: 1 }, horzLines: { color: '#374151', style: 1 } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    
    // Custom price scales are configured when indicators are active

    chartRef.current = chart;
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    seriesRef.current = candlestickSeries;

    // Load initial data
    isInitialLoadRef.current = true;
    fetchKlines().then(data => {
      chartDataRef.current = data;
      setChartData(data);
      candlestickSeries.setData(data);
      isInitialLoadRef.current = false;
    });

    // Handle visible range change for pagination
    const onVisibleLogicalRangeChanged = async (logicalRange: LogicalRange | null) => {
      if (!logicalRange || isInitialLoadRef.current || isLoadingRef.current) return;
      
      // If we scroll near the left edge (older data)
      if (logicalRange.from < 50) {
        if (chartDataRef.current.length === 0) return;
        
        isLoadingRef.current = true;
        const oldestTime = (chartDataRef.current[0].time as number) * 1000;
        
        fetchKlines(oldestTime - 1).then(olderData => {
          if (olderData.length > 0) {
            setChartData(prevData => {
              // Ensure strictly older
              const filteredOlder = olderData.filter(d => d.time < prevData[0].time);
              if (filteredOlder.length === 0) return prevData;
              
              const newData = [...filteredOlder, ...prevData];
              
              // Sort to guarantee ascending order
              newData.sort((a, b) => (a.time as number) - (b.time as number));
              
              // Deduplicate by time
              const uniqueData = newData.filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);
              
              chartDataRef.current = uniqueData;
              candlestickSeries.setData(uniqueData);
              return uniqueData;
            });
          }
          isLoadingRef.current = false;
        }).catch(() => {
          isLoadingRef.current = false;
        });
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
      chart.remove();
    };
  }, [pair, interval]); // Re-create chart on pair/interval change

  // 2. Handle WebSocket
  useEffect(() => {
    const wsInterval = interval.toLowerCase();
    const wsPair = pair.toLowerCase();
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsPair}@kline_${wsInterval}`);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const kline = message.k;
      if (seriesRef.current) {
        const newKline = {
          time: (kline.t / 1000) as UTCTimestamp,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
        };
        seriesRef.current.update(newKline);
        
        // Optimistically update chartData for indicators
        setChartData(prev => {
          if (prev.length === 0) {
            chartDataRef.current = [newKline];
            return [newKline];
          }
          const last = prev[prev.length - 1];
          let updated;
          if (last.time === newKline.time) {
            updated = [...prev.slice(0, -1), newKline];
          } else if (newKline.time > last.time) {
            updated = [...prev, newKline];
          } else {
            updated = prev;
          }
          chartDataRef.current = updated;
          return updated;
        });
      }
    };
    return () => ws.close();
  }, [pair, interval]);

  // 3. Handle Markers
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setMarkers(signals);
    }
  }, [signals]);

  // 4. Handle Indicators
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;
    
    // Clean up existing indicator series
    Object.values(indicatorsSeriesRef.current).forEach(series => {
      chartRef.current?.removeSeries(series);
    });
    indicatorsSeriesRef.current = {};

    const closePrices = chartData.map(d => d.close);
    
    indicators.filter(ind => ind.active).forEach(ind => {
      if (ind.type === 'SMA' && ind.period) {
        const smaValues = SMA.calculate({ period: ind.period, values: closePrices });
        const lineSeries = chartRef.current!.addLineSeries({ color: ind.color, lineWidth: 2, priceScaleId: 'right' });
        const seriesData = smaValues.map((val, i) => ({ time: chartData[i + ind.period! - 1].time, value: val }));
        lineSeries.setData(seriesData);
        indicatorsSeriesRef.current[ind.id] = lineSeries;
      }
      
      if (ind.type === 'EMA' && ind.period) {
        const emaValues = EMA.calculate({ period: ind.period, values: closePrices });
        const lineSeries = chartRef.current!.addLineSeries({ color: ind.color, lineWidth: 2, priceScaleId: 'right' });
        const seriesData = emaValues.map((val, i) => ({ time: chartData[i + ind.period! - 1].time, value: val }));
        lineSeries.setData(seriesData);
        indicatorsSeriesRef.current[ind.id] = lineSeries;
      }

      if (ind.type === 'RSI' && ind.period) {
        const rsiValues = RSI.calculate({ period: ind.period, values: closePrices });
        const lineSeries = chartRef.current!.addLineSeries({ color: ind.color, lineWidth: 1.5, priceScaleId: 'rsi' });
        chartRef.current!.priceScale('rsi').applyOptions({ visible: true, scaleMargins: { top: 0.8, bottom: 0 } });
        const seriesData = rsiValues.map((val, i) => ({ time: chartData[i + ind.period!].time, value: val }));
        lineSeries.setData(seriesData);
        indicatorsSeriesRef.current[ind.id] = lineSeries;
      }

      if (ind.type === 'MACD') {
        const macdValues = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: closePrices });
        
        const macdLine = chartRef.current!.addLineSeries({ color: '#2962FF', lineWidth: 1.5, priceScaleId: 'macd' });
        const signalLine = chartRef.current!.addLineSeries({ color: '#FF6D00', lineWidth: 1.5, priceScaleId: 'macd' });
        const histogram = chartRef.current!.addHistogramSeries({ priceScaleId: 'macd' });
        
        chartRef.current!.priceScale('macd').applyOptions({ visible: true, scaleMargins: { top: 0.8, bottom: 0 } });
        
        const macdData: any[] = [];
        const signalData: any[] = [];
        const histData: any[] = [];

        macdValues.forEach((val, i) => {
          if (val.MACD !== undefined) {
            const time = chartData[i + 25].time; // MACD needs 26 periods
            macdData.push({ time, value: val.MACD });
            if (val.signal !== undefined) signalData.push({ time, value: val.signal });
            if (val.histogram !== undefined) {
              const color = val.histogram > 0 ? '#26A69A' : '#EF5350';
              histData.push({ time, value: val.histogram, color });
            }
          }
        });

        macdLine.setData(macdData);
        signalLine.setData(signalData);
        histogram.setData(histData);
        
        indicatorsSeriesRef.current[`${ind.id}_macd`] = macdLine;
        indicatorsSeriesRef.current[`${ind.id}_signal`] = signalLine;
        indicatorsSeriesRef.current[`${ind.id}_hist`] = histogram;
      }
    });

  }, [indicators, chartData]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
