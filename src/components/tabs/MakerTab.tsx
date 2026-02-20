'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import { SWR_CONFIG, fetcher, formatRelative, formatCompact, addr } from './shared';

interface DailyTotal {
  date: string;
  totalUsdc: number;
  transfers: number;
  receivers: number;
}

interface TopReceiver {
  address: string;
  amount1d: number;
  amount7d: number;
  amountAll: number;
  pct1d: number;
}

interface MakerRebatesSnapshot {
  dailyTotals: DailyTotal[];
  topReceivers: TopReceiver[];
  overall: {
    total1d: number;
    total7d: number;
    totalAll: number;
    totalReceivers: number;
    totalTransfers: number;
    avgDaily: number;
  };
  fetchedAt: string;
  fromBlock: number;
  toBlock: number;
}

type TimeRange = '7d' | '30d' | 'all';

function filterDays(totals: DailyTotal[], range: TimeRange): DailyTotal[] {
  if (range === 'all') return totals;
  const now = new Date();
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return totals.filter(d => d.date >= cutoffStr);
}

function BarChart({ data }: { data: DailyTotal[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.totalUsdc));

  return (
    <div className="flex items-end gap-px h-40 w-full">
      {data.map(d => {
        const pct = max > 0 ? (d.totalUsdc / max) * 100 : 0;
        return (
          <div
            key={d.date}
            className="flex-1 bg-white hover:bg-[#aaa] transition-colors group relative"
            style={{ height: `${Math.max(pct, 1)}%` }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[#111] border border-[#333] px-2 py-1 text-xs font-mono whitespace-nowrap z-10">
              {d.date}: {formatCompact(d.totalUsdc)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MakerTab() {
  const { data, error, isLoading, mutate } = useSWR<MakerRebatesSnapshot>(
    '/api/maker-rebates',
    fetcher,
    SWR_CONFIG,
  );
  const [range, setRange] = useState<TimeRange>('30d');

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="maker rebates" />;

  const { overall, topReceivers, dailyTotals } = data;
  const chartData = filterDays(dailyTotals, range);

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Daily Maker Rebates (On-Chain)
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCompact(overall.total1d)}
          <span className="text-2xl md:text-3xl text-[#555] font-normal">/day</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {overall.totalReceivers.toLocaleString()} receivers&ensp;·&ensp;
          {formatCompact(overall.total7d)} 7d&ensp;·&ensp;
          {formatCompact(overall.totalAll)} all time&ensp;·&ensp;
          updated {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Today" value={formatCompact(overall.total1d)} />
        <Stat label="7-Day Total" value={formatCompact(overall.total7d)} border />
        <Stat label="Avg Daily" value={formatCompact(overall.avgDaily)} border />
        <Stat label="All Time" value={formatCompact(overall.totalAll)} border />
      </div>

      <div className="border border-[#333] mb-14 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">Rebates Over Time</p>
          <div className="flex gap-2">
            {(['7d', '30d', 'all'] as TimeRange[]).map(r => (
              <button
                key={r}
                className={`text-xs px-3 py-1 border transition-colors ${
                  range === r
                    ? 'border-white text-white'
                    : 'border-[#333] text-[#555] hover:text-white hover:border-white'
                }`}
                onClick={() => setRange(r)}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={chartData} />
        {chartData.length > 0 && (
          <div className="flex justify-between text-[10px] text-[#555] font-mono mt-2">
            <span>{chartData[0].date}</span>
            <span>{chartData[chartData.length - 1].date}</span>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Top Receivers ({topReceivers.length})
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
              <th className="py-3 px-5 pr-4">#</th>
              <th className="py-3 px-4">Address</th>
              <th className="py-3 px-4 text-right">1d</th>
              <th className="py-3 px-4 text-right">7d</th>
              <th className="py-3 px-4 text-right">All Time</th>
              <th className="py-3 px-4 text-right">% 1d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {topReceivers.map((r, i) => (
              <tr key={r.address} className="hover:bg-[#0a0a0a] transition-colors">
                <td className="py-3 px-5 pr-4 font-mono text-[#555] text-xs">{i + 1}</td>
                <td className="py-3 px-4">
                  <a
                    href={`https://polygonscan.com/address/${r.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs hover:underline"
                  >
                    {addr(r.address)}
                  </a>
                </td>
                <td className="py-3 px-4 text-right font-mono">{formatCompact(r.amount1d)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatCompact(r.amount7d)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatCompact(r.amountAll)}</td>
                <td className="py-3 px-4 text-right font-mono text-xs text-[#555]">
                  {r.pct1d > 0 ? `${r.pct1d}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {topReceivers.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No rebate distributions found.</p>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: On-chain USDC.e Transfer events from Polymarket fee distributor&ensp;·&ensp;
        Blocks {data.fromBlock.toLocaleString()} – {data.toBlock.toLocaleString()}&ensp;·&ensp;
        updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
