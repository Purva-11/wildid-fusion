import type { ReactNode } from 'react';
import { confidenceColor, confidenceLabel } from '@/utils/format';
import type { MatchConfidence } from '@/types';

interface ConfidenceBadgeProps {
  confidence: MatchConfidence;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ confidence, size = 'md' }: ConfidenceBadgeProps) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${padding} ${confidenceColor(confidence)}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${confidenceDot(confidence)}`} />
      {confidenceLabel(confidence)}
    </span>
  );
}

function confidenceDot(c: MatchConfidence): string {
  switch (c) {
    case 'high':
      return 'bg-forest-500';
    case 'medium':
      return 'bg-amber-500';
    case 'low':
      return 'bg-red-500';
  }
}

interface StatusBadgeProps {
  status: 'confirmed' | 'pending' | 'rejected';
  label: string;
  colors: string;
  icon?: ReactNode;
}

export function StatusBadge({ status: _status, label, colors, icon }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colors}`}
    >
      {icon}
      {label}
    </span>
  );
}

interface MatchScoreRingProps {
  score: number;
  size?: number;
}

export function MatchScoreRing({ score, size = 80 }: MatchScoreRingProps) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? '#2e8b2e' : score >= 65 ? '#d97706' : '#dc2626';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#dcf0dc"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold" style={{ color }}>
          {score}%
        </span>
      </div>
    </div>
  );
}

interface MatchBarProps {
  score: number;
  label?: string;
}

export function MatchBar({ score, label }: MatchBarProps) {
  const color = score >= 85 ? 'from-forest-500 to-lime-400' : score >= 65 ? 'from-amber-400 to-amber-300' : 'from-red-400 to-red-300';
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-forest-700">
          <span>{label}</span>
          <span className="font-semibold">{score}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-forest-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-800 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
