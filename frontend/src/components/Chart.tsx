'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp, LogicalRange, HistogramData, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import { useTradingStore, IndicatorConfig } from '@/store/useStore';
import { INDICATOR_REGISTRY, IndicatorDef } from '@/lib/indicatorsRegistry';
import DrawingToolbar from './DrawingToolbar';
import { DrawingManager, getToolRegistry, TOOL_DEFINITIONS } from 'lightweight-charts-drawing';

// Initialize the drawing tool registry once (global, runs once)
const registry = getToolRegistry();
TOOL_DEFINITIONS.forEach(def => registry.register(def));

// Factory for importing saved drawings from DB
const drawingFactory = (type: string, data: any) => {
  const entry = registry.get(type);
  if (entry) {
    return entry.factory(data.id, data.anchors, data.style, data.options);
  }
  return null;
};

// Generate unique drawing IDs
let drawingCounter = 0;
const genDrawingId = (type: string) => `${type}-${Date.now()}-${++drawingCounter}`;

type KlineData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Anchor = {
  time: any;
  price: number;
};

export default function ChartComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [pendingClickCount, setPendingClickCount] = useState(0);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const indicatorsSeriesRef = useRef<{ [id: string]: ISeriesApi<any> }>({});
  
  const [chartData, setChartData] = useState<KlineData[]>([]);
  const chartDataRef = useRef<KlineData[]>([]);
  const isLoadingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Refs for drawing FSM — avoids stale closures in chart.subscribeClick
  const activeToolRef = useRef<string | null>(null);
  const pendingAnchorsRef = useRef<Anchor[]>([]);
  const requiredAnchorsRef = useRef<number>(2);
  const previewDrawingIdRef = useRef<string | null>(null);
  const saveDrawingsRef = useRef<(() => void) | null>(null);

  const { pair, interval, signals, indicators, token } = useTradingStore((state) => state);

  const fetchKlines = async (endTime?: number) => {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=1000${endTime ? `&endTime=${endTime}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      
      const formattedData = data.map((d: any) => ({
        time: (d[0] / 1000) as UTCTimestamp,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      if (!endTime && formattedData.length > 0) {
        const value = parseInt(interval);
        const unit = interval.slice(-1);
        let intervalSeconds = 60;
        if (unit === 'm') intervalSeconds = value * 60;
        else if (unit === 'h') intervalSeconds = value * 3600;
        else if (unit === 'd') intervalSeconds = value * 86400;
        else if (unit === 'w') intervalSeconds = value * 604800;
        else if (unit === 'M') intervalSeconds = value * 2592000;

        const lastTime = formattedData[formattedData.length - 1].time;
        const futureData = [];
        for (let i = 1; i <= 150; i++) {
          futureData.push({ time: (lastTime + i * intervalSeconds) as UTCTimestamp });
        }
        return [...formattedData, ...futureData];
      }
      return formattedData;
    } catch (err) {
      console.error("Failed to fetch klines", err);
      return [];
    }
  };

  // 1. Setup Chart and Handle Infinite Scroll
  useEffect(() => {
    let isMounted = true;
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
        mouseWheel: false,
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

    chartRef.current = chart;
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: '#10b981',
      priceLineWidth: 1,
      priceLineStyle: 3,
    });
    seriesRef.current = candlestickSeries;

    // Initialize Drawing Manager
    const manager = new DrawingManager();
    manager.attach(chart, candlestickSeries, chartContainerRef.current);
    drawingManagerRef.current = manager;

    let saveTimeout: NodeJS.Timeout;
    const saveDrawings = () => {
      if (token) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          if (!drawingManagerRef.current || previewDrawingIdRef.current) return;
          const drawingsJson = manager.exportDrawings();
          const host = window.location.hostname;
          const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
          fetch(`${API_URL}/api/drawings/${pair}?interval=${interval}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data: drawingsJson })
          }).catch(() => {});
        }, 2000);
      }
    };
    saveDrawingsRef.current = saveDrawings;

    manager.on('drawing:added', saveDrawings);
    manager.on('drawing:updated', saveDrawings);
    manager.on('drawing:removed', saveDrawings);
    manager.on('drawing:cleared', saveDrawings);

    // =========================================================
    // CUSTOM INTERACTIVE DRAWING CREATION VIA subscribeClick
    // =========================================================
    const handleChartClick = (param: any) => {
      const toolType = activeToolRef.current;
      if (!toolType || !param.point || !param.time) return;

      const price = candlestickSeries.coordinateToPrice(param.point.y);
      if (price === null) return;

      const required = requiredAnchorsRef.current;
      const entry = registry.get(toolType);
      if (!entry) return;

      if (required === 1) {
        // For 1-anchor tools (like horizontal line), create and finish immediately
        const anchor: Anchor = { time: param.time, price };
        const drawing = entry.factory(genDrawingId(toolType), [anchor], {}, {});
        if (drawing && drawingManagerRef.current) {
          drawingManagerRef.current.addDrawing(drawing);
          saveDrawingsRef.current?.();
        }
        activeToolRef.current = null;
        setActiveTool(null);
        chart.applyOptions({ handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true } });
        return;
      }

      // For multi-anchor tools
      const anchor: Anchor = { time: param.time, price };
      const newAnchors = [...pendingAnchorsRef.current, anchor];
      pendingAnchorsRef.current = newAnchors;
      setPendingClickCount(newAnchors.length);

      if (newAnchors.length === 1) {
        // First click: Create a preview drawing with duplicated anchors
        const previewAnchors = [anchor, anchor];
        const drawing = entry.factory(genDrawingId(toolType), previewAnchors, {}, {});
        if (drawing && drawingManagerRef.current) {
          previewDrawingIdRef.current = drawing.id;
          drawingManagerRef.current.addDrawing(drawing); // This renders the preview
        }
      } else if (newAnchors.length >= required) {
        // Final click: finalize the preview drawing
        if (previewDrawingIdRef.current && drawingManagerRef.current) {
          const drawing = drawingManagerRef.current.getDrawing(previewDrawingIdRef.current);
          if (drawing) {
            drawing.updateAnchor(required - 1, anchor);
          }
        }
        
        // Reset FSM
        previewDrawingIdRef.current = null;
        pendingAnchorsRef.current = [];
        setPendingClickCount(0);
        activeToolRef.current = null;
        setActiveTool(null);
        chart.applyOptions({ handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true } });
        saveDrawingsRef.current?.();
      }
    };

    chart.subscribeClick(handleChartClick);

    // =========================================================
    // HOVER PREVIEW FOR DRAWINGS
    // =========================================================
    let rafId: number | null = null;
    const handleCrosshairMove = (param: any) => {
      if (!activeToolRef.current || !previewDrawingIdRef.current || !param.point || !param.time) return;
      const price = candlestickSeries.coordinateToPrice(param.point.y);
      if (price === null || !drawingManagerRef.current) return;

      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (drawingManagerRef.current && previewDrawingIdRef.current) {
          const drawing = drawingManagerRef.current.getDrawing(previewDrawingIdRef.current);
          if (drawing) {
            const required = requiredAnchorsRef.current;
            drawing.updateAnchor(required - 1, { time: param.time, price });
          }
        }
        rafId = null;
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // =========================================================
    // FIX PANNING WHEN DRAGGING DRAWING ANCHORS
    // =========================================================
    const handleContainerMouseDown = (e: MouseEvent) => {
      if (!drawingManagerRef.current || !chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const pixelPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      
      // If we hit a drawing anchor, disable chart scrolling so lightweight-charts doesn't pan
      const hitAnchor = drawingManagerRef.current.hitTestAnchor(pixelPoint);
      if (hitAnchor) {
        chart.applyOptions({ handleScroll: { pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false } });
        
        // Re-enable scroll when mouse is released
        const handleMouseUp = () => {
          chart.applyOptions({ handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true } });
          window.removeEventListener('mouseup', handleMouseUp);
        };
        window.addEventListener('mouseup', handleMouseUp);
      } else {
        // Hit test body
        const hitBody = drawingManagerRef.current.hitTest(pixelPoint);
        if (hitBody && hitBody.id) {
          const drawing = drawingManagerRef.current.getDrawing(hitBody.id);
          if (drawing) {
            chart.applyOptions({ handleScroll: { pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false } });
            
            const initialMouseX = pixelPoint.x;
            const initialMouseY = pixelPoint.y;
            // clone anchors
            const initialAnchors = JSON.parse(JSON.stringify(drawing.anchors));
            
            const handleBodyMouseMove = (moveEvent: MouseEvent) => {
              if (!chartContainerRef.current) return;
              const currentPoint = { x: moveEvent.clientX - rect.left, y: moveEvent.clientY - rect.top };
              const dx = currentPoint.x - initialMouseX;
              const dy = currentPoint.y - initialMouseY;
              
              const newAnchors = initialAnchors.map((anchor: any) => {
                const origX = chart.timeScale().timeToCoordinate(anchor.time);
                const origY = candlestickSeries.priceToCoordinate(anchor.price);
                if (origX !== null && origY !== null) {
                   const newTime = chart.timeScale().coordinateToTime(origX + dx);
                   const newPrice = candlestickSeries.coordinateToPrice(origY + dy);
                   if (newTime !== null && newPrice !== null) {
                     return { time: newTime, price: newPrice };
                   }
                }
                return anchor;
              });
              
              newAnchors.forEach((a: any, i: number) => {
                 drawing.updateAnchor(i, a);
              });
            };
            
            const handleBodyMouseUp = () => {
              chart.applyOptions({ handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true } });
              window.removeEventListener('mousemove', handleBodyMouseMove);
              window.removeEventListener('mouseup', handleBodyMouseUp);
              saveDrawingsRef.current?.();
            };
            
            window.addEventListener('mousemove', handleBodyMouseMove);
            window.addEventListener('mouseup', handleBodyMouseUp);
          }
        }
      }
    };
    const containerEl = chartContainerRef.current;
    containerEl?.addEventListener('mousedown', handleContainerMouseDown);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Load initial data
    isInitialLoadRef.current = true;
    
    // Fetch drawings from DB
    if (token) {
      const host = window.location.hostname;
      const API_URL = process.env.NEXT_PUBLIC_API_URL || `http://${host}:8000`;
      fetch(`${API_URL}/api/drawings/${pair}?interval=${interval}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.data && Array.isArray(data.data) && data.data.length > 0 && drawingManagerRef.current) {
          drawingManagerRef.current.clearAll();
          drawingManagerRef.current.importDrawings(data.data, drawingFactory);
        }
      })
      .catch(() => {});
    }

    fetchKlines().then(data => {
      if (!isMounted) return;
      chartDataRef.current = data;
      setChartData(data);
      candlestickSeries.setData(data);
      isInitialLoadRef.current = false;
    });

    // Handle visible range change for pagination
    const onVisibleLogicalRangeChanged = async (logicalRange: LogicalRange | null) => {
      if (!logicalRange || isInitialLoadRef.current || isLoadingRef.current) return;
      
      if (logicalRange.from < 50) {
        if (chartDataRef.current.length === 0) return;
        
        isLoadingRef.current = true;
        const oldestTime = (chartDataRef.current[0].time as number) * 1000;
        
        fetchKlines(oldestTime - 1).then(olderData => {
          if (!isMounted) return;
          if (olderData.length > 0) {
            setChartData(prevData => {
              const filteredOlder = olderData.filter((d: KlineData) => d.time < prevData[0].time);
              if (filteredOlder.length === 0) return prevData;
              
              const newData = [...filteredOlder, ...prevData];
              newData.sort((a, b) => (a.time as number) - (b.time as number));
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
      containerEl?.removeEventListener('mousedown', handleContainerMouseDown);
      window.removeEventListener('resize', handleResize);
      isMounted = false;
      chart.unsubscribeClick(handleChartClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (drawingManagerRef.current) {
        drawingManagerRef.current.detach();
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChanged);
      chart.remove();
      // saveTimeout is handled via ref if needed, or we just let it fire since we have no access to it directly
    };
  }, [pair, interval, token]); // re-run effect when pair or interval changes

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
    
    Object.values(indicatorsSeriesRef.current).forEach(series => {
      if (series && chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {}
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

    const oscHeight = 0.15;
    const bottomMargin = totalOscillators > 0 ? (totalOscillators * oscHeight + 0.05) : 0.1;
    
    chartRef.current.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: bottomMargin > 0.8 ? 0.8 : bottomMargin,
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
        botMargin = 1 - topMargin - oscHeight + 0.02;
        oscIndex++;
      }

      def.lines.forEach(lineDef => {
        let series: ISeriesApi<any>;
        const color = lineDef.colorParam && ind.params[lineDef.colorParam] ? ind.params[lineDef.colorParam] : lineDef.defaultColor || '#ffffff';
        
        if (lineDef.type === 'histogram') {
          series = chartRef.current!.addSeries(HistogramSeries, { priceScaleId });
        } else {
          series = chartRef.current!.addSeries(LineSeries, { color, lineWidth: 2, priceScaleId });
        }
        
        indicatorsSeriesRef.current[`${ind.instanceId}_${lineDef.id}`] = series;

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

  // Tool selection handler — updates both state and ref (ref is used in subscribeClick closure)
  const handleSelectTool = useCallback((tool: string | null) => {
    // Reset any pending drawing when switching tools
    pendingAnchorsRef.current = [];
    setPendingClickCount(0);
    activeToolRef.current = tool;
    setActiveTool(tool);

    // Look up required anchor count from registry
    if (tool) {
      const entry = registry.get(tool);
      requiredAnchorsRef.current = entry?.requiredAnchors ?? 2;
    }

    // Disable chart scroll when a drawing tool is active
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

  // Required anchors for the current tool (for UI hint)
  const requiredForCurrentTool = activeTool ? (registry.get(activeTool)?.requiredAnchors ?? 2) : 0;

  return (
    <div className="relative w-full h-full flex overflow-hidden group">
      {isLoading && (
        <div className="absolute top-4 right-4 glass-panel px-3 py-1.5 rounded-xl text-xs text-slate-300 font-medium z-20">
          Loading...
        </div>
      )}

      {/* Drawing mode hint */}
      {activeTool && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-xl text-xs text-amber-300 font-medium z-20 border border-amber-500/30 flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
          Click {requiredForCurrentTool - pendingClickCount} more point{requiredForCurrentTool - pendingClickCount !== 1 ? 's' : ''} to draw
          {pendingClickCount > 0 && <span className="text-amber-400/70"> ({pendingClickCount}/{requiredForCurrentTool})</span>}
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
