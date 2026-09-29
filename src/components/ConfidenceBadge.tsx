import React from 'react';
import { ConfidenceStatus } from '../types';
import { CheckCircle2, Sparkles, AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfidenceBadgeProps {
  status: ConfidenceStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ 
  status, 
  size = 'md',
  showLabel = true 
}) => {
  const configs: Record<ConfidenceStatus, {
    label: string;
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }> = {
    CONFIRMED: {
      label: 'CONFIRMED',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: CheckCircle2,
      description: 'Directly corroborated by uploaded source documents or screenshots'
    },
    INFERRED: {
      label: 'INFERRED',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      icon: Sparkles,
      description: 'Derived by AI reasoning from context and industry domain patterns'
    },
    AMBIGUOUS: {
      label: 'AMBIGUOUS',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: AlertTriangle,
      description: 'Conflicting or divergent information found across multiple sources'
    },
    MISSING: {
      label: 'MISSING',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      icon: HelpCircle,
      description: 'Critical business requirement not found in any provided material'
    }
  };

  const config = configs[status] || configs.INFERRED;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  return (
    <span
      title={config.description}
      className={`inline-flex items-center font-medium rounded-md border ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]} tracking-tight transition-colors select-none`}
    >
      <Icon className={`${iconSizes[size]} shrink-0`} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};
