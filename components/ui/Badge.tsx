import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'amber' | 'emerald' | 'rose' | 'blue' | 'purple' | 'slate' | 'indigo' | 'sky';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
  ...props
}) => {
  const variantStyles: Record<string, string> = {
    amber: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
    emerald: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
    rose: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
    blue: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
    sky: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
    purple: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60',
    indigo: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60',
    slate: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium border',
    md: 'text-xs px-2.5 py-1 rounded-md font-medium border',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
