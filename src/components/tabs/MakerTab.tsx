'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import { SWR_CONFIG, fetcher, formatRelative, formatCompact } from './shared';

interface MakerRebateSeries {
  slug: string;
  title: string;
  asset: string;
  interval: string;
  feeType: string;
  feeParams: { feeRate: number; exponent: number; rebatePct: number };
  volume24hr: number;
  liquidity: number;
  activeEvents: number;
  estimatedDailyFees: number;
  estimatedDailyRebates: number;
}

interface MakerRebatesSnapshot {
  series: MakerRebateSeries[];
  overall: {
    totalSeries: number;
    totalVolume24hr: number;
    totalLiquidity: number;
    estimatedDailyFees: number;
    estimatedDailyRebates: number;
    activeEvents: number;
  };
  feeInfo: {
    cryptoMaxEffRate: string;
    sportsMaxEffRate: string;
    cryptoRebatePct: string;
    sportsRebatePct: string;
  };
  fetchedAt: string;
}

export default function MakerTab() {
  const { data, error, isLoading, mutate } = useSWR<MakerRebatesSnapshot>(
    '/api/maker-rebates',
    fetcher,
    SWR_CONFIG,
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="maker rebates" />;

  const { overall, series, feeInfo } = data;

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Estimated Daily Maker Rebates
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCompact(overall.estimatedDailyRebates)}
          <span className="text-2xl md:text-3xl text-[#555] font-normal">/day</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {overall.totalSeries} series&ensp;·&ensp;
          {formatCompact(overall.totalVolume24hr)} 24h vol&ensp;·&ensp;
          {formatCompact(overall.estimatedDailyFees)} in fees&ensp;·&ensp;
          updated {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="24h Volume" value={formatCompact(overall.totalVolume24hr)} />
        <Stat label="Est. Daily Fees" value={formatCompact(overall.estimatedDailyFees)} border />
        <Stat label="Liquidity" value={formatCompact(overall.totalLiquidity)} border />
        <Stat label="Active Events" value={overall.activeEvents.toLocaleString()} border />
      </div>

      <div className="border border-[#333] mb-14 p-5">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-4">Fee Parameters</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm font-mono">
          <div>
            <p className="text-[#555] text-xs mb-1">Crypto Max Fee</p>
            <p>{feeInfo.cryptoMaxEffRate} at 50¢</p>
          </div>
          <div>
            <p className="text-[#555] text-xs mb-1">Sports Max Fee</p>
            <p>{feeInfo.sportsMaxEffRate} at 50¢</p>
          </div>
          <div>
            <p className="text-[#555] text-xs mb-1">Crypto Rebate</p>
            <p>{feeInfo.cryptoRebatePct} of fees</p>
          </div>
          <div>
            <p className="text-[#555] text-xs mb-1">Sports Rebate</p>
            <p>{feeInfo.sportsRebatePct} of fees</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Eligible Series ({series.length})
        </p>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/maker-rebates?force=1'), { revalidate: false })}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto border border-[#333]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
              <th className="py-3 px-5 pr-4">Series</th>
              <th className="py-3 px-4 text-right">24h Volume</th>
              <th className="py-3 px-4 text-right">Liquidity</th>
              <th className="py-3 px-4 text-right">Est. Rebates</th>
              <th className="py-3 px-4 text-right">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {series.map(s => {
              const isOpen = expanded === s.slug;
              return (
                <Fragment key={s.slug}>
                  <tr
                    className="hover:bg-[#0a0a0a] cursor-pointer transition-colors"
                    onClick={() => setExpanded(p => (p === s.slug ? null : s.slug))}
                  >
                    <td className="py-3 px-5 pr-4">
                      <span className="font-mono text-xs text-[#999] mr-2">{s.asset}</span>
                      {s.title}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCompact(s.volume24hr)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCompact(s.liquidity)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCompact(s.estimatedDailyRebates)}/d</td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-[#555]">{s.interval}</td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-[#080808]">
                      <td colSpan={5} className="px-5 py-4 text-[#999]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                          <div>
                            <span className="text-[#555]">Fee Type</span>
                            <p>{s.feeType || 'crypto'}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Fee Rate</span>
                            <p>{s.feeParams.feeRate}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Exponent</span>
                            <p>{s.feeParams.exponent}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Rebate %</span>
                            <p>{(s.feeParams.rebatePct * 100).toFixed(0)}%</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Est. Daily Fees</span>
                            <p>{formatCompact(s.estimatedDailyFees)}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Active Events</span>
                            <p>{s.activeEvents}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Interval</span>
                            <p>{s.interval}</p>
                          </div>
                          <div>
                            <span className="text-[#555]">Asset</span>
                            <p>{s.asset}</p>
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

        {series.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No eligible maker rebate series found.</p>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: Gamma API series data&ensp;·&ensp;
        Estimates based on fee curve model (actual rebates may differ)&ensp;·&ensp;
        updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
