import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

export const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step, 
  onChange,
  formatValue
}) => {
  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</label>
        <span className="text-xs text-gray-300 font-mono">
          {formatValue ? formatValue(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary hover:accent-secondary transition-colors"
      />
    </div>
  );
};