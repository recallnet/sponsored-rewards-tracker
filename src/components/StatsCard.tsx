'use client';

import { cn } from '@/lib/utils';

interface StatsCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatsCard({ label, value, subValue, trend, className }: StatsCardProps) {
  return (
    <div className={cn('card', className)}>
      <p className="text-text-muted text-sm mb-1">{label}</p>
      <p
        className={cn(
          'text-2xl font-bold mono',
          trend === 'up' && 'text-profit',
          trend === 'down' && 'text-loss',
          !trend && 'text-text-primary'
        )}
      >
        {value}
      </p>
      {subValue && (
        <p
          className={cn(
            'text-sm mt-1',
            trend === 'up' && 'text-profit/80',
            trend === 'down' && 'text-loss/80',
            !trend && 'text-text-muted'
          )}
        >
          {subValue}
        </p>
      )}
    </div>
  );
}
