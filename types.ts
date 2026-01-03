
export type AppTheme = 'light' | 'dark';

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  type: 'generation' | 'edit';
}

export interface AppError {
  id: string;
  message: string;
  details?: string;
}

export enum TabType {
  GENERATE = 'GENERATE',
  EDIT = 'EDIT',
  HISTORY = 'HISTORY'
}

export interface CanvasLayer {
  id: string;
  url: string; // Base64
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
  aspectRatio: number; // width / height
  originalWidth: number;
  originalHeight: number;
}
