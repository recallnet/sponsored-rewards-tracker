'use client';

import useSWR from 'swr';
import { formatCurrency, formatRelativeTime, cn } from '@/lib/utils';

interface Activity {
  id: string;
  agentId: string;
  venue: string;
  marketTitle?: string;
  side: string;
  action: string;
  quantity: number;
  price: number;
  total: number;
  timestamp: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function ActivityFeed() {
  const { data, error, isLoading } = useSWR<{ activity: Activity[] }>('/api/activity', fetcher, {
    refreshInterval: 3000,
  });

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-surface-hover rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-surface-hover rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  const activities = data?.activity ?? [];

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-profit rounded-full pulse-dot"></span>
        <span>Recent Activity</span>
      </h2>
      <div className="space-y-2">
        {activities.map(activity => (
          <div
            key={activity.id}
            className="flex items-center justify-between text-sm py-2 border-b border-border/30 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  'font-medium',
                  activity.action === 'BUY' ? 'text-profit' : 'text-loss'
                )}
              >
                {activity.action}
              </span>
              <span className="text-text-secondary mx-1">
                {activity.quantity} {activity.side}
              </span>
              <span className="text-text-muted truncate">
                on {activity.marketTitle || activity.venue}
              </span>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <span className="mono text-text-secondary">{formatCurrency(activity.total)}</span>
              <span className="text-text-muted text-xs whitespace-nowrap">
                {formatRelativeTime(activity.timestamp)}
              </span>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <p className="text-text-muted text-center py-4">No activity yet</p>
        )}
      </div>
    </div>
  );
}
