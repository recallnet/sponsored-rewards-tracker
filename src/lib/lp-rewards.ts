/**
 * LP rewards fetcher for Polymarket.
 *
 * Pulls reward-eligible markets from the CLOB rewards endpoint,
 * then enriches each with market metadata (question, slug, liquidity,
 * volume) from the Gamma API.
 */

const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const REQUEST_TIMEOUT_MS = 12_000;
const GAMMA_BATCH_SIZE = 50;

/* ─────── types ─────── */

export interface LpRewardMarket {
  conditionId: string;
  question: string;
  eventSlug?: string;
  dailyRate: number;
  nativeDailyRate: number;
  sponsoredDailyRate: number;
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
  outcomes?: string;
  outcomePrices?: string;
}

export interface LpRewardsSnapshot {
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

/* ─────── CLOB rewards fetcher ─────── */

interface ClobRewardConfig {
  asset_address: string;
  start_date: string;
  end_date: string;
  rate_per_day: number;
  total_rewards: number;
  id: number;
}

interface ClobRewardEntry {
  condition_id: string;
  rewards_config: ClobRewardConfig[];
  rewards_max_spread: number;
  rewards_min_size: number;
  native_daily_rate: number;
  total_daily_rate: number;
}

interface ClobRewardsResponse {
  data: ClobRewardEntry[];
  next_cursor?: string;
  limit: number;
  count: number;
}

async function fetchAllClobRewards(): Promise<ClobRewardEntry[]> {
  const all: ClobRewardEntry[] = [];
  let cursor: string | undefined = undefined;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams();
    if (cursor) params.set('next_cursor', cursor);
    const url = `${CLOB_BASE}/rewards/markets/current${params.toString() ? '?' + params.toString() : ''}`;

    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`CLOB rewards fetch failed (${res.status})`);

    const payload = (await res.json()) as ClobRewardsResponse;
    all.push(...payload.data);

    if (!payload.next_cursor || payload.data.length === 0) break;
    cursor = payload.next_cursor;
  }

  return all;
}

/* ─────── Gamma enrichment ─────── */

interface GammaMarket {
  conditionId?: string;
  question?: string;
  slug?: string;
  events?: { slug?: string }[];
  liquidity?: string | number;
  liquidityNum?: number;
  volume24hr?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
}

async function enrichWithGamma(
  entries: ClobRewardEntry[]
): Promise<Map<string, GammaMarket>> {
  const conditionIds = entries.map(e => e.condition_id);
  const map = new Map<string, GammaMarket>();

  for (let i = 0; i < conditionIds.length; i += GAMMA_BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + GAMMA_BATCH_SIZE);
    const qs = batch.map(id => `condition_ids=${id}`).join('&');
    try {
      const res = await fetch(
        `${GAMMA_BASE}/markets?${qs}&limit=${batch.length}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
      );
      if (!res.ok) continue;
      const markets = (await res.json()) as GammaMarket[];
      for (const m of markets) {
        if (m.conditionId) map.set(m.conditionId, m);
      }
    } catch {
      /* best-effort */
    }
  }

  return map;
}

/* ─────── assemble ─────── */

function buildMarket(entry: ClobRewardEntry, gamma?: GammaMarket): LpRewardMarket {
  const config = entry.rewards_config[0];
  const sponsoredRate = entry.total_daily_rate - entry.native_daily_rate;

  return {
    conditionId: entry.condition_id,
    question: gamma?.question ?? entry.condition_id.slice(0, 18) + '...',
    eventSlug: gamma?.events?.[0]?.slug,
    dailyRate: entry.total_daily_rate,
    nativeDailyRate: entry.native_daily_rate,
    sponsoredDailyRate: sponsoredRate > 0 ? sponsoredRate : 0,
    maxSpread: entry.rewards_max_spread,
    minSize: entry.rewards_min_size,
    rewardStartDate: config?.start_date,
    rewardEndDate: config?.end_date,
    liquidity: Number(gamma?.liquidityNum ?? gamma?.liquidity ?? 0),
    volume24h: gamma?.volume24hr ?? 0,
    spread: gamma?.spread ?? 0,
    bestBid: gamma?.bestBid ?? 0,
    bestAsk: gamma?.bestAsk ?? 0,
    lastTradePrice: gamma?.lastTradePrice ?? 0,
    endDate: gamma?.endDate,
    outcomes: gamma?.outcomes,
    outcomePrices: gamma?.outcomePrices,
  };
}

/* ─────── cache ─────── */

declare global {
  // eslint-disable-next-line no-var
  var __lpRewardsSnapshot: LpRewardsSnapshot | undefined;
}

const STALE_MS = 5 * 60 * 1000;

export async function fetchLpRewards(force = false): Promise<LpRewardsSnapshot> {
  const cached = globalThis.__lpRewardsSnapshot;
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_MS) return cached;
  }

  const entries = await fetchAllClobRewards();
  const gammaMap = await enrichWithGamma(entries);

  const markets = entries
    .filter(e => e.total_daily_rate > 0)
    .map(e => buildMarket(e, gammaMap.get(e.condition_id)))
    .sort((a, b) => b.dailyRate - a.dailyRate);

  const rates = markets.map(m => m.dailyRate).sort((a, b) => a - b);
  const totalDaily = rates.reduce((s, r) => s + r, 0);
  const median = rates.length > 0 ? rates[Math.floor(rates.length / 2)] : 0;

  const snapshot: LpRewardsSnapshot = {
    markets,
    overall: {
      totalMarkets: markets.length,
      totalDailyRewards: totalDaily,
      avgDailyRate: markets.length > 0 ? totalDaily / markets.length : 0,
      medianDailyRate: median,
      avgMaxSpread: markets.length > 0
        ? markets.reduce((s, m) => s + m.maxSpread, 0) / markets.length
        : 0,
      avgMinSize: markets.length > 0
        ? markets.reduce((s, m) => s + m.minSize, 0) / markets.length
        : 0,
    },
    fetchedAt: new Date().toISOString(),
  };

  globalThis.__lpRewardsSnapshot = snapshot;
  return snapshot;
}
