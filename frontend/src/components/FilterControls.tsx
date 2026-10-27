import React from 'react';

interface FilterFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export const FilterField: React.FC<FilterFieldProps> = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="block text-[11px] font-bold text-slate-700 tracking-tight">{label}</label>
    {children}
  </div>
);

interface FilterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { label: string; value: string }[];
}

export const FilterSelect: React.FC<FilterSelectProps> = ({ options, className = '', ...props }) => (
  <select
    className={`w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium transition-all ${className}`}
    {...props}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

interface FilterInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const FilterInput: React.FC<FilterInputProps> = ({ className = '', ...props }) => (
  <input
    className={`w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium transition-all ${className}`}
    {...props}
  />
);
