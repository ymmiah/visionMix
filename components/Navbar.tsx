
import React from 'react';
import { AppTheme } from '../types';
import ThemeToggle from './ThemeToggle';

interface NavbarProps {
  theme: AppTheme;
  onThemeToggle: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ theme, onThemeToggle }) => {
  return (
    <nav className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-primary-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-indigo-600">
            VisionMix AI
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle theme={theme} toggle={onThemeToggle} />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
