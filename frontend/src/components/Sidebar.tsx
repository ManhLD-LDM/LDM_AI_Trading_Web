'use client';
import { useEffect, useState, useRef } from 'react';

type AIEvent = {
  type: string;
  agent_name: string;
  thought: string;
  timestamp?: string;
};

export default function Sidebar() {
  const [events, setEvents] = useState<AIEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to backend WebSocket
    const ws = new WebSocket('ws://127.0.0.1:8000/ws');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ai_log') {
          const timestamp = new Date().toLocaleTimeString();
          setEvents(prev => [...prev, { ...data, timestamp }]);
        }
      } catch (e) {
        console.error("Failed to parse ws message", e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getAgentColor = (name: string) => {
    if (name.includes('Kronos')) return 'text-emerald-400 bg-emerald-400/10';
    if (name.includes('Tech')) return 'text-blue-400 bg-blue-400/10';
    if (name.includes('Sentiment')) return 'text-purple-400 bg-purple-400/10';
    if (name.includes('Trader')) return 'text-indigo-400 bg-indigo-400/10';
    return 'text-slate-400 bg-slate-400/10';
  };

  return (
    <div className="w-80 h-full flex flex-col bg-slate-900/50 backdrop-blur-md border-l border-slate-800 p-4 shrink-0">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
        AI Thought Stream
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </h2>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {events.length === 0 ? (
          <div className="text-sm text-slate-500 italic text-center mt-10">
            Waiting for AI analysis...
          </div>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="bg-slate-800/60 p-3 rounded-lg border border-slate-700 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-1 rounded ${getAgentColor(ev.agent_name)}`}>
                  {ev.agent_name}
                </span>
                <span className="text-xs text-slate-400">{ev.timestamp}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed break-words">
                {ev.thought}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Bot Configuration</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Pair</span>
            <span className="text-white">BTCUSDT</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Backend</span>
            <span className="text-emerald-400">ws://localhost:8000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
