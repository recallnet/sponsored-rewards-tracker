'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import { SWR_CONFIG, fetcher, formatRelative, formatCompact } from './shared';

interface CategoryBreakdown {
  category: string;
  marketCount: number;
  dailyReward: number;
}

interface TopMarket {
  title: string;
  slug: string;
  dailyReward: number;
  maxSpread: number;
  minSize: number;
  category: string;
  volume: number;
}

interface LimitlessLpSnapshot {
  totalDailyBudget: number;
  rewardableMarkets: number;
  totalClobMarkets: number;
  categories: CategoryBreakdown[];
  topMarkets: TopMarket[];
  nextPayoutUtc: string;
  fetchedAt: string;
}

function useCountdown(target: string) {
  const [, setTick] = useState(0);
  const ms = new Date(target).getTime() - Date.now();

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useState(() => {
      const id = setInterval(() => setTick(t => t + 1), 60_000);
      return () => clearInterval(id);
    });
  }

  if (ms <= 0) return 'Payout in progress...';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

type View = 'categories' | 'markets';

export default function LimitlessLpTab() {
  const { data, error, isLoading, mutate } = useSWR<LimitlessLpSnapshot>(
    '/api/limitless/lp-rewards',
    fetcher,
    SWR_CONFIG,
  );
  const [view, setView] = useState<View>('categories');

  const countdown = useCountdown(data?.nextPayoutUtc ?? '');

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="Limitless LP rewards" />;

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Daily LP Reward Budget (Live)
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCompact(data.totalDailyBudget)}
          <span className="text-2xl md:text-3xl text-[#555] font-normal">/day</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {data.rewardableMarkets} rewardable markets&ensp;·&ensp;
          next payout in {countdown}&ensp;·&ensp;
          updated {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Daily Budget" value={formatCompact(data.totalDailyBudget)} />
        <Stat label="Weekly Est." value={formatCompact(data.totalDailyBudget * 7)} border />
        <Stat label="Monthly Est." value={formatCompact(data.totalDailyBudget * 30)} border />
        <Stat label="Markets" value={String(data.rewardableMarkets)} border />
      </div>

      <div className="border border-[#333] mb-14 p-5">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-1">Payout Schedule</p>
        <p className="text-sm text-[#888] mt-1">
          Rewards calculated every minute, paid daily at <span className="text-white font-mono">12:00 UTC</span>.
          Orders must be within the market's max spread and above min size to qualify.
        </p>
      </div>

      <div className="mb-4 flex items-end justify-between">
        <div className="flex gap-2">
          {(['categories', 'markets'] as View[]).map(v => (
            <button
              key={v}
              className={`text-xs px-3 py-1 border transition-colors ${
                view === v
                  ? 'border-white text-white'
                  : 'border-[#333] text-[#555] hover:text-white hover:border-white'
              }`}
              onClick={() => setView(v)}
            >
              {v === 'categories' ? 'By Category' : 'Top Markets'}
            </button>
          ))}
        </div>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/limitless/lp-rewards?force=1'), { revalidate: false })}
        >
          Refresh
        </button>
      </div>

      {view === 'categories' ? (
        <CategoryTable categories={data.categories} total={data.totalDailyBudget} />
      ) : (
        <MarketTable markets={data.topMarkets} />
      )}

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: Limitless Exchange API (live market settings)&ensp;·&ensp;
        Payouts at 12:00 UTC daily&ensp;·&ensp;
        updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}

function CategoryTable({ categories, total }: { categories: CategoryBreakdown[]; total: number }) {
  return (
    <div className="overflow-x-auto border border-[#333]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
            <th className="py-3 px-5">Category</th>
            <th className="py-3 px-4 text-right">Markets</th>
            <th className="py-3 px-4 text-right">Daily Rewards</th>
            <th className="py-3 px-4 text-right">% of Total</th>
            <th className="py-3 px-4">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#222]">
          {categories.map(c => {
            const pct = total > 0 ? (c.dailyReward / total) * 100 : 0;
            return (
              <tr key={c.category} className="hover:bg-[#0a0a0a] transition-colors">
                <td className="py-3 px-5 font-medium">{c.category}</td>
                <td className="py-3 px-4 text-right font-mono">{c.marketCount}</td>
                <td className="py-3 px-4 text-right font-mono">{formatCompact(c.dailyReward)}</td>
                <td className="py-3 px-4 text-right font-mono text-[#555]">{pct.toFixed(1)}%</td>
                <td className="py-3 px-4">
                  <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {categories.length === 0 && (
        <p className="text-center text-[#555] py-8 text-sm">No reward categories found.</p>
      )}
    </div>
  );
}

function MarketTable({ markets }: { markets: TopMarket[] }) {
  return (
    <div className="overflow-x-auto border border-[#333]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
            <th className="py-3 px-5 pr-4">#</th>
            <th className="py-3 px-4">Market</th>
            <th className="py-3 px-4">Category</th>
            <th className="py-3 px-4 text-right">Daily Reward</th>
            <th className="py-3 px-4 text-right">Max Spread</th>
            <th className="py-3 px-4 text-right">Min Size</th>
            <th className="py-3 px-4 text-right">Volume</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#222]">
          {markets.map((m, i) => (
            <tr key={m.slug} className="hover:bg-[#0a0a0a] transition-colors">
              <td className="py-3 px-5 pr-4 font-mono text-[#555] text-xs">{i + 1}</td>
              <td className="py-3 px-4 max-w-[300px]">
                <a
                  href={`https://limitless.exchange/markets/${m.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-xs leading-tight block truncate"
                  title={m.title}
                >
                  {m.title}
                </a>
              </td>
              <td className="py-3 px-4 text-xs text-[#888]">{m.category}</td>
              <td className="py-3 px-4 text-right font-mono">{formatCompact(m.dailyReward)}</td>
              <td className="py-3 px-4 text-right font-mono text-[#888]">{m.maxSpread.toFixed(1)}c</td>
              <td className="py-3 px-4 text-right font-mono text-[#888]">{m.minSize.toLocaleString()}</td>
              <td className="py-3 px-4 text-right font-mono text-[#888]">{formatCompact(m.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {markets.length === 0 && (
        <p className="text-center text-[#555] py-8 text-sm">No rewardable markets found.</p>
      )}
    </div>
  );
}
