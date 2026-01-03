
import { useState, useCallback } from 'react';
import { CanvasLayer } from '../types';

const HISTORY_LIMIT = 15;

export const useCanvasHistory = () => {
  const [history, setHistory] = useState<CanvasLayer[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasLayer[][]>([]);

  const recordState = useCallback((layers: CanvasLayer[]) => {
    setHistory(prev => {
      const newHistory = [...prev, layers];
      if (newHistory.length > HISTORY_LIMIT) {
        newHistory.shift();
      }
      return newHistory;
    });
    setRedoStack([]); // Clear redo stack on new action
  }, []);

  const undo = useCallback((currentLayers: CanvasLayer[]) => {
    if (history.length === 0) return null;
    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    
    setRedoStack(prev => [...prev, currentLayers]);
    setHistory(newHistory);
    return previous;
  }, [history]);

  const redo = useCallback((currentLayers: CanvasLayer[]) => {
    if (redoStack.length === 0) return null;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);

    setHistory(prev => [...prev, currentLayers]);
    setRedoStack(newRedo);
    return next;
  }, [redoStack]);

  return {
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
    recordState,
    undo,
    redo,
    historyLength: history.length,
    redoLength: redoStack.length
  };
};
