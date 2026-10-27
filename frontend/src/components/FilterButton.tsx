import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, RotateCcw, Check } from 'lucide-react';

export interface FilterButtonProps {
  /** Number of currently active filter criteria */
  activeCount?: number;
  /** Alias for activeCount */
  activeFilterCount?: number;
  /** Callback fired when user clicks Clear/Reset */
  onReset: () => void;
  /** Optional callback fired when user explicitly clicks Apply */
  onApply?: () => void;
  /** Title shown in popover header (defaults to "Filter Records") */
  title?: string;
  /** Children elements containing filter inputs and dropdowns */
  children: React.ReactNode;
  /** Alignment of popover relative to button ('left' | 'right') */
  align?: 'left' | 'right';
  /** Optional custom button label (defaults to "Filters") */
  buttonLabel?: string;
  /** Custom popover width class (defaults to "w-80 sm:w-96") */
  width?: string;
  /** Alias for width */
  popoverWidth?: string;
  /** Additional classes for trigger button */
  className?: string;
}

export const FilterButton: React.FC<FilterButtonProps> = ({
  activeCount,
  activeFilterCount,
  onReset,
  onApply,
  title = 'Filter Records',
  children,
  align = 'right',
  buttonLabel = 'Filters',
  width,
  popoverWidth,
  className = '',
}) => {
  const resolvedCount = activeFilterCount ?? activeCount ?? 0;
  const resolvedWidth = popoverWidth || width || 'w-80 sm:w-96';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleApply = () => {
    if (onApply) {
      onApply();
    }
    setIsOpen(false);
  };

  const handleReset = () => {
    onReset();
  };

  const hasActive = resolvedCount > 0;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors shadow-xs select-none ${
          hasActive
            ? 'bg-brand-50 border-brand-500 text-brand-700 ring-1 ring-brand-500/20'
            : isOpen
            ? 'bg-slate-100 border-slate-400 text-slate-800'
            : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
        } ${className}`}
      >
        <Filter className={`w-3.5 h-3.5 ${hasActive ? 'text-brand-600' : 'text-slate-500'}`} />
        <span>{buttonLabel}</span>
        {hasActive && (
          <span className="ml-0.5 px-1.5 py-0.2 bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center leading-4">
            {resolvedCount}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div
          className={`absolute z-30 mt-2 ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${resolvedWidth} bg-white rounded-xl shadow-xl border border-slate-200 p-4 animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-brand-600" />
              <h4 className="text-xs font-bold text-slate-800 tracking-tight">{title}</h4>
              {hasActive && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                  {activeCount} active
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {hasActive && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] font-medium text-slate-500 hover:text-rose-600 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                  title="Clear all filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                aria-label="Close filters"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto px-0.5 py-1 text-xs">
            {children}
          </div>

          {/* Footer Controls */}
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                hasActive
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
