'use client';

import useSWR from 'swr';
import { Skeleton, ErrorBlock, Stat } from '../OpportunitiesTable';
import { SWR_CONFIG, fetcher, formatRelative, formatCompact } from './shared';

interface SeasonData {
  name: string;
  totalPoints: number;
  periods: { start: string; end: string; points: number }[];
  status: 'completed' | 'active' | 'upcoming';
}

interface PointsLeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  weeklyPoints: number;
  totalPoints: number;
  rankName: string;
}

interface LimitlessPointsSnapshot {
  allTimeTotal: number;
  thisWeekTotal: number;
  dailyAverage: number;
  seasons: SeasonData[];
  currentSeason: string;
  topEarners: PointsLeaderboardEntry[];
  nextDistribution: string;
  fetchedAt: string;
}

function formatPoints(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function addr(a: string): string {
  return a.length <= 12 ? a : `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function useCountdown(target: string) {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return 'Processing...';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function LimitlessPointsTab() {
  const { data, error, isLoading, mutate } = useSWR<LimitlessPointsSnapshot>(
    '/api/limitless/points',
    fetcher,
    SWR_CONFIG,
  );

  const countdown = useCountdown(data?.nextDistribution ?? '');

  if (isLoading) return <Skeleton />;
  if (error || !data)
    return <ErrorBlock message={error instanceof Error ? error.message : undefined} label="Limitless points" />;

  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Total Points Distributed (All Time)
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatPoints(data.allTimeTotal)}
          <span className="text-2xl md:text-3xl text-[#555] font-normal"> pts</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {data.currentSeason} active&ensp;·&ensp;
          ~{formatPoints(data.dailyAverage)} pts/day&ensp;·&ensp;
          next distribution in {countdown}&ensp;·&ensp;
          updated {formatRelative(data.fetchedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="All Time" value={`${formatPoints(data.allTimeTotal)} pts`} />
        <Stat label="This Week" value={`${formatPoints(data.thisWeekTotal)} pts`} border />
        <Stat label="Daily Avg" value={`~${formatPoints(data.dailyAverage)} pts`} border />
        <Stat label="Current Season" value={data.currentSeason} border />
      </div>

      <div className="mb-4">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Season Breakdown
        </p>
      </div>

      <div className="overflow-x-auto border border-[#333] mb-14">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
              <th className="py-3 px-5">Season</th>
              <th className="py-3 px-4 text-right">Total Points</th>
              <th className="py-3 px-4 text-right">Months</th>
              <th className="py-3 px-4 text-right">% of Total</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {data.seasons.map(s => {
              const pct = data.allTimeTotal > 0 ? (s.totalPoints / data.allTimeTotal) * 100 : 0;
              return (
                <tr key={s.name} className="hover:bg-[#0a0a0a] transition-colors">
                  <td className="py-3 px-5 font-medium">{s.name}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatPoints(s.totalPoints)}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#888]">{s.periods.length}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#555]">{pct.toFixed(1)}%</td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 ${
                        s.status === 'active'
                          ? 'text-emerald-400 bg-emerald-400/10'
                          : 'text-[#555] bg-[#1a1a1a]'
                      }`}
                    >
                      {s.status === 'active' ? 'Active' : 'Completed'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.seasons.filter(s => s.status === 'active' && s.periods.length > 0).map(s => (
        <div key={s.name} className="border border-[#333] mb-14 p-5">
          <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
            {s.name} — Monthly Distribution
          </p>
          <div className="space-y-2">
            {s.periods.map((p, i) => {
              const maxPts = Math.max(...s.periods.map(pp => pp.points));
              const pct = maxPts > 0 ? (p.points / maxPts) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-[#888] font-mono w-32 shrink-0">
                    {formatDate(p.start)} – {formatDate(p.end)}
                  </span>
                  <div className="flex-1 bg-[#1a1a1a] h-5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full flex items-center px-2"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      <span className="text-[10px] font-mono text-white whitespace-nowrap">
                        {formatPoints(p.points)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Top Earners This Week ({data.topEarners.length})
        </p>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/limitless/points?force=1'), { revalidate: false })}
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
              <th className="py-3 px-4">Rank</th>
              <th className="py-3 px-4 text-right">This Week</th>
              <th className="py-3 px-4 text-right">All Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {data.topEarners.map((u, i) => (
              <tr key={u.address} className="hover:bg-[#0a0a0a] transition-colors">
                <td className="py-3 px-5 pr-4 font-mono text-[#555] text-xs">{i + 1}</td>
                <td className="py-3 px-4">
                  <a
                    href={`https://basescan.org/address/${u.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs hover:underline"
                  >
                    {addr(u.address)}
                  </a>
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs ${
                    u.rankName === 'Platinum' ? 'text-cyan-400' :
                    u.rankName === 'Gold' ? 'text-yellow-400' :
                    u.rankName === 'Silver' ? 'text-gray-300' : 'text-[#888]'
                  }`}>
                    {u.rankName}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono">{formatPoints(u.weeklyPoints)}</td>
                <td className="py-3 px-4 text-right font-mono text-[#888]">{formatPoints(u.totalPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.topEarners.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No leaderboard data available.</p>
        )}
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Source: Limitless Exchange Leaderboard API&ensp;·&ensp;
        Points distributed weekly (Mondays 12:00 UTC)&ensp;·&ensp;
        updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
