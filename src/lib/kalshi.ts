const BASE = 'https://api.elections.kalshi.com/trade-api/v2';

interface RawIncentiveProgram {
  id: string;
  market_id: string;
  market_ticker: string;
  incentive_type: 'volume' | 'liquidity';
  start_date: string;
  end_date: string;
  period_reward: number;
  paid_out: boolean;
  discount_factor_bps: number | null;
  target_size: number | null;
  target_size_fp: string | null;
}

interface RawResponse {
  incentive_programs: RawIncentiveProgram[];
  next_cursor?: string;
}

async function fetchPrograms(status: string, type: string): Promise<RawIncentiveProgram[]> {
  const all: RawIncentiveProgram[] = [];
  let cursor = '';
  for (let i = 0; i < 30; i++) {
    const params = new URLSearchParams({ status, type, limit: '5000' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${BASE}/incentive_programs?${params}`, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Kalshi API ${res.status}`);
    const data: RawResponse = await res.json();
    all.push(...data.incentive_programs);
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}

function centicentsToUsd(cc: number): number {
  return cc / 10_000;
}

export interface IncentiveSummary {
  totalPrograms: number;
  totalRewardUsd: number;
  volumePrograms: number;
  volumeRewardUsd: number;
  liquidityPrograms: number;
  liquidityRewardUsd: number;
}

export interface MarketIncentive {
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

export interface KalshiIncentivesSnapshot {
  active: IncentiveSummary;
  paidOut: IncentiveSummary;
  closed: IncentiveSummary;
  grandTotalUsd: number;
  activeMarkets: MarketIncentive[];
  topPaidOutMarkets: MarketIncentive[];
  recentPayouts: MarketIncentive[];
  fetchedAt: string;
}

function summarize(programs: RawIncentiveProgram[]): IncentiveSummary {
  const vol = programs.filter(p => p.incentive_type === 'volume');
  const liq = programs.filter(p => p.incentive_type === 'liquidity');
  return {
    totalPrograms: programs.length,
    totalRewardUsd: centicentsToUsd(programs.reduce((s, p) => s + p.period_reward, 0)),
    volumePrograms: vol.length,
    volumeRewardUsd: centicentsToUsd(vol.reduce((s, p) => s + p.period_reward, 0)),
    liquidityPrograms: liq.length,
    liquidityRewardUsd: centicentsToUsd(liq.reduce((s, p) => s + p.period_reward, 0)),
  };
}

interface MarketInfo {
  title: string;
  eventTicker: string;
}

const titleCache = new Map<string, MarketInfo>();

async function fetchMarketInfo(ticker: string): Promise<MarketInfo | null> {
  const cached = titleCache.get(ticker);
  if (cached) return cached;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/markets/${ticker}`, { next: { revalidate: 0 } });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) break;
      const data = await res.json();
      const m = data.market ?? data;
      const info: MarketInfo = {
        title: m.title || ticker,
        eventTicker: m.event_ticker || ticker,
      };
      titleCache.set(ticker, info);
      return info;
    } catch {
      break;
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function resolveMarketTitles(tickers: string[]): Promise<void> {
  const unresolved = [...new Set(tickers)].filter(t => !titleCache.has(t));
  const BATCH = 10;
  for (let i = 0; i < unresolved.length; i += BATCH) {
    const results = await Promise.all(unresolved.slice(i, i + BATCH).map(fetchMarketInfo));
    const failures = results.filter(r => r === null).length;
    if (failures > 0 && i + BATCH < unresolved.length) await sleep(500);
  }
}

function tickerFallback(ticker: string): string {
  return ticker.replace(/^KX/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toMarketIncentive(p: RawIncentiveProgram): MarketIncentive {
  const cached = titleCache.get(p.market_ticker);
  const info = cached ?? { title: tickerFallback(p.market_ticker), eventTicker: p.market_ticker };
  return {
    marketTicker: p.market_ticker,
    title: info.title,
    eventTicker: info.eventTicker,
    type: p.incentive_type,
    rewardUsd: centicentsToUsd(p.period_reward),
    startDate: p.start_date,
    endDate: p.end_date,
    targetSize: p.target_size,
    discountBps: p.discount_factor_bps,
  };
}

let cache: { data: KalshiIncentivesSnapshot; ts: number } | null = null;
const STALE_MS = 2 * 60 * 1000;

export async function fetchKalshiIncentives(force = false): Promise<KalshiIncentivesSnapshot> {
  if (!force && cache && Date.now() - cache.ts < STALE_MS) {
    return cache.data;
  }

  const [activeRaw, paidOutRaw, closedRaw] = await Promise.all([
    fetchPrograms('active', 'all'),
    fetchPrograms('paid_out', 'all'),
    fetchPrograms('closed', 'all'),
  ]);

  const active = summarize(activeRaw);
  const paidOut = summarize(paidOutRaw);
  const closed = summarize(closedRaw);

  const byRewardDesc = (a: RawIncentiveProgram, b: RawIncentiveProgram) => b.period_reward - a.period_reward;
  const topPerType = (programs: RawIncentiveProgram[], n: number) => [
    ...programs.filter(p => p.incentive_type === 'volume').sort(byRewardDesc).slice(0, n),
    ...programs.filter(p => p.incentive_type === 'liquidity').sort(byRewardDesc).slice(0, n),
  ];

  const activeSlice = topPerType(activeRaw, 50);
  const topPaidSlice = topPerType(paidOutRaw, 30);
  const recentSlice = [...paidOutRaw]
    .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
    .slice(0, 30);

  const allTickers = [
    ...activeSlice.map(p => p.market_ticker),
    ...topPaidSlice.map(p => p.market_ticker),
    ...recentSlice.map(p => p.market_ticker),
  ];
  await resolveMarketTitles(allTickers);

  const activeMarkets = activeSlice.map(toMarketIncentive);
  const topPaidOutMarkets = topPaidSlice.map(toMarketIncentive);
  const recentPayouts = recentSlice.map(toMarketIncentive);

  const snapshot: KalshiIncentivesSnapshot = {
    active,
    paidOut,
    closed,
    grandTotalUsd: active.totalRewardUsd + paidOut.totalRewardUsd + closed.totalRewardUsd,
    activeMarkets,
    topPaidOutMarkets,
    recentPayouts,
    fetchedAt: new Date().toISOString(),
  };

  cache = { data: snapshot, ts: Date.now() };
  return snapshot;
}
