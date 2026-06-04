import React from 'react';
import { 
  MousePointer2, 
  Minus, 
  Square, 
  Type, 
  Paintbrush, 
  Trash2, 
  XSquare,
  Activity
} from 'lucide-react';

interface DrawingToolbarProps {
  activeTool: string | null;
  onSelectTool: (tool: string | null) => void;
  onClearAll: () => void;
  onDeleteSelected: () => void;
}

const TOOLS = [
  { id: null, icon: MousePointer2, tooltip: 'Select / Move' },
  { id: 'trend-line', icon: Minus, tooltip: 'Trend Line', rotate: -45 },
  { id: 'horizontal-line', icon: Minus, tooltip: 'Horizontal Line' },
  { id: 'fib-retracement', icon: Activity, tooltip: 'Fibonacci Retracement' },
  { id: 'rectangle', icon: Square, tooltip: 'Rectangle' },
  { id: 'text-annotation', icon: Type, tooltip: 'Text' },
  { id: 'brush', icon: Paintbrush, tooltip: 'Brush' },
];

export default function DrawingToolbar({ activeTool, onSelectTool, onClearAll, onDeleteSelected }: DrawingToolbarProps) {
  return (
    <div className="flex flex-col gap-1 bg-slate-900 border-r border-slate-800 p-1 shrink-0 overflow-y-auto z-10 w-[42px] items-center">
      {TOOLS.map((tool, idx) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={idx}
            title={tool.tooltip}
            onClick={() => onSelectTool(tool.id)}
            className={`p-2 rounded-md transition-colors flex items-center justify-center ${
              isActive 
                ? 'bg-indigo-500/20 text-indigo-400' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Icon size={18} style={tool.rotate ? { transform: `rotate(${tool.rotate}deg)` } : {}} />
          </button>
        );
      })}

      <div className="h-px w-full bg-slate-700/50 my-1" />

      <button
        title="Delete Selected"
        onClick={onDeleteSelected}
        className="p-2 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center justify-center"
      >
        <Trash2 size={18} />
      </button>
      
      <button
        title="Clear All Drawings"
        onClick={onClearAll}
        className="p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-center"
      >
        <XSquare size={18} />
      </button>
    </div>
  );
}
