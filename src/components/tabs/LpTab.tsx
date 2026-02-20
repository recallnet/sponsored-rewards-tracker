'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { formatCurrency } from '@/lib/utils';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import {
  PAGE_SIZE, SWR_CONFIG, fetcher,
  formatRelative, formatTimeLeft, polymarketUrl, formatCompact,
} from './shared';

interface LpRewardMarket {
  conditionId: string;
  question: string;
  eventSlug?: string;
  dailyRate: number;
  maxSpread: number;
  minSize: number;
  rewardStartDate?: string;
  rewardEndDate?: string;
  liquidity: number;
  volume24h: number;
  spread: number;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  endDate?: string;
}

interface LpRewardsSnapshot {
  markets: LpRewardMarket[];
  overall: {
    totalMarkets: number;
    totalDailyRewards: number;
    avgDailyRate: number;
    medianDailyRate: number;
    avgMaxSpread: number;
    avgMinSize: number;
  };
  fetchedAt: string;
}

export default function LpTab() {
  const { data, error, isLoading, mutate } = useSWR<LpRewardsSnapshot>(
    '/api/lp-rewards',
    fetcher,
    SWR_CONFIG,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="LP rewards" />;

  const { overall, markets } = data;
  const totalPages = Math.ceil(markets.length / PAGE_SIZE);
  const visible = markets.slice(0, page * PAGE_SIZE);
  const hasMore = page < totalPages;

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Total Daily LP Rewards
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCurrency(overall.totalDailyRewards)}
          <span className="text-2xl md:text-3xl text-[#555] font-normal">/day</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {overall.totalMarkets.toLocaleString()} markets&ensp;·&ensp;
          avg {formatCurrency(overall.avgDailyRate)}/day&ensp;·&ensp;
          median {formatCurrency(overall.medianDailyRate)}/day&ensp;·&ensp; updated{' '}
          {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Total Markets" value={overall.totalMarkets.toLocaleString()} />
        <Stat label="Daily Budget" value={formatCurrency(overall.totalDailyRewards)} border />
        <Stat label="Avg Max Spread" value={`${overall.avgMaxSpread.toFixed(1)}¢`} border />
        <Stat label="Avg Min Size" value={`${Math.round(overall.avgMinSize)} shares`} border />
      </div>

      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Reward Markets ({markets.length})
        </p>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/lp-rewards?force=1'), { revalidate: false })}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto border border-[#333]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
              <th className="py-3 px-5 pr-4">Market</th>
              <th className="py-3 px-4 text-right">Daily Rate</th>
              <th className="py-3 px-4 text-right">Max Spread</th>
              <th className="py-3 px-4 text-right">Min Size</th>
              <th className="py-3 px-4 text-right">Liquidity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {visible.map(m => {
              const isOpen = expanded === m.conditionId;
              const url = polymarketUrl(m.eventSlug);

              return (
                <Fragment key={m.conditionId}>
                  <tr
                    className="hover:bg-[#0a0a0a] cursor-pointer transition-colors"
                    onClick={() => setExpanded(p => (p === m.conditionId ? null : m.conditionId))}
                  >
                    <td className="py-3 px-5 pr-4">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                          {m.question}
                        </a>
                      ) : (
                        <span>{m.question}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(m.dailyRate)}/d</td>
                    <td className="py-3 px-4 text-right font-mono">{m.maxSpread.toFixed(1)}¢</td>
                    <td className="py-3 px-4 text-right font-mono">{m.minSize}</td>
                    <td className="py-3 px-4 text-right font-mono">{m.liquidity > 0 ? formatCompact(m.liquidity) : '--'}</td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-[#080808]">
                      <td colSpan={5} className="px-5 py-4 text-[#999]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                          <div>
                            <span className="text-[#555]">Volume 24h</span>
                            <p>{m.volume24h > 0 ? formatCompact(m.volume24h) : '--'}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Spread</span>
                            <p>{m.spread > 0 ? `${(m.spread * 100).toFixed(1)}¢` : '--'}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Last price</span>
                            <p>{m.lastTradePrice > 0 ? `${(m.lastTradePrice * 100).toFixed(1)}¢` : '--'}</p>
                          </div>
                          {m.endDate && (
                            <div>
                              <span className="text-[#555]">Market ends</span>
                              <p>{formatTimeLeft(m.endDate)}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-[#555]">Reward period</span>
                            <p>
                              {m.rewardStartDate ?? '?'} → {m.rewardEndDate === '2500-12-31' ? '∞' : m.rewardEndDate ?? '?'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {markets.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No LP reward markets found.</p>
        )}

        {hasMore && (
          <div className="border-t border-[#333] px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-[#555] font-mono">Showing {visible.length} of {markets.length}</p>
            <button className="text-xs border border-[#333] px-4 py-1.5 hover:text-white hover:border-white transition-colors text-[#999]" onClick={() => setPage(p => p + 1)}>
              Load more
            </button>
          </div>
        )}

        {!hasMore && markets.length > PAGE_SIZE && (
          <div className="border-t border-[#333] px-5 py-3">
            <p className="text-xs text-[#555] font-mono">Showing all {markets.length} markets</p>
          </div>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: CLOB rewards API + Gamma enrichment&ensp;·&ensp;updated{' '}
        {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
