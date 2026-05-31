'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useTradingStore } from '@/store/useStore';

export default function ChartComponent() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const { pair, interval, signals } = useTradingStore();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#374151', style: 1 },
        horzLines: { color: '#374151', style: 1 },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    seriesRef.current = candlestickSeries;

    // Fetch initial historical data using Binance REST API (Limit 1000 candles)
    fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=1000`)
      .then((res) => res.json())
      .then((data) => {
        const cdata = data.map((d: any) => ({
          time: (d[0] / 1000) as UTCTimestamp,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));
        candlestickSeries.setData(cdata);
      })
      .catch(err => console.error("Failed to fetch historical data", err));

    // Convert interval for WS (e.g. 1d -> 1d)
    const wsInterval = interval.toLowerCase();
    const wsPair = pair.toLowerCase();
    
    // Connect to Binance WebSocket for real-time updates
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${wsPair}@kline_${wsInterval}`);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const kline = message.k;
      if (seriesRef.current) {
        seriesRef.current.update({
          time: (kline.t / 1000) as UTCTimestamp,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
        });
      }
    };

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      chart.remove();
    };
  }, [pair, interval]); // Re-run effect when pair or interval changes

  // Update Markers when signals change
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setMarkers(signals);
    }
  }, [signals]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
