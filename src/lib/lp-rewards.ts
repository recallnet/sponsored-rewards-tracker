/**
 * LP rewards fetcher for Polymarket.
 *
 * Primary source: CLOB API (clob.polymarket.com/rewards/markets/current)
 * which returns all markets with reward configs and total_daily_rate,
 * paginated by cursor.
 *
 * Enriches with Gamma API for market names, slugs, liquidity, and volume.
 */

const CLOB_BASE = 'https://clob.polymarket.com';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const REQUEST_TIMEOUT_MS = 10_000;
const GAMMA_BATCH_SIZE = 50;
const MAX_REWARD_PAGES = 20;

/* ─────── types ─────── */

export interface LpRewardMarket {
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

export interface LpRewardsSnapshot {
  markets: LpRewardMarket[];
  overall: {
    totalMarkets: number;
    totalDailyRewards: number;
    totalLiquidity: number;
    avgDailyRate: number;
    medianDailyRate: number;
    avgMaxSpread: number;
    avgMinSize: number;
  };
  fetchedAt: string;
}

/* ─────── CLOB Rewards API ─────── */

interface RewardConfig {
  rate_per_day?: number;
  start_date?: string;
  end_date?: string;
}

interface RewardRow {
  condition_id?: string;
  conditionId?: string;
  rewards_config?: RewardConfig[];
  rewards_max_spread?: number;
  rewards_min_size?: number;
  total_daily_rate?: number;
  native_daily_rate?: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function rowDailyRate(row: RewardRow): number {
  return toNumber(row.total_daily_rate)
    || toNumber(row.native_daily_rate)
    || toNumber(row.rewards_config?.[0]?.rate_per_day)
    || 0;
}

async function fetchClobRewardPages(): Promise<RewardRow[]> {
  const byId = new Map<string, RewardRow>();
  let cursor: string | undefined = undefined;

  for (let page = 0; page < MAX_REWARD_PAGES; page++) {
    const params = cursor ? `?next_cursor=${cursor}` : '';
    const url = `${CLOB_BASE}/rewards/markets/current${params}`;
    let res: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) break;
        res = null;
      } catch { res = null; }
    }
    if (!res) break;

    const payload = (await res.json()) as {
      data?: RewardRow[];
      next_cursor?: string;
      nextCursor?: string;
    };

    const rows = payload.data ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const id = row.condition_id ?? row.conditionId ?? '';
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev || rowDailyRate(row) > rowDailyRate(prev)) {
        byId.set(id, row);
      }
    }

    const next = payload.next_cursor ?? payload.nextCursor;
    if (!next || next === 'LTE=' || next === cursor) break;
    cursor = next;
  }

  return Array.from(byId.values()).sort((a, b) => rowDailyRate(b) - rowDailyRate(a));
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
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
}

async function fetchGammaBatch(batch: string[]): Promise<GammaMarket[]> {
  const qs = batch.map(id => `condition_ids=${id}`).join('&');
  try {
    const res = await fetch(
      `${GAMMA_BASE}/markets?${qs}&limit=${batch.length}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!res.ok) return [];
    return (await res.json()) as GammaMarket[];
  } catch { return []; }
}

async function enrichWithGamma(conditionIds: string[]): Promise<Map<string, GammaMarket>> {
  const map = new Map<string, GammaMarket>();
  const batches: string[][] = [];

  for (let i = 0; i < conditionIds.length; i += GAMMA_BATCH_SIZE) {
    batches.push(conditionIds.slice(i, i + GAMMA_BATCH_SIZE));
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(fetchGammaBatch));
    for (const markets of results) {
      for (const m of markets) {
        if (m.conditionId) map.set(m.conditionId, m);
      }
    }
  }

  return map;
}

/* ─────── assemble ─────── */

function buildMarket(row: RewardRow, gamma?: GammaMarket): LpRewardMarket {
  const config = row.rewards_config?.[0];
  const id = row.condition_id ?? row.conditionId ?? '';

  return {
    conditionId: id,
    question: gamma?.question ?? id.slice(0, 18) + '...',
    eventSlug: gamma?.events?.[0]?.slug,
    dailyRate: rowDailyRate(row),
    maxSpread: toNumber(row.rewards_max_spread) || toNumber(gamma?.rewardsMaxSpread) || 0,
    minSize: toNumber(row.rewards_min_size) || toNumber(gamma?.rewardsMinSize) || 0,
    rewardStartDate: config?.start_date,
    rewardEndDate: config?.end_date,
    liquidity: toNumber(gamma?.liquidityNum ?? gamma?.liquidity),
    volume24h: toNumber(gamma?.volume24hr),
    spread: toNumber(gamma?.spread),
    bestBid: toNumber(gamma?.bestBid),
    bestAsk: toNumber(gamma?.bestAsk),
    lastTradePrice: toNumber(gamma?.lastTradePrice),
    endDate: gamma?.endDate,
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

  const rows = await fetchClobRewardPages();
  const conditionIds = rows
    .map(r => r.condition_id ?? r.conditionId ?? '')
    .filter(Boolean);

  const gammaMap = await enrichWithGamma(conditionIds);

  const markets = rows
    .filter(r => rowDailyRate(r) > 0)
    .map(r => buildMarket(r, gammaMap.get(r.condition_id ?? r.conditionId ?? '')))
    .sort((a, b) => b.dailyRate - a.dailyRate);

  const rates = markets.map(m => m.dailyRate).sort((a, b) => a - b);
  const totalDaily = rates.reduce((s, r) => s + r, 0);
  const totalLiquidity = markets.reduce((s, m) => s + m.liquidity, 0);
  const median = rates.length > 0 ? rates[Math.floor(rates.length / 2)] : 0;

  const snapshot: LpRewardsSnapshot = {
    markets,
    overall: {
      totalMarkets: markets.length,
      totalDailyRewards: totalDaily,
      totalLiquidity,
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
