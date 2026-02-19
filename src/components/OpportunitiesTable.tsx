'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { formatCurrency } from '@/lib/utils';

interface SponsoredEvent {
  marketId: string;
  sponsor: string;
  amountUsdc: number;
  startTime: string;
  endTime: string;
  durationDays: number;
  ratePerDayUsdc: number;
  txHash: string;
  blockNumber: number;
  marketQuestion?: string;
  marketSlug?: string;
  eventSlug?: string;
  withdrawn: boolean;
  returnedUsdc: number;
  consumedUsdc: number;
}

interface SponsoredOverall {
  totalEvents: number;
  uniqueSponsors: number;
  uniqueMarkets: number;
  totalAmountUsdc: number;
  netAmountUsdc: number;
  totalReturnedUsdc: number;
  totalConsumedUsdc: number;
}

interface SponsoredSnapshot {
  events: SponsoredEvent[];
  overall: SponsoredOverall;
  fetchedAt: string;
  fromBlock: number;
  toBlock: number;
}

const PAGE_SIZE = 50;

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text().catch(() => `${res.status}`));
  return res.json() as Promise<T>;
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatTimeLeft(iso?: string): string {
  if (!iso) return '--';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.ceil(ms / 60_000);
  return `${mins}m`;
}

function addr(a: string): string {
  return a.length <= 12 ? a : `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function marketUrl(event: SponsoredEvent): string | null {
  if (event.eventSlug) return `https://polymarket.com/event/${event.eventSlug}`;
  return null;
}

