'use client';

import { use } from 'react';
import useSWR from 'swr';
import { StatsCard } from '@/components/StatsCard';
import { formatCurrency, formatPercent, formatTime, cn } from '@/lib/utils';

interface Portfolio {
  agentId: string;
  agentName: string;
  cash: number;
  positionsValue: number;
  totalValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  returnPct: number;
}

interface Position {
  id: string;
  venue: string;
  marketId: string;
  marketTitle?: string;
  side: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  openedAt: string;
}

interface Trade {
  id: string;
  orderId: string;
  venue: string;
  marketId: string;
  marketTitle?: string;
  side: string;
  action: string;
  quantity: number;
  price: number;
  fees: number;
  total: number;
  timestamp: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);

  const { data: portfolioData, error: portfolioError } = useSWR<Portfolio>(
    `/api/portfolio/${agentId}`,
    fetcher,
    { refreshInterval: 3000 }
  );

  const { data: positionsData } = useSWR<{ positions: Position[] }>(
    `/api/positions/${agentId}`,
    fetcher,
    { refreshInterval: 3000 }
  );

  const { data: tradesData } = useSWR<{ trades: Trade[] }>(
    `/api/trades/${agentId}?limit=20`,
    fetcher,
    { refreshInterval: 5000 }
  );

  if (portfolioError) {
    return (
      <div className="card border-loss/30">
        <p className="text-loss">Agent not found</p>
        <a href="/" className="text-accent hover:underline mt-2 inline-block">
          ← Back to leaderboard
        </a>
      </div>
    );
  }

  const portfolio = portfolioData;
  const positions = positionsData?.positions ?? [];
  const trades = tradesData?.trades ?? [];

  const isLoading = !portfolio;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <a
            href="/"
            className="text-text-muted hover:text-accent transition-colors text-sm mb-2 inline-block"
          >
            ← Back to leaderboard
          </a>
          <h1 className="text-3xl font-bold text-text-primary">
            {portfolio?.agentName ?? 'Loading...'}
          </h1>
        </div>
        {portfolio && (
          <div className="text-right">
            <p className="text-text-muted text-sm">API Key</p>
            <code className="text-text-secondary text-sm">sk_***{agentId.slice(-6)}</code>
          </div>
        )}
      </div>

      {/* Portfolio Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-surface-hover rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-surface-hover rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard label="Total Value" value={formatCurrency(portfolio!.totalValue)} />
          <StatsCard label="Cash" value={formatCurrency(portfolio!.cash)} />
          <StatsCard label="Positions" value={formatCurrency(portfolio!.positionsValue)} />
          <StatsCard
            label="Total P&L"
            value={formatCurrency(portfolio!.totalPnL)}
            subValue={formatPercent(portfolio!.returnPct)}
            trend={portfolio!.totalPnL >= 0 ? 'up' : 'down'}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Positions */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Open Positions ({positions.length})</h2>
          {positions.length === 0 ? (
            <p className="text-text-muted text-center py-8">No open positions</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-text-muted text-sm border-b border-border">
                    <th className="pb-3 pr-4">Market</th>
                    <th className="pb-3 pr-4">Side</th>
                    <th className="pb-3 pr-4 text-right">Qty</th>
                    <th className="pb-3 pr-4 text-right">Entry</th>
                    <th className="pb-3 pr-4 text-right">Current</th>
                    <th className="pb-3 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(position => (
                    <tr key={position.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium truncate max-w-[150px]">
                          {position.marketTitle || position.marketId}
                        </div>
                        <div className="text-text-muted text-xs">{position.venue}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'badge',
                            position.side === 'YES' ? 'badge-profit' : 'badge-loss'
                          )}
                        >
                          {position.side}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right mono">{position.quantity}</td>
                      <td className="py-3 pr-4 text-right mono">
                        ${position.avgEntryPrice.toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-right mono">
                        ${position.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'py-3 text-right mono',
                          position.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'
                        )}
                      >
                        {formatCurrency(position.unrealizedPnL)}
                        <div className="text-xs">{formatPercent(position.unrealizedPnLPct)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Trades */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
          {trades.length === 0 ? (
            <p className="text-text-muted text-center py-8">No trades yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-text-muted text-sm border-b border-border">
                    <th className="pb-3 pr-4">Time</th>
                    <th className="pb-3 pr-4">Market</th>
                    <th className="pb-3 pr-4">Action</th>
                    <th className="pb-3 pr-4 text-right">Qty</th>
                    <th className="pb-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(trade => (
                    <tr key={trade.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4 text-text-muted text-sm">
                        {formatTime(trade.timestamp)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium truncate max-w-[120px]">
                          {trade.marketTitle || trade.marketId}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'font-medium',
                            trade.action === 'BUY' ? 'text-profit' : 'text-loss'
                          )}
                        >
                          {trade.action}
                        </span>
                        <span className="text-text-muted ml-1">{trade.side}</span>
                      </td>
                      <td className="py-3 pr-4 text-right mono">{trade.quantity}</td>
                      <td className="py-3 text-right mono">{formatCurrency(trade.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
