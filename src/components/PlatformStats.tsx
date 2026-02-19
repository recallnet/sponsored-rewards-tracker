'use client';

import useSWR from 'swr';
import { StatsCard } from './StatsCard';
import { formatCurrency } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function PlatformStats() {
  const { data: agentsData } = useSWR('/api/agents', fetcher, { refreshInterval: 10000 });
  const { data: activityData } = useSWR('/api/activity', fetcher, { refreshInterval: 5000 });
  const { data: leaderboardData } = useSWR('/api/leaderboard', fetcher, { refreshInterval: 5000 });

  const totalAgents = agentsData?.agents?.length ?? 0;
  const totalTrades =
    leaderboardData?.agents?.reduce((sum: number, a: { trades: number }) => sum + a.trades, 0) ?? 0;

  // Calculate total volume from activity
  const totalVolume =
    activityData?.activity?.reduce(
      (sum: number, a: { total: number }) => sum + Math.abs(a.total),
      0
    ) ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatsCard label="Total Agents" value={totalAgents.toString()} />
      <StatsCard label="Total Trades" value={totalTrades.toString()} />
      <StatsCard label="Volume (Recent)" value={formatCurrency(totalVolume)} />
      <StatsCard label="Markets" value="156" subValue="Polymarket + Kalshi" />
    </div>
  );
}
