
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppTheme, GeneratedImage, AppError, TabType, CanvasLayer } from './types';
import Navbar from './components/Navbar';
import LayerPanel from './components/LayerPanel';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { saveProject, loadProject } from './utils/projectManager';
import * as gemini from './services/geminiService';

// --- Constants ---
const CANVAS_SIZE = 600; // Logical working resolution
const MIN_VISIBLE_PX = 40; // Ensure at least 40px is always visible

type WorkflowStage = 'idle' | 'analyzing' | 'suggesting' | 'executing' | 'finished';

const PROCESSING_STEPS = {
  generate: ['Analyzing Prompt Semantics...', 'Consulting Art History Database...', 'Drafting Composition...', 'Synthesizing Textures...', 'Final Polish...'],
  edit: ['Scanning Composition...', 'Identifying Spatial Relations...', 'Blending Layers...', 'Harmonizing Lighting...', 'Final Render...'],
  clean: ['Detecting UI Elements...', 'Isolating Subject...', 'Reconstructing Background...', 'Removing Artifacts...', 'Pixel Peeping...'],
  '3d': ['Analyzing Geometry...', 'Calculating Light Physics...', 'Applying Materials...', 'Raytracing Shadows...', 'Rendering Final Pass...']
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [activeTab, setActiveTab] = useState<TabType>(TabType.GENERATE);
  
  // Inputs
  const [prompt, setPrompt] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  
  // Canvas State
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  // Custom Hook for History
  const { canUndo, canRedo, recordState, undo, redo } = useCanvasHistory();

  // Interaction State
  const [activeOperation, setActiveOperation] = useState<'none' | 'drag' | 'resize'>('none');
  const interactionStartRef = useRef<{ 
    startX: number; 
    startY: number; 
    initialX: number; 
    initialY: number;
    initialScale: number;
    initialDistance: number;
    initialLayers: CanvasLayer[]; // Snapshot for undo
  }>({ startX: 0, startY: 0, initialX: 0, initialY: 0, initialScale: 1, initialDistance: 0, initialLayers: [] });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Workflow State
  const [stage, setStage] = useState<WorkflowStage>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeTaskType, setActiveTaskType] = useState<'generate' | 'edit' | 'clean' | '3d'>('generate');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([]);
  const [isImproving, setIsImproving] = useState(false);
  
  const [error, setError] = useState<AppError | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);
  
  const executionRef = useRef<boolean>(false);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Step Animation Effect
  useEffect(() => {
    let interval: any;
    if (stage === 'executing') {
      const steps = PROCESSING_STEPS[activeTaskType];
      setCompletedSteps(new Array(steps.length).fill(false));
      setCurrentStepIndex(0);
      
      let step = 0;
      interval = setInterval(() => {
        if (step < steps.length - 1) {
          setCompletedSteps(prev => {
            const next = [...prev];
            next[step] = true;
            return next;
          });
          step++;
          setCurrentStepIndex(step);
        }
      }, 2500); // 2.5s per step visual
    }
    return () => clearInterval(interval);
  }, [stage, activeTaskType]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const generateError = (message: string, details?: string) => {
    const id = Math.random().toString(36).substr(2, 9).toUpperCase();
    setError({ id, message, details });
    setStage('idle');
    setTimeout(() => setError(null), 8000);
  };

  const handleImprovePrompt = async (target: 'main' | 'refine') => {
    const textToImprove = target === 'main' ? prompt : refinePrompt;
    if (!textToImprove.trim()) return;
    
    setIsImproving(true);
    try {
      const enhanced = await gemini.improvePrompt(textToImprove);
      if (target === 'main') setPrompt(enhanced);
      else setRefinePrompt(enhanced);
    } catch (err: any) {
      generateError("Failed to improve prompt", err.message);
    } finally {
      setIsImproving(false);
    }
  };

  // --- Project Management ---
  const handleSaveProject = () => {
    if (layers.length === 0) return;
    saveProject(layers);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    recordState(layers); // Save current state before loading
    loadProject(file)
      .then(loadedLayers => {
        setLayers(loadedLayers);
        if (loadedLayers.length > 0) setSelectedLayerId(loadedLayers[loadedLayers.length - 1].id);
        e.target.value = ''; // Reset input
      })
      .catch(err => generateError("Load Failed", err.message));
  };

  // --- Canvas Logic ---

  const handleUndo = () => {
    const prev = undo(layers);
    if (prev) {
        setLayers(prev);
        // Deselect if the selected layer no longer exists
        if (selectedLayerId && !prev.find(l => l.id === selectedLayerId)) {
            setSelectedLayerId(null);
        }
    }
  };

  const handleRedo = () => {
    const next = redo(layers);
    if (next) setLayers(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // Record state before adding files
      recordState(layers);
      
      const newFiles = Array.from(files) as File[];
      newFiles.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const img = new Image();
          img.src = reader.result as string;
          img.onload = () => {
            // Smart scaling to fit canvas initially
            const maxDim = 250;
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            
            // Random jitter to prevent perfect stacking
            const jitterX = (Math.random() - 0.5) * 40;
            const jitterY = (Math.random() - 0.5) * 40;

            const newId = Math.random().toString(36).substr(2, 9);
            
            setLayers(prev => [
              ...prev,
              {
                id: newId,
                url: reader.result as string,
                x: (CANVAS_SIZE / 2) - ((img.width * scale) / 2) + jitterX,
                y: (CANVAS_SIZE / 2) - ((img.height * scale) / 2) + jitterY,
                scale: scale,
                rotation: 0,
                zIndex: prev.length + 1,
                aspectRatio: img.width / img.height,
                originalWidth: img.width,
                originalHeight: img.height
              }
            ]);
            setSelectedLayerId(newId);
            setActiveTab(TabType.EDIT); 
          };
        };
        reader.readAsDataURL(file);
      });
    }
    e.target.value = '';
  };

  const getCanvasCoordinates = (e: React.PointerEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleLayerPointerDown = (e: React.PointerEvent, layer: CanvasLayer) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    
    setSelectedLayerId(layer.id);
    setActiveOperation('drag');
    
    interactionStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: layer.x,
      initialY: layer.y,
      initialScale: layer.scale,
      initialDistance: 0,
      initialLayers: layers // Save state at start of drag
    };
  };

  const handleResizePointerDown = (e: React.PointerEvent, layer: CanvasLayer) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);

    setSelectedLayerId(layer.id);
    setActiveOperation('resize');

    const coords = getCanvasCoordinates(e);
    // Calculate distance from the anchor point (top-left of layer) to the pointer
    const dx = coords.x - layer.x;
    const dy = coords.y - layer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    interactionStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: layer.x,
      initialY: layer.y,
      initialScale: layer.scale,
      initialDistance: dist,
      initialLayers: layers // Save state at start of resize
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (!selectedLayerId) return;

    if (activeOperation === 'drag') {
      e.preventDefault();
      const dx = e.clientX - interactionStartRef.current.startX;
      const dy = e.clientY - interactionStartRef.current.startY;
      
      setLayers(prev => prev.map(layer => {
        if (layer.id === selectedLayerId) {
          let newX = interactionStartRef.current.initialX + dx;
          let newY = interactionStartRef.current.initialY + dy;
          
          // Boundary Clamping
          const currentWidth = layer.originalWidth * layer.scale;
          const currentHeight = layer.originalHeight * layer.scale;

          const maxX = CANVAS_SIZE - MIN_VISIBLE_PX;
          const minX = MIN_VISIBLE_PX - currentWidth;
          newX = Math.max(minX, Math.min(newX, maxX));

          const maxY = CANVAS_SIZE - MIN_VISIBLE_PX;
          const minY = MIN_VISIBLE_PX - currentHeight;
          newY = Math.max(minY, Math.min(newY, maxY));

          return { 
            ...layer, 
            x: newX, 
            y: newY 
          };
        }
        return layer;
      }));
    } else if (activeOperation === 'resize') {
      e.preventDefault();
      const selectedLayer = layers.find(l => l.id === selectedLayerId);
      if (!selectedLayer) return;

      const coords = getCanvasCoordinates(e);
      const dx = coords.x - selectedLayer.x;
      const dy = coords.y - selectedLayer.y;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      if (interactionStartRef.current.initialDistance > 0) {
        const newScale = interactionStartRef.current.initialScale * (currentDistance / interactionStartRef.current.initialDistance);
        const safeScale = Math.max(0.1, newScale);
        
        setLayers(prev => prev.map(layer => {
          if (layer.id === selectedLayerId) {
            return { ...layer, scale: safeScale };
          }
          return layer;
        }));
      }
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (activeOperation !== 'none') {
        const initialLayers = interactionStartRef.current.initialLayers;
        // Simple check if state changed, if so, record the previous state for Undo
        if (initialLayers !== layers) {
             recordState(initialLayers);
        }
    }
    setActiveOperation('none');
  };

  const updateLayer = (id: string, updates: Partial<CanvasLayer>) => {
    // For specific UI controls (sliders), we update directly.
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const removeLayer = (id: string) => {
    recordState(layers);
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const reorderLayer = (id: string, direction: 'up' | 'down') => {
    recordState(layers);
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1) return prev;
      
      const newLayers = [...prev];
      if (direction === 'up' && index < newLayers.length - 1) {
        [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
      } else if (direction === 'down' && index > 0) {
        [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      }
      return newLayers.map((l, idx) => ({ ...l, zIndex: idx + 1 }));
    });
  };

  const centerLayer = (id: string) => {
     recordState(layers);
     const l = layers.find(l => l.id === id);
     if (l) {
        setLayers(prev => prev.map(layer => {
            if (layer.id === id) {
                return {
                    ...layer,
                    x: (CANVAS_SIZE / 2) - ((l.originalWidth * l.scale) / 2),
                    y: (CANVAS_SIZE / 2) - ((l.originalHeight * l.scale) / 2)
                };
            }
            return layer;
        }));
     }
  };

  // Compose canvas to a single image
  const renderCanvasToImage = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 1024);

    const sortedLayers = [...layers]; 

    for (const layer of sortedLayers) {
      const img = new Image();
      img.src = layer.url;
      await new Promise(r => img.onload = r);
      
      const ratio = 1024 / CANVAS_SIZE;
      
      ctx.save();
      ctx.translate(
        (layer.x + (layer.originalWidth * layer.scale) / 2) * ratio, 
        (layer.y + (layer.originalHeight * layer.scale) / 2) * ratio
      );
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(
        img, 
        (-layer.originalWidth * layer.scale * ratio) / 2, 
        (-layer.originalHeight * layer.scale * ratio) / 2, 
        layer.originalWidth * layer.scale * ratio, 
        layer.originalHeight * layer.scale * ratio
      );
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  };

  // --- Workflow Handlers ---

  const startWorkflow = async (taskType: 'generate' | 'edit' | 'clean' | '3d', initialPrompt: string = '', targetImage?: string) => {
    setActiveTaskType(taskType);
    setStage('analyzing');
    
    try {
      const suggestionsList = await gemini.generateCreativeSuggestions(
        initialPrompt || (targetImage ? 'Transform this image' : ''), 
        layers.length, 
        taskType
      );
      setSuggestions(suggestionsList);
      setStage('suggesting');
    } catch (err: any) {
      generateError("Analysis Failed", err.message);
    }
  };

  const executeTask = async (selectedSuggestion: string) => {
    setStage('executing');
    executionRef.current = true;
    
    try {
      let url = '';
      await new Promise(r => setTimeout(r, 1000));

      if (activeTaskType === 'generate') {
        url = await gemini.generateImage(selectedSuggestion);
      } 
      else if (activeTaskType === 'edit') {
        const compositeImage = await renderCanvasToImage();
        const imageData = { data: compositeImage, mimeType: 'image/png' };
        const instruction = selectedSuggestion;
        url = await gemini.editImage([imageData], instruction, false);
      }
      else if (activeTaskType === 'clean' || activeTaskType === '3d') {
        const target = lastResult || (layers.length > 0 ? await renderCanvasToImage() : null);
        if (!target) throw new Error("No source image found");
        const imageData = { data: target, mimeType: 'image/png' };
        url = await gemini.editImage([imageData], selectedSuggestion, true);
      }

      setLastResult(url);
      addToHistory(url, selectedSuggestion, activeTaskType === 'generate' ? 'generation' : 'edit');
      setStage('finished');
    } catch (err: any) {
      generateError("Execution Failed", err.message);
    } finally {
      executionRef.current = false;
    }
  };

  const handleDeepCleanStart = () => {
    if (layers.length > 0 || lastResult) {
      startWorkflow('clean', "Remove UI clutter and status bars", lastResult || layers[0].url);
    }
  };

  const handle3DStart = () => {
    if (layers.length > 0 || lastResult) {
      startWorkflow('3d', "Convert to 3D", lastResult || layers[0].url);
    }
  };

  const handleMainAction = () => {
    if (activeTab === TabType.GENERATE) {
      startWorkflow('generate', prompt);
    } else {
      startWorkflow('edit', prompt);
    }
  };

  const addToHistory = (url: string, p: string, type: 'generation' | 'edit') => {
    const newEntry: GeneratedImage = {
      id: Date.now().toString(),
      url,
      prompt: p,
      timestamp: Date.now(),
      type
    };
    setHistory(prev => [newEntry, ...prev]);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="min-h-screen flex flex-col font-sans relative overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className={`flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8 transition-opacity duration-500 ${stage !== 'idle' && stage !== 'finished' ? 'opacity-20 pointer-events-none filter blur-sm' : 'opacity-100'}`}>
        
        <section className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Create. <span className="text-primary-500">Edit.</span> Merge.
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-lg">
            High-fidelity visual AI. Arrange your assets, control the scene, and let Gemini render the reality.
          </p>
        </section>

        <div className="flex flex-col gap-8">
          <div className="flex justify-center">
            <div className="inline-flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl shadow-inner">
              {[
                { id: TabType.GENERATE, label: 'Generate', icon: 'M12 4v16m8-8H4' },
                { id: TabType.EDIT, label: 'Edit & Merge', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
                { id: TabType.HISTORY, label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab.id 
                      ? 'bg-white dark:bg-slate-900 shadow-md text-primary-600 scale-105' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {activeTab !== TabType.HISTORY && (
              <div className="space-y-6 animate-fadeIn">
                <div className="glass p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="p-2 bg-primary-100 dark:bg-primary-900/30 text-primary-600 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.3 1.047a1 1 0 01.897.95V4.2a.5.5 0 00.5.5h2.203a1 1 0 01.95.897L15.897 18H4.103L4.15 5.597a1 1 0 01.95-.897H7.3a.5.5 0 00.5-.5V1.997a1 1 0 01.897-.95L11.3 1.047zM10 11a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </span>
                    Composition Studio
                  </h2>

                  {activeTab === TabType.EDIT && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                         <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Visual Workspace</label>
                         
                         <div className="flex flex-wrap items-center gap-2">
                             {/* Undo/Redo */}
                             <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                               <button 
                                 onClick={handleUndo} 
                                 disabled={!canUndo}
                                 className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                 title="Undo"
                               >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                               </button>
                               <button 
                                 onClick={handleRedo} 
                                 disabled={!canRedo}
                                 className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                 title="Redo"
                               >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                               </button>
                             </div>

                             {/* Save/Load */}
                             <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                <label className="cursor-pointer p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all" title="Load Project">
                                   <input type="file" accept=".vmix" className="hidden" onChange={handleLoadProject} />
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                </label>
                                <button 
                                  onClick={handleSaveProject}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 transition-all"
                                  title="Save Project"
                                  disabled={layers.length === 0}
                                >
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                </button>
                             </div>

                             <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block"></div>

                             <label className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-primary-600 bg-primary-50 dark:bg-primary-900/10 px-3 py-1.5 rounded-full border-2 border-primary-600 hover:bg-primary-600 hover:text-white transition-all shadow-sm">
                                Add Asset
                                <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                             </label>
                         </div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-4">
                        <div 
                          ref={canvasRef}
                          className="relative w-full aspect-square bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-700 group touch-none"
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={handleCanvasPointerUp}
                          onPointerLeave={handleCanvasPointerUp}
                        >
                           <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #888 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                           
                           {layers.length === 0 && (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="text-xs font-bold uppercase tracking-widest">Drag & Drop Images Here</span>
                             </div>
                           )}

                           {layers.map(layer => (
                             <div
                               key={layer.id}
                               onPointerDown={(e) => handleLayerPointerDown(e, layer)}
                               style={{
                                 transform: `translate(${layer.x}px, ${layer.y}px) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
                                 width: layer.originalWidth,
                                 height: layer.originalHeight,
                                 position: 'absolute',
                                 zIndex: layer.zIndex,
                                 cursor: 'grab',
                                 transformOrigin: 'top left',
                               }}
                               className={`transition-shadow touch-none select-none`}
                             >
                               <img 
                                 src={layer.url} 
                                 alt="layer" 
                                 className="w-full h-full object-contain pointer-events-none select-none"
                                 draggable={false}
                               />
                               
                               {selectedLayerId === layer.id && (
                                 <>
                                   <div className="absolute inset-0 border-2 border-primary-500 pointer-events-none"></div>
                                   {/* Resize Handle (Bottom Right) */}
                                   <div
                                     onPointerDown={(e) => handleResizePointerDown(e, layer)}
                                     style={{ transform: `scale(${1 / layer.scale})` }}
                                     className="absolute -bottom-4 -right-4 w-10 h-10 bg-primary-500 rounded-full shadow-lg border-2 border-white cursor-nwse-resize touch-none flex items-center justify-center pointer-events-auto z-50 hover:scale-110 transition-transform"
                                   >
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v4h4m12-12v-4h-4" /></svg>
                                   </div>
                                 </>
                               )}
                             </div>
                           ))}
                        </div>

                        {/* Extracted Layer Panel Component */}
                        <LayerPanel 
                           layers={layers}
                           selectedLayerId={selectedLayerId}
                           onSelect={setSelectedLayerId}
                           onReorder={reorderLayer}
                        />
                      </div>

                      {selectedLayer && (
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg animate-fadeIn flex flex-wrap gap-4 items-center justify-between">
                           <div className="flex items-center gap-3">
                             <span className="text-xs font-bold text-slate-500 uppercase">Scale</span>
                             <input 
                               type="range" 
                               min="0.1" 
                               max="2" 
                               step="0.05" 
                               value={selectedLayer.scale}
                               onChange={(e) => updateLayer(selectedLayer.id, { scale: parseFloat(e.target.value) })}
                               className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                             />
                           </div>
                           <div className="flex items-center gap-3">
                             <span className="text-xs font-bold text-slate-500 uppercase">Rotate</span>
                             <input 
                               type="range" 
                               min="-180" 
                               max="180" 
                               step="5" 
                               value={selectedLayer.rotation}
                               onChange={(e) => updateLayer(selectedLayer.id, { rotation: parseInt(e.target.value) })}
                               className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                             />
                           </div>
                           <div className="flex gap-2">
                             <button 
                                onClick={() => centerLayer(selectedLayer.id)}
                                className="p-1.5 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg" 
                                title="Center on Canvas"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                             </button>
                             <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                             <button onClick={() => removeLayer(selectedLayer.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Remove Layer">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                           </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                        Instructions & Goals
                      </label>
                      <button 
                        onClick={() => handleImprovePrompt('main')}
                        disabled={isImproving || !prompt}
                        className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-primary-600 hover:text-primary-700 disabled:opacity-30 transition-all"
                      >
                         {isImproving ? "Thinking..." : "Auto-Enhance"}
                      </button>
                    </div>
                    <textarea 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={activeTab === TabType.GENERATE ? "Example: A floating crystalline engine, volumetric lighting, 8k..." : "Example: Merge these images into a cyberpunk street scene..."}
                      className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all min-h-[120px] resize-none shadow-inner"
                    />
                  </div>

                  <button 
                    onClick={handleMainAction}
                    disabled={!prompt || (activeTab === TabType.EDIT && layers.length === 0)}
                    className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 transform active:scale-95"
                  >
                     Begin Workflow
                  </button>
                </div>
              </div>
            )}

            {/* Output Panel */}
            {activeTab !== TabType.HISTORY && (
              <div className="space-y-6 animate-fadeIn">
                <div className="glass p-6 rounded-3xl border border-slate-200 dark:border-slate-800 h-full flex flex-col min-h-[450px] shadow-2xl overflow-hidden">
                   <h2 className="text-xl font-bold flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">Final Output</div>
                      {lastResult && <a href={lastResult} download="image.png" className="text-xs uppercase font-bold text-primary-600">Download</a>}
                   </h2>

                   <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-3xl relative overflow-hidden group min-h-[300px] border-2 border-slate-200 dark:border-slate-800 shadow-inner">
                      {lastResult ? (
                        <img src={lastResult} alt="Result" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-slate-400 font-black uppercase tracking-widest text-xs">Ready for input</div>
                      )}
                   </div>
                   
                   {lastResult && (
                      <div className="mt-8 space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-4">
                           <button onClick={() => handleDeepCleanStart()} className="py-4 bg-slate-100 dark:bg-slate-800 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-primary-500 hover:text-white transition-colors">Strip Clutter</button>
                           <button onClick={() => handle3DStart()} className="py-4 bg-slate-100 dark:bg-slate-800 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-500 hover:text-white transition-colors">Make 3D</button>
                        </div>
                      </div>
                   )}
                </div>
              </div>
            )}
            
            {/* History Tab */}
            {activeTab === TabType.HISTORY && (
               <div className="lg:col-span-2 space-y-6 animate-fadeIn">
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                   {history.map((item) => (
                     <div 
                       key={item.id} 
                       className="glass p-3 rounded-3xl border border-slate-200 dark:border-slate-800 group relative cursor-pointer overflow-hidden shadow-lg hover:shadow-2xl transition-all"
                       onClick={() => {
                         setLastResult(item.url);
                         setActiveTab(TabType.EDIT);
                       }}
                     >
                       <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 shadow-inner">
                         <img src={item.url} alt={item.prompt} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                       </div>
                       <div className="mt-3 px-1">
                         <p className="text-[10px] font-black uppercase tracking-widest text-primary-500">{item.type}</p>
                         <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate mt-1">{item.prompt}</p>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>
      </main>

      {/* --- WORKFLOW OVERLAYS --- */}

      {/* 1. Analyzing Loader */}
      {stage === 'analyzing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-all">
          <div className="text-center space-y-4 animate-bounce-slight">
            <div className="w-24 h-24 mx-auto border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-slate-800 dark:text-white">Analyzing Context</h2>
            <p className="text-sm font-medium text-slate-500">Gemini is brainstorming 5 creative directions...</p>
          </div>
        </div>
      )}

      {/* 2. Suggestion Selection Grid */}
      {stage === 'suggesting' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-lg p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-slate-800 dark:text-white">Select Direction</h2>
                <p className="text-sm text-slate-500 mt-1">Choose the best execution plan for your vision.</p>
              </div>
              <button onClick={() => setStage('idle')} className="text-slate-400 hover:text-red-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Original Idea */}
              <div 
                onClick={() => executeTask(prompt || 'Original Request')}
                className="group relative p-6 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-500 cursor-pointer transition-all hover:bg-primary-50 dark:hover:bg-primary-900/10"
              >
                <div className="absolute top-4 right-4 w-4 h-4 rounded-full border-2 border-slate-300 group-hover:bg-primary-500 group-hover:border-primary-500 transition-colors"></div>
                <h3 className="font-bold text-lg mb-2 text-slate-800 dark:text-white">Original Idea</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{prompt || "Execute exact request without modification."}</p>
              </div>

              {/* Suggestions */}
              {suggestions.map((sug, idx) => (
                <div 
                  key={idx}
                  onClick={() => executeTask(sug)}
                  className="group relative p-6 rounded-2xl border-2 border-indigo-100 dark:border-slate-700 hover:border-indigo-500 cursor-pointer transition-all hover:bg-indigo-50 dark:hover:bg-indigo-900/10 bg-white dark:bg-slate-800"
                >
                  <div className="absolute top-0 left-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg uppercase tracking-wider">Option {idx + 1}</div>
                  <h3 className="font-bold text-lg mt-4 mb-2 text-slate-800 dark:text-white">AI Suggestion</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{sug}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Execution Progress Animation */}
      {stage === 'executing' && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-white dark:bg-slate-950 px-4">
          <div className="w-full max-w-2xl space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-indigo-600 animate-pulse">
                Processing Vision
              </h2>
              <p className="text-slate-500">Please wait while our engines render reality.</p>
            </div>

            <div className="bg-slate-100 dark:bg-slate-900 rounded-3xl p-8 shadow-inner border border-slate-200 dark:border-slate-800 space-y-6">
              {PROCESSING_STEPS[activeTaskType].map((stepText, idx) => {
                 const isCompleted = completedSteps[idx];
                 const isCurrent = idx === currentStepIndex;
                 const isPending = idx > currentStepIndex;

                 return (
                   <div key={idx} className={`flex items-center gap-4 transition-all duration-500 ${isPending ? 'opacity-30' : 'opacity-100'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                        isCompleted ? 'bg-green-500 border-green-500 text-white' : 
                        isCurrent ? 'border-primary-500 text-primary-500 animate-spin-slow' : 'border-slate-400'
                      }`}>
                        {isCompleted ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        ) : (
                          <span className="text-xs font-bold">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-bold text-lg ${isCurrent ? 'text-primary-600 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>{stepText}</p>
                        {isCurrent && (
                          <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 mt-2 rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500 animate-progress-indeterminate"></div>
                          </div>
                        )}
                      </div>
                   </div>
                 );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm w-full animate-slideIn">
          <div className="bg-white dark:bg-slate-900 border-2 border-red-500 rounded-3xl p-5 shadow-2xl flex gap-4">
             <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-xl h-fit">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
             </div>
             <div className="flex-1 space-y-1">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">{error.message}</h3>
               <p className="text-xs font-medium text-slate-500">{error.details}</p>
             </div>
             <button onClick={() => setError(null)} className="h-fit text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
               </svg>
             </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes progress-indeterminate { 0% { width: 0%; margin-left: 0%; } 50% { width: 50%; margin-left: 25%; } 100% { width: 100%; margin-left: 100%; } }
        .animate-fadeIn { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideIn { animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-progress-indeterminate { animation: progress-indeterminate 1.5s infinite linear; }
        .animate-spin-slow { animation: spin 3s linear infinite; }
      `}</style>
    </div>
  );
};

export default App;