export function OpportunitiesTable() {
  const { data, error, isLoading, mutate } = useSWR<SponsoredSnapshot>('/api/sponsored', fetcher, {
    refreshInterval: 30_000,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 bg-[#111]" />
        <div className="h-10 bg-[#111] w-2/3" />
        <div className="space-y-2 mt-8">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 bg-[#111]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border border-[#333] p-6">
        <p className="text-sm">Failed to load sponsored rewards.</p>
        <p className="text-xs text-[#555] mt-1">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const { overall, events } = data;
  const active = events
    .filter(e => !e.withdrawn && new Date(e.endTime) > new Date())
    .sort((a, b) => b.amountUsdc - a.amountUsdc);

  const totalPages = Math.ceil(active.length / PAGE_SIZE);
  const visible = active.slice(0, page * PAGE_SIZE);
  const hasMore = page < totalPages;

  const sponsorMap = new Map<string, { net: number; markets: Set<string> }>();
  for (const ev of events) {
    const k = ev.sponsor.toLowerCase();
    const e = sponsorMap.get(k) ?? { net: 0, markets: new Set() };
    e.net += ev.amountUsdc - ev.returnedUsdc;
    e.markets.add(ev.marketId);
    sponsorMap.set(k, e);
  }
  const topSponsors = [...sponsorMap.entries()]
    .map(([a, v]) => ({ address: a, net: v.net, count: v.markets.size }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 6);

  return (
    <div>
      {/* ─── hero ─── */}
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Total Sponsored Rewards
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          {formatCurrency(overall.totalAmountUsdc)}
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          {overall.totalEvents.toLocaleString()} events&ensp;·&ensp;
          {overall.uniqueMarkets.toLocaleString()} markets&ensp;·&ensp;
          {overall.uniqueSponsors.toLocaleString()} sponsors&ensp;·&ensp; updated{' '}
          {formatRelative(data.fetchedAt)}
        </p>
      </div>

      {/* ─── stats grid ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Net Amount" value={formatCurrency(overall.netAmountUsdc)} />
        <Stat label="Returned" value={formatCurrency(overall.totalReturnedUsdc)} border />
        <Stat label="Consumed" value={formatCurrency(overall.totalConsumedUsdc)} border />
        <Stat label="Active Now" value={`${active.length}`} border />
      </div>

      {/* ─── markets table ─── */}
      <div className="mb-4 flex items-end justify-between">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555]">
          Active Markets ({active.length})
        </p>
        <button
          className="text-xs text-[#555] border border-[#333] px-3 py-1.5 hover:text-white hover:border-white transition-colors"
          onClick={() => mutate(fetcher('/api/sponsored?force=1'), { revalidate: false })}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto border border-[#333]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-[#555] uppercase tracking-wider border-b border-[#333]">
              <th className="py-3 px-5 pr-4">Market</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-right">Rate</th>
              <th className="py-3 px-4 text-right">Time Left</th>
              <th className="py-3 px-4 text-right">Sponsor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {visible.map(r => {
              const isOpen = expanded === r.txHash;
              const timeLeft = formatTimeLeft(r.endTime);
              const pct =
                r.amountUsdc > 0 ? ((r.consumedUsdc / r.amountUsdc) * 100).toFixed(1) : '0';
              const url = marketUrl(r);

              return (
                <Fragment key={r.txHash}>
                  <tr
                    className="hover:bg-[#0a0a0a] cursor-pointer transition-colors"
                    onClick={() => setExpanded(p => (p === r.txHash ? null : r.txHash))}
                  >
                    <td className="py-3 px-5 pr-4">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {r.marketQuestion || r.marketId.slice(0, 28) + '...'}
                        </a>
                      ) : (
                        <span>{r.marketQuestion || r.marketId.slice(0, 28) + '...'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(r.amountUsdc)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(r.ratePerDayUsdc)}/d
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{timeLeft}</td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={`https://polymarket.com/profile/${r.sponsor}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {addr(r.sponsor)}
                      </a>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-[#080808]">
                      <td colSpan={5} className="px-5 py-4 text-[#999]">
                        <div className="space-y-1 text-xs font-mono">
                          <p>
                            Deposited {formatCurrency(r.amountUsdc)}
                            {r.consumedUsdc > 0 &&
                              ` — consumed ${formatCurrency(r.consumedUsdc)} (${pct}%)`}
                          </p>
                          {r.returnedUsdc > 0 && <p>Returned {formatCurrency(r.returnedUsdc)}</p>}
                          <p>
                            {new Date(r.startTime).toLocaleDateString()} →{' '}
                            {new Date(r.endTime).toLocaleDateString()} ({r.durationDays}d total,{' '}
                            {timeLeft} remaining)
                          </p>
                          <p>
                            tx{' '}
                            <a
                              href={`https://polygonscan.com/tx/${r.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              {r.txHash.slice(0, 22)}…
                            </a>
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {active.length === 0 && (
          <p className="text-center text-[#555] py-8 text-sm">No active sponsored rewards.</p>
        )}

        {hasMore && (
          <div className="border-t border-[#333] px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-[#555] font-mono">
              Showing {visible.length} of {active.length}
            </p>
            <button
              className="text-xs border border-[#333] px-4 py-1.5 hover:text-white hover:border-white transition-colors text-[#999]"
              onClick={() => setPage(p => p + 1)}
            >
              Load more
            </button>
          </div>
        )}

        {!hasMore && active.length > PAGE_SIZE && (
          <div className="border-t border-[#333] px-5 py-3">
            <p className="text-xs text-[#555] font-mono">Showing all {active.length} markets</p>
          </div>
        )}
      </div>

      {/* ─── top sponsors ─── */}
      {topSponsors.length > 0 && (
        <div className="mt-14">
          <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-4">Top Sponsors</p>
          <div className="border border-[#333] divide-y divide-[#333]">
            {topSponsors.map(s => (
              <div
                key={s.address}
                className="flex items-center justify-between px-5 py-3 hover:bg-[#0a0a0a] transition-colors"
              >
                <a
                  href={`https://polymarket.com/profile/${s.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm hover:underline"
                >
                  {addr(s.address)}
                </a>
                <div className="flex items-center gap-8 text-sm">
                  <span className="font-mono">{formatCurrency(s.net)}</span>
                  <span className="text-[#555] tabular-nums">
                    {s.count} market{s.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── footer ─── */}
      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Polygon blocks {data.fromBlock.toLocaleString()} → {data.toBlock.toLocaleString()}
        &ensp;·&ensp;updated {new Date(data.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}

function Stat({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={`px-5 py-4 ${border ? 'border-l border-[#333]' : ''}`}>
      <p className="text-[11px] text-[#555] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-mono font-bold">{value}</p>
    </div>
  );
}
