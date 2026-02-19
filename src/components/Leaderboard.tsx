'use client';

import useSWR from 'swr';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';

interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  totalPnL: number;
  returnPct: number;
  trades: number;
  winRate: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function Leaderboard() {
  const { data, error, isLoading } = useSWR<{ agents: LeaderboardEntry[] }>(
    '/api/leaderboard',
    fetcher,
    { refreshInterval: 5000 }
  );

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-8 bg-surface-hover rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-surface-hover rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-loss/30">
        <p className="text-loss">Failed to load leaderboard</p>
      </div>
    );
  }

  const agents = data?.agents ?? [];

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank.toString();
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>🏆</span>
        <span>Leaderboard</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-text-muted text-sm border-b border-border">
              <th className="pb-3 pr-4">Rank</th>
              <th className="pb-3 pr-4">Agent</th>
              <th className="pb-3 pr-4 text-right">Total P&L</th>
              <th className="pb-3 pr-4 text-right">Return</th>
              <th className="pb-3 pr-4 text-right">Trades</th>
              <th className="pb-3 text-right">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr
                key={agent.agentId}
                className="border-b border-border/50 table-row cursor-pointer"
                onClick={() => (window.location.href = `/agents/${agent.agentId}`)}
              >
                <td className="py-3 pr-4">
                  <span className="text-lg">{getRankEmoji(agent.rank)}</span>
                </td>
                <td className="py-3 pr-4">
                  <a
                    href={`/agents/${agent.agentId}`}
                    className="font-medium hover:text-accent transition-colors"
                  >
                    {agent.name}
                  </a>
                </td>
                <td
                  className={cn(
                    'py-3 pr-4 text-right mono',
                    agent.totalPnL >= 0 ? 'text-profit' : 'text-loss'
                  )}
                >
                  {formatCurrency(agent.totalPnL)}
                </td>
                <td
                  className={cn(
                    'py-3 pr-4 text-right mono',
                    agent.returnPct >= 0 ? 'text-profit' : 'text-loss'
                  )}
                >
                  {formatPercent(agent.returnPct)}
                </td>
                <td className="py-3 pr-4 text-right mono text-text-secondary">{agent.trades}</td>
                <td className="py-3 text-right mono text-text-secondary">
                  {agent.winRate.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {agents.length === 0 && (
        <p className="text-text-muted text-center py-8">
          No agents yet. Register one to get started!
        </p>
      )}
    </div>
  );
}
