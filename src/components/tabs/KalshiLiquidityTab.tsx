'use client';

import useSWR from 'swr';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import { SWR_CONFIG, fetcher, formatRelative, formatCompact } from './shared';

interface IncentiveSummary {
  totalPrograms: number;
  totalRewardUsd: number;
  volumePrograms: number;
  volumeRewardUsd: number;
  liquidityPrograms: number;
  liquidityRewardUsd: number;
}

interface MarketIncentive {
  marketTicker: string;
  title: string;
  eventTicker: string;
  type: 'volume' | 'liquidity';
  rewardUsd: number;
  startDate: string;
  endDate: string;
  targetSize: number | null;
  discountBps: number | null;
}

interface KalshiIncentivesSnapshot {
  active: IncentiveSummary;
  paidOut: IncentiveSummary;
  closed: IncentiveSummary;
  grandTotalUsd: number;
  activeMarkets: MarketIncentive[];
  topPaidOutMarkets: MarketIncentive[];
  recentPayouts: MarketIncentive[];
  fetchedAt: string;
}

function marketUrl(eventTicker: string): string {
  return `https://kalshi.com/markets/${eventTicker}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function KalshiLiquidityTab() {
  const { data, error, isLoading, mutate } = useSWR<KalshiIncentivesSnapshot>(
    '/api/kalshi/incentives',
    fetcher,
    SWR_CONFIG,
  );

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="Kalshi liquidity incentives" />;

  const activeLiq = data.activeMarkets.filter(m => m.type === 'liquidity');
  const topLiq = data.topPaidOutMarkets.filter(m => m.type === 'liquidity');
  const elapsed = Math.ceil(
    (Date.now() - new Date('2025-09-15').getTime()) / 86_400_000,
  );
  const dailyAvg = elapsed > 0 ? data.paidOut.liquidityRewardUsd / elapsed : 0;

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Liquidity Incentives — Total Distributed
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCompact(data.paidOut.liquidityRewardUsd)}
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {data.paidOut.liquidityPrograms.toLocaleString()} programs paid out&ensp;·&ensp;
          {activeLiq.length} active now ({formatCompact(data.active.liquidityRewardUsd)})&ensp;·&ensp;
          ~{formatCompact(dailyAvg)}/day avg&ensp;·&ensp;
          updated {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Total Paid Out" value={formatCompact(data.paidOut.liquidityRewardUsd)} />
        <Stat label="Active Now" value={formatCompact(data.active.liquidityRewardUsd)} border />
        <Stat label="Avg Daily" value={`~${formatCompact(dailyAvg)}`} border />
        <Stat label="Programs" value={data.paidOut.liquidityPrograms.toLocaleString()} border />
      </div>

      <div className="border border-[#333] mb-14 p-5">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-2">How Liquidity Incentives Work</p>
        <div className="text-sm text-[#888] space-y-1">
          <p>Earn rewards for placing resting limit orders that improve market depth — even if orders don't fill.</p>
          <p>Scored second-by-second based on order size and proximity to best bid/ask. Daily pools: <span className="text-white font-mono">$10–$1,000</span> per market. Uncapped per-user earnings.</p>
        </div>
      </div>

      <div className="mb-14">
        <div className="mb-4">
          <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
            Active Liquidity Programs ({activeLiq.length})
          </p>
        </div>
        <div className="overflow-x-auto border border-[#333]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
                <th className="py-3 px-5 pr-4">#</th>
                <th className="py-3 px-4">Market</th>
                <th className="py-3 px-4 text-right">Daily Pool</th>
                <th className="py-3 px-4 text-right">Target Size</th>
                <th className="py-3 px-4 text-right">Ends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {activeLiq.slice(0, 30).map((m, i) => (
                <tr key={`${m.marketTicker}-${i}`} className="hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-3 px-5 pr-4 font-mono text-[#555] text-xs">{i + 1}</td>
                  <td className="py-3 px-4 max-w-[400px]">
                    <a
                      href={marketUrl(m.eventTicker)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs hover:text-blue-400 transition-colors leading-snug block"
                      title={m.marketTicker}
                    >
                      {m.title}
                    </a>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{formatCompact(m.rewardUsd)}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#888]">
                    {m.targetSize ? m.targetSize.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-[#888]">{formatDate(m.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeLiq.length === 0 && (
            <p className="text-center text-[#555] py-8 text-sm">No active liquidity programs.</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Top Liquidity Programs by Pool Size
        </p>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/kalshi/incentives?force=1'), { revalidate: false })}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto border border-[#333]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
              <th className="py-3 px-5 pr-4">#</th>
              <th className="py-3 px-4">Market</th>
              <th className="py-3 px-4 text-right">Pool Size</th>
              <th className="py-3 px-4 text-right">Target Size</th>
              <th className="py-3 px-4 text-right">Period</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {topLiq.map((m, i) => (
              <tr key={`${m.marketTicker}-${i}`} className="hover:bg-[#0a0a0a] transition-colors">
                <td className="py-3 px-5 pr-4 font-mono text-[#555] text-xs">{i + 1}</td>
                <td className="py-3 px-4 max-w-[400px]">
                  <a
                    href={marketUrl(m.eventTicker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:text-blue-400 transition-colors leading-snug block"
                    title={m.marketTicker}
                  >
                    {m.title}
                  </a>
                </td>
                <td className="py-3 px-4 text-right font-mono">{formatCompact(m.rewardUsd)}</td>
                <td className="py-3 px-4 text-right font-mono text-[#888]">
                  {m.targetSize ? m.targetSize.toLocaleString() : '—'}
                </td>
                <td className="py-3 px-4 text-right text-xs text-[#888]">
                  {formatDate(m.startDate)} – {formatDate(m.endDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {topLiq.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No liquidity programs found.</p>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: Kalshi Trade API (incentive_programs)&ensp;·&ensp;
        updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
