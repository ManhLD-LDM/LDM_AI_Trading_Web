'use client';
import { useEffect, useState, useRef } from 'react';
import { useTradingStore } from '@/store/useStore';
import { UTCTimestamp } from 'lightweight-charts';

type AIEvent = {
  type: string;
  agent_name: string;
  thought: string;
  timestamp?: string;
  action?: string;
  price?: number;
  ts?: number; // unix timestamp from backend
};

export default function Sidebar() {
  const [events, setEvents] = useState<AIEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { pair, interval, addSignal } = useTradingStore();

  useEffect(() => {
    // Connect to backend WebSocket
    const host = window.location.hostname;
    const ws = new WebSocket(`ws://${host}:8000/ws`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ai_log') {
          const timestamp = new Date().toLocaleTimeString();
          setEvents(prev => [...prev, { ...data, timestamp }]);
          
          // Add marker to chart if Trader Agent made a decision
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

    return () => {
      ws.close();
    };
  }, [addSignal]);

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
    <div className="w-80 h-full flex flex-col glass-panel border-l border-white/5 p-6 shrink-0 z-20">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-100 mb-8 flex items-center justify-between">
        AI Intelligence
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
      </h2>
      
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
            <span className="text-slate-400">Timeframe</span>
            <span className="text-slate-200 font-medium">{interval}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Connection</span>
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Secure
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
