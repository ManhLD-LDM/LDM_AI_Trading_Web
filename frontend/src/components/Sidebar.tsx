'use client';
import { useEffect, useState, useRef } from 'react';
import { useTradingStore } from '@/store/useStore';
import { UTCTimestamp } from 'lightweight-charts';

import { X } from 'lucide-react';

type AIEvent = {
  type: string;
  agent_name: string;
  thought: string;
  timestamp?: string;
  action?: string;
  price?: number;
  ts?: number; // unix timestamp from backend
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const [events, setEvents] = useState<AIEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { pair, interval, addSignal, token } = useTradingStore();

  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;
    let isDestroyed = false;

    const connect = () => {
      if (isDestroyed) return;
      const host = window.location.hostname;
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://${host}:8000/ws`;
      ws = new WebSocket(wsUrl); // No token in URL
      setConnectionStatus('connecting');

      ws.onopen = () => {
        // Send auth message immediately after connect
        ws!.send(JSON.stringify({ type: 'auth', token }));
        setConnectionStatus('connected');
        // Ping every 30s to keep connection alive
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong') return; // Ignore ping responses
          if (data.type === 'ai_log') {
            const timestamp = new Date().toLocaleTimeString();
            setEvents(prev => [...prev.slice(-200), { ...data, timestamp }]);
            
            if (data.agent_name === 'Trader Agent' && data.action && data.action !== 'HOLD') {
              addSignal({
                time: (data.timestamp || (new Date().getTime() / 1000)) as UTCTimestamp,
                position: data.action === 'BUY' ? 'belowBar' : 'aboveBar',
                color: data.action === 'BUY' ? '#10b981' : '#ef4444',
                shape: data.action === 'BUY' ? 'arrowUp' : 'arrowDown',
                text: `${data.action} @ ${data.price || ''}`,
              });
            }
          }
        } catch (e) {
          console.error("Failed to parse ws message", e);
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        setConnectionStatus('disconnected');
        if (!isDestroyed) {
          reconnectTimer = setTimeout(connect, 3000); // Auto-reconnect after 3s
        }
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      isDestroyed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [token, addSignal]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getAgentColor = (name: string) => {
    if (name.includes('Kronos')) return { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30' };
    if (name.includes('Tech')) return { text: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' };
    if (name.includes('Sentiment')) return { text: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/30' };
    if (name.includes('Trader')) return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };
    return { text: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/30' };
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <div className={`
        ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        fixed md:static inset-y-0 right-0
        w-80 h-full flex flex-col glass-panel border-l border-white/5 p-6 shrink-0 z-50 md:z-20
        transition-transform duration-300 ease-in-out
      `}>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-100 flex items-center">
            AI Intelligence
            <span className="flex h-2 w-2 relative ml-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          </h2>
          {/* Close button for mobile */}
          <button 
            onClick={onClose}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative pl-2">
        {events.length === 0 ? (
          <div className="text-xs text-slate-500 italic text-center mt-10">
            Awaiting analysis...
          </div>
        ) : (
          <div className="space-y-0">
            {events.map((ev, i) => {
              const colors = getAgentColor(ev.agent_name);
              const isLast = i === events.length - 1;
              return (
                <div key={i} className={`relative pl-6 ${isLast ? 'pb-2' : 'pb-6 border-l border-white/5'} animate-in fade-in slide-in-from-right-4 duration-300`}>
                  {/* Timeline Dot */}
                  <div className={`absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full ${colors.bg} border ${colors.border}`}></div>
                  
                  <div className="flex items-center justify-between mb-1.5 -mt-1">
                    <span className={`text-[10px] font-bold tracking-wider uppercase ${colors.text}`}>
                      {ev.agent_name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{ev.timestamp}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed break-words font-light">
                    {ev.thought}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">System Status</h3>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Target Pair</span>
            <span className="text-slate-200 font-medium">{pair}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Active Brain</span>
            <span className="text-amber-400 font-medium">{['PAXGUSDT'].includes(pair) ? 'Commodities' : 'Crypto'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Timeframe</span>
            <span className="text-slate-200 font-medium">{interval}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Connection</span>
            <span className={`font-medium flex items-center gap-1.5 ${
              connectionStatus === 'connected' ? 'text-emerald-400' :
              connectionStatus === 'connecting' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === 'connected' ? 'bg-emerald-500' :
                connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
              }`} />
              {connectionStatus === 'connected' ? 'Secure' :
               connectionStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
