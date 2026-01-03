
import React from 'react';
import { CanvasLayer } from '../types';

interface LayerPanelProps {
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({ layers, selectedLayerId, onSelect, onReorder }) => {
  if (layers.length === 0) return null;

  return (
    <div className="w-full md:w-48 flex-shrink-0 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[400px]">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Layers</h3>
        <span className="text-[10px] text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">{layers.length}</span>
      </div>
      <div className="overflow-y-auto p-2 space-y-2 flex-1">
        {[...layers].reverse().map((layer, index) => (
          <div 
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 group transition-colors ${selectedLayerId === layer.id ? 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
          >
            <img src={layer.url} className="w-8 h-8 rounded bg-white object-cover shadow-sm" alt="Thumbnail" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold truncate">Layer {layers.length - index}</div>
            </div>
            {selectedLayerId === layer.id && (
              <div className="flex flex-col gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'up'); }}
                    className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-[8px] transition-colors"
                  >▲</button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'down'); }}
                    className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-[8px] transition-colors"
                  >▼</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayerPanel;
