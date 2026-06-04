'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, LogicalRange, HistogramData, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import { useTradingStore, IndicatorConfig } from '@/store/useStore';
import { INDICATOR_REGISTRY, IndicatorDef } from '@/lib/indicatorsRegistry';
import DrawingToolbar from './DrawingToolbar';
import { DrawingManager, getToolRegistry } from 'lightweight-charts-drawing';

const drawingFactory = (type: string, data: any) => {
  const registry = getToolRegistry();
  const entry = registry.get(type);
  if (entry) {
    return entry.factory(data.id, data.anchors, data.style, data.options);
  }
  return null;
};

type KlineData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function ChartComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const indicatorsSeriesRef = useRef<{ [id: string]: ISeriesApi<any> }>({});
  
  const [chartData, setChartData] = useState<KlineData[]>([]);
  const chartDataRef = useRef<KlineData[]>([]);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  const { pair, interval, signals, indicators, token } = useTradingStore();

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
      rightPriceScale: { borderColor: '#374151', autoScale: true },
      timeScale: { 
        borderColor: '#374151', 
        timeVisible: true, 
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: {
        mouseWheel: false, // Mouse wheel zooms instead of scrolling
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: true,
      },
      autoSize: true,
    });
    
    // Custom price scales are configured when indicators are active

    chartRef.current = chart;
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: '#10b981',
      priceLineWidth: 1,
      priceLineStyle: 3, // dashed
    });
    seriesRef.current = candlestickSeries;

    // Initialize Drawing Manager
    const manager = new DrawingManager();
    manager.attach(chart, candlestickSeries, chartContainerRef.current);
    drawingManagerRef.current = manager;

    // Listen to tool change
    manager.on('tool:changed', (event: any) => {
      setActiveTool(event.tool);
    });

    let saveTimeout: NodeJS.Timeout;
    const saveDrawings = () => {
      if (token) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          if (!drawingManagerRef.current) return;
          const drawingsJson = manager.exportDrawings();
          const host = window.location.hostname;
          const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
          fetch(`${API_URL}/api/drawings/${pair}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data: drawingsJson })
          }).catch(console.error);
        }, 2000);
      }
    };

    // Auto-save drawings
    manager.on('drawing:added', saveDrawings);
    manager.on('drawing:updated', saveDrawings);
    manager.on('drawing:removed', saveDrawings);
    manager.on('drawing:cleared', saveDrawings);

    // Load initial data
    isInitialLoadRef.current = true;
    
    // Fetch drawings from DB
    if (token) {
      const host = window.location.hostname;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
      fetch(`${API_URL}/api/drawings/${pair}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.data && Array.isArray(data.data) && drawingManagerRef.current) {
          // Temporarily clear old to load new
          drawingManagerRef.current.clearAll();
          drawingManagerRef.current.importDrawings(data.data, drawingFactory);
        }
      })
      .catch(() => {
        // Silently ignore fetch errors (e.g. VPN blocking port 8000 or CORS)
      });
    }

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
              const filteredOlder = olderData.filter((d: KlineData) => d.time < prevData[0].time);
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

    return () => {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.detach();
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
      chart.remove();
      clearTimeout(saveTimeout);
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
  const markersPluginRef = useRef<any>(null);
  useEffect(() => {
    if (seriesRef.current) {
      if (!markersPluginRef.current) {
        markersPluginRef.current = createSeriesMarkers(seriesRef.current);
      }
      markersPluginRef.current.setMarkers(signals);
    }
  }, [signals]);

  // 4. Handle Indicators
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;
    
    // Clean up existing indicator series
    Object.values(indicatorsSeriesRef.current).forEach(series => {
      if (series && chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {
          // Ignore harmless remove errors on unmount/re-render
        }
      }
    });
    indicatorsSeriesRef.current = {};

    const inputData = {
      time: chartData.map(d => d.time as number),
      open: chartData.map(d => d.open),
      high: chartData.map(d => d.high),
      low: chartData.map(d => d.low),
      close: chartData.map(d => d.close),
      volume: chartData.map(d => d.volume),
    };

    const activeIndicators = indicators.filter(ind => ind.active);
    const oscillators = activeIndicators.filter(ind => INDICATOR_REGISTRY.find((d: IndicatorDef) => d.id === ind.indicatorId)?.placement === 'oscillator');
    const totalOscillators = oscillators.length;

    // Adjust main chart margin based on oscillators
    const oscHeight = 0.15; // 15% of height per oscillator
    const bottomMargin = totalOscillators > 0 ? (totalOscillators * oscHeight + 0.05) : 0.1;
    
    chartRef.current.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: bottomMargin > 0.8 ? 0.8 : bottomMargin, // Cap at 80%
      },
    });

    let oscIndex = 0;

    activeIndicators.forEach(ind => {
      const def = INDICATOR_REGISTRY.find(d => d.id === ind.indicatorId);
      if (!def) return;

      const results = def.calculate(inputData, ind.params);
      
      let priceScaleId = 'right';
      let hasOscillator = false;
      let topMargin = 0;
      let botMargin = 0;

      if (def.placement === 'oscillator') {
        priceScaleId = `osc_${ind.instanceId}`;
        hasOscillator = true;
        topMargin = 1 - bottomMargin + (oscIndex * oscHeight);
        botMargin = 1 - topMargin - oscHeight + 0.02; // Small gap
        oscIndex++;
      }

      // Create series
      def.lines.forEach(lineDef => {
        let series: ISeriesApi<any>;
        const color = lineDef.colorParam && ind.params[lineDef.colorParam] ? ind.params[lineDef.colorParam] : lineDef.defaultColor || '#ffffff';
        
        if (lineDef.type === 'histogram') {
          series = chartRef.current!.addSeries(HistogramSeries, {
            priceScaleId,
          });
        } else {
          series = chartRef.current!.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceScaleId,
          });
        }
        
        indicatorsSeriesRef.current[`${ind.instanceId}_${lineDef.id}`] = series;

        // Map data
        const seriesData = results
          .filter(r => r[lineDef.id] !== undefined && r[lineDef.id] !== null && !Number.isNaN(r[lineDef.id]))
          .map(r => {
            if (lineDef.type === 'histogram' && def.id === 'macd') {
              const histColor = r[lineDef.id] > 0 ? '#26A69A' : '#EF5350';
              return { time: r.time, value: r[lineDef.id], color: histColor } as HistogramData;
            }
            return { time: r.time, value: r[lineDef.id] };
          });
          
        series.setData(seriesData);
      });

      if (hasOscillator) {
        chartRef.current!.priceScale(priceScaleId).applyOptions({
          visible: true,
          scaleMargins: {
            top: topMargin,
            bottom: botMargin > 0 ? botMargin : 0,
          }
        });
      }
    });

  }, [chartData, indicators]);

  const handleSelectTool = useCallback((tool: string | null) => {
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setActiveTool(tool);
      setActiveTool(tool);
      
      // Disable scrolling when a tool is active to allow drawing
      if (chartRef.current) {
        const isDrawing = tool !== null;
        chartRef.current.applyOptions({
          handleScroll: {
            pressedMouseMove: !isDrawing,
            horzTouchDrag: !isDrawing,
            vertTouchDrag: !isDrawing,
          }
        });
      }
    }
  }, []);

  const handleClearAll = useCallback(() => {
    if (drawingManagerRef.current) {
      drawingManagerRef.current.clearAll();
    }
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (drawingManagerRef.current) {
      const selectedId = drawingManagerRef.current.getSelectedDrawing()?.id;
      if (selectedId) {
        drawingManagerRef.current.removeDrawing(selectedId);
      }
    }
  }, []);

  return (
    <div className="relative w-full h-full flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden group">
      {isLoading && (
        <div className="absolute top-4 right-4 bg-slate-800/80 px-3 py-1.5 rounded text-xs text-slate-300 font-medium z-20">
          Loading...
        </div>
      )}
      
      <DrawingToolbar 
        activeTool={activeTool} 
        onSelectTool={handleSelectTool}
        onClearAll={handleClearAll}
        onDeleteSelected={handleDeleteSelected}
      />

      <div ref={chartContainerRef} className="flex-1 h-full min-w-0 relative" />
    </div>
  );
}
