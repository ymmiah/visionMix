
import { CanvasLayer } from '../types';

export const saveProject = (layers: CanvasLayer[]) => {
  const data = JSON.stringify({ 
    version: '1.0', 
    timestamp: Date.now(), 
    layers 
  }, null, 2);
  
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `visionmix-project-${new Date().toISOString().slice(0,10)}.vmix`;
  a.click();
  URL.revokeObjectURL(url);
};

export const loadProject = async (file: File): Promise<CanvasLayer[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.layers && Array.isArray(json.layers)) {
          resolve(json.layers);
        } else {
          reject(new Error("Invalid .vmix project file structure"));
        }
      } catch (err) {
        reject(new Error("Failed to parse project file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};
