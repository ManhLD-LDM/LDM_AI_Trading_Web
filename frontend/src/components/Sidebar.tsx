'use client';
import { useEffect, useState, useRef } from 'react';
import { useTradingStore } from '@/store/useStore';
import { UTCTimestamp } from 'lightweight-charts';
import { getWsUrl } from '@/lib/api';
import { X, Sparkles, Activity } from 'lucide-react';

type AIEvent = {
  type: string;
  agent_name: string;
  thought: string;
  timestamp?: string;
  action?: string;
  price?: number;
  ts?: number;
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
      const wsUrl = getWsUrl();
      ws = new WebSocket(wsUrl);
      setConnectionStatus('connecting');

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: 'auth', token }));
        setConnectionStatus('connected');
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong') return;
          if (data.type === 'ai_log') {
            const timestamp = new Date().toLocaleTimeString();
            setEvents(prev => [...prev.slice(-200), { ...data, timestamp }]);
            
            if (data.agent_name === 'Trader Agent' && data.action && data.action !== 'HOLD') {
              addSignal({
                time: (data.timestamp || (new Date().getTime() / 1000)) as UTCTimestamp,
                position: data.action === 'BUY' ? 'belowBar' : 'aboveBar',
                color: data.action === 'BUY' ? '#10b981' : '#f43f5e',
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
          reconnectTimer = setTimeout(connect, 3000);
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
    if (name.includes('Sentiment')) return { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30' };
    if (name.includes('Trader')) return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };
    return { text: 'text-zinc-400', bg: 'bg-zinc-400/10', border: 'border-zinc-400/30' };
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <div className={`
        ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        fixed md:static inset-y-0 right-0
        w-80 h-full flex flex-col bg-zinc-900/90 border-l border-zinc-800 p-5 shrink-0 z-50 md:z-20 font-sans text-zinc-100
        transition-transform duration-300 ease-in-out
      `}>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
            <Sparkles size={14} />
            <span>AI Realtime Log</span>
            <span className="flex h-2 w-2 relative ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h2>
          {/* Close button for mobile */}
          <button 
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-95 transition-all"
          >
            <X size={18} />
          </button>
        </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 custom-scrollbar relative pl-1 space-y-4">
        {events.length === 0 ? (
          <div className="text-xs text-zinc-500 italic text-center py-10">
            Đang chờ phân tích AI...
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev, i) => {
              const colors = getAgentColor(ev.agent_name);
              return (
                <div key={i} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase ${colors.text}`}>
                      {ev.agent_name}
                    </span>
                    <span className="text-[10px] text-zinc-500">{ev.timestamp}</span>
                  </div>
                  <p className="text-xs font-sans text-zinc-300 leading-relaxed font-light">
                    {ev.thought}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2.5 font-mono text-xs">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2 flex items-center gap-1.5">
          <Activity size={12} /> Trạng thái Hệ thống
        </h3>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Cặp giao dịch:</span>
          <span className="text-zinc-200 font-bold">{pair}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Khung thời gian:</span>
          <span className="text-zinc-200 font-bold">{interval}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Kết nối Socket:</span>
          <span className={`font-bold flex items-center gap-1.5 ${
            connectionStatus === 'connected' ? 'text-emerald-400' :
            connectionStatus === 'connecting' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-emerald-500' :
              connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
            }`} />
            {connectionStatus === 'connected' ? 'Bảo mật' :
             connectionStatus === 'connecting' ? 'Đang kết nối...' : 'Mất kết nối'}
          </span>
        </div>
      </div>
    </div>
    </>
  );
}
