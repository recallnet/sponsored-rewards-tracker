export interface Opportunity {
  conditionId: string;
  question: string;
  eventSlug?: string;
  category?: string;
  marketEndAt?: string;
  rewardsEndAt?: string;
  liquidity?: number;
  volume24h?: number;
  spread?: number;
  midpoint?: number;
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  dailyRewardUsd?: number;
  rewardPoolUsd?: number;
  hasRewardProgram?: boolean;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  missingData: string[];
}

export type RewardType = 'lp' | 'sponsored';

export interface OpportunitiesSnapshot {
  opportunities: Opportunity[];
  fetchedAt: string;
  liveUpdatedAt?: string;
  source: 'gamma' | 'replay-fallback' | 'polymarket-rewards';
  scannedCount: number;
  notes?: string[];
  rewardCoveragePct?: number;
  gammaStrict?: boolean;
  rewardType?: RewardType;
}

const GAMMA_BASE_URL = process.env.GAMMA_BASE_URL ?? 'https://gamma-api.polymarket.com';
const POLYMARKET_BASE_URL = process.env.POLYMARKET_BASE_URL ?? 'https://polymarket.com';
const REPLAY_BASE_URL =
  process.env.REPLAY_BASE_URL ??
  process.env.REPLAY_LAB_URL ??
  'https://replay-lab-delta.preview.recall.network';

const REPLAY_API_KEY = process.env.REPLAY_API_KEY ?? '';
const STALE_AFTER_MS = 55 * 60 * 1000;
const LIVE_REFRESH_MS = 15 * 1000;
const LIVE_REFRESH_TOP_N = 60;
const REPLAY_SEARCH_LIMIT = 40;
const DATA_MODE =
  process.env.POLYMARKET_DATA_MODE ?? (process.env.VERCEL ? 'gamma-strict' : 'auto');
const POLYMARKET_REWARDS_MAX_PAGES = Number(process.env.POLYMARKET_REWARDS_MAX_PAGES ?? 250);

declare global {
  // eslint-disable-next-line no-var
  var __cheffOpportunitiesSnapshot: OpportunitiesSnapshot | undefined;
  // eslint-disable-next-line no-var
  var __cheffSponsoredSnapshot: OpportunitiesSnapshot | undefined;
  // eslint-disable-next-line no-var
  var __cheffLiveRefreshPromise: Promise<OpportunitiesSnapshot> | undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractRewardPool(value: Record<string, unknown>): number | undefined {
  const strictCandidates = [
    'rewardPoolUsd',
    'rewardsUsd',
    'dailyRewardsUsd',
    'rewardAmountUsd',
    'rewards',
    'rewardAmount',
    'rewardsAmount',
    'totalRewards',
    'liquidityRewards',
  ];
  for (const key of strictCandidates) {
    const v = value[key];
    if (typeof v === 'number' || typeof v === 'string') {
      const parsed = toNumber(v);
      if (parsed !== undefined && parsed > 0) return parsed;
    }
    if (typeof v === 'object' && v && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      for (const nested of ['usd', 'amount', 'value', 'total']) {
        const parsed = toNumber(obj[nested]);
        if (parsed !== undefined && parsed > 0) return parsed;
      }
    }
  }
  return undefined;
}

function firstNumberFromKeys(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = toNumber(value[key]);
    if (parsed !== undefined && parsed > 0) return parsed;
  }
  return undefined;
}

function firstIsoDateFromKeys(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw !== 'string' || !raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms)) return raw;
  }
  return undefined;
}

function extractRewardSignals(raw: Record<string, unknown>): {
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  dailyRewardUsd?: number;
  rewardPoolUsd?: number;
  rewardsEndAt?: string;
  hasRewardProgram: boolean;
} {
  const sources: Record<string, unknown>[] = [raw];
  const metadata = raw.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    sources.push(metadata as Record<string, unknown>);
  }

  let rewardsMinSize: number | undefined;
  let rewardsMaxSpread: number | undefined;
  let dailyRewardUsd: number | undefined;
  let rewardPoolUsd: number | undefined = extractRewardPool(raw);
  let rewardsEndAt: string | undefined;
  let hasRewardProgram = false;

  const minSizeKeys = [
    'rewardsMinSize',
    'min_incentive_size',
    'minIncentiveSize',
    'min_size',
    'minSize',
    'minimumSize',
    'minimum_order_size',
  ];
  const maxSpreadKeys = [
    'rewardsMaxSpread',
    'max_incentive_spread',
    'maxIncentiveSpread',
    'max_spread',
    'maxSpread',
  ];
  const poolKeys = [
    'rewardPoolUsd',
    'reward_pool_usd',
    'rewardsUsd',
    'dailyRewardsUsd',
    'reward_daily_rate',
    'rewardAmountUsd',
    'reward_amount_usd',
    'rewardAmount',
    'totalRewards',
  ];
  const dailyRateKeys = [
    'dailyRewardUsd',
    'daily_reward_usd',
    'rate_per_day',
    'reward_daily_rate',
    'daily_rate',
  ];
  const rewardEndKeys = [
    'rewardsEndAt',
    'reward_end_time',
    'reward_end_date',
    'incentive_end_time',
    'incentive_end_date',
    'end_date',
    'endDate',
    'expiresAt',
    'expires_at',
  ];

  for (const source of sources) {
    rewardsMinSize ??= firstNumberFromKeys(source, minSizeKeys);
    rewardsMaxSpread ??= firstNumberFromKeys(source, maxSpreadKeys);
    dailyRewardUsd ??= firstNumberFromKeys(source, dailyRateKeys);
    rewardPoolUsd ??= firstNumberFromKeys(source, poolKeys);
    rewardsEndAt ??= firstIsoDateFromKeys(source, rewardEndKeys);

    const rewardContainers = [
      source.rewards,
      source.incentives,
      source.liquidityRewards,
      source.rewardPrograms,
      source.rewards_config,
    ];

    for (const container of rewardContainers) {
      if (Array.isArray(container) && container.length > 0) {
        hasRewardProgram = true;
        for (const entry of container) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const obj = entry as Record<string, unknown>;
          rewardsMinSize ??= firstNumberFromKeys(obj, minSizeKeys);
          rewardsMaxSpread ??= firstNumberFromKeys(obj, maxSpreadKeys);
          dailyRewardUsd ??= firstNumberFromKeys(obj, dailyRateKeys);
          rewardPoolUsd ??= firstNumberFromKeys(obj, poolKeys);
          rewardsEndAt ??= firstIsoDateFromKeys(obj, rewardEndKeys);
        }
      } else if (container && typeof container === 'object' && !Array.isArray(container)) {
        hasRewardProgram = true;
        const obj = container as Record<string, unknown>;
        rewardsMinSize ??= firstNumberFromKeys(obj, minSizeKeys);
        rewardsMaxSpread ??= firstNumberFromKeys(obj, maxSpreadKeys);
        dailyRewardUsd ??= firstNumberFromKeys(obj, dailyRateKeys);
        rewardPoolUsd ??= firstNumberFromKeys(obj, poolKeys);
        rewardsEndAt ??= firstIsoDateFromKeys(obj, rewardEndKeys);
      }
    }
  }

  if (
    (rewardsMinSize ?? 0) > 0 ||
    (rewardsMaxSpread ?? 0) > 0 ||
    (dailyRewardUsd ?? 0) > 0 ||
    (rewardPoolUsd ?? 0) > 0
  ) {
    hasRewardProgram = true;
  }

  return {
    rewardsMinSize,
    rewardsMaxSpread,
    dailyRewardUsd,
    rewardPoolUsd,
    rewardsEndAt,
    hasRewardProgram,
  };
}

function buildOpportunity(raw: Record<string, unknown>): Opportunity {
  const metadata = (raw.metadata as Record<string, unknown> | undefined) ?? {};
  const question = (raw.question as string | undefined) ?? 'Untitled market';
  const conditionId =
    (raw.conditionId as string | undefined) ??
    (raw.condition_id as string | undefined) ??
    (raw.id as string | undefined) ??
    question;

  const liquidity = toNumber(raw.liquidity ?? raw.liquidityNum);
  const volume24h = toNumber(raw.volume24h ?? raw.volume24hr ?? raw.volume_24hr);
  const spread = toNumber(raw.spread);
  const midpoint = toNumber(raw.midpoint);
  const rewardSignals = extractRewardSignals(raw);
  const rewardsMinSize = rewardSignals.rewardsMinSize;
  const rewardsMaxSpread = rewardSignals.rewardsMaxSpread;
  const dailyRewardUsd = rewardSignals.dailyRewardUsd;
  const rewardPoolUsd = rewardSignals.rewardPoolUsd;
  const rewardsEndAt = rewardSignals.rewardsEndAt;
  const marketEndAt =
    firstIsoDateFromKeys(raw, [
      'marketEndAt',
      'endDate',
      'end_date',
      'end_time',
      'expirationTime',
      'expiresAt',
      'resolveBy',
    ]) ??
    firstIsoDateFromKeys(metadata, [
      'marketEndAt',
      'endDate',
      'end_date',
      'end_time',
      'expirationTime',
      'expiresAt',
      'resolveBy',
    ]);

  const reasons: string[] = [];
  const missingData: string[] = [];
  let score = 0;

  if (dailyRewardUsd !== undefined) {
    score += Math.min(45, Math.log10(Math.max(1, dailyRewardUsd)) * 16);
    reasons.push(`Daily reward ${dailyRewardUsd.toLocaleString()}`);
  } else {
    missingData.push('dailyRewardUsd');
  }

  if (rewardPoolUsd !== undefined) {
    score += Math.min(45, Math.log10(Math.max(1, rewardPoolUsd)) * 12);
    reasons.push(`Reward pool ${rewardPoolUsd.toLocaleString()}`);
  }

  if (liquidity !== undefined) {
    score += Math.min(30, Math.log10(Math.max(1, liquidity)) * 8);
    reasons.push(`Liquidity ${liquidity.toLocaleString()}`);
  } else {
    missingData.push('liquidity');
  }

  if (volume24h !== undefined) {
    score += Math.min(20, Math.log10(Math.max(1, volume24h)) * 6);
    reasons.push(`24h volume ${volume24h.toLocaleString()}`);
  } else {
    missingData.push('volume24h');
  }

  if (spread !== undefined) {
    score += spread <= 0.01 ? 5 : spread <= 0.02 ? 3 : 1;
    reasons.push(`Spread ${spread.toFixed(4)}`);
  } else {
    missingData.push('spread');
  }

  const confidence: Opportunity['confidence'] =
    missingData.length === 0 ? 'high' : missingData.length <= 2 ? 'medium' : 'low';

  return {
    conditionId,
    question,
    eventSlug:
      (metadata.eventSlug as string | undefined) ??
      (raw.event_slug as string | undefined) ??
      (raw.slug as string | undefined) ??
      (raw.market_slug as string | undefined),
    category: metadata.category as string | undefined,
    marketEndAt,
    rewardsEndAt,
    liquidity,
    midpoint,
    volume24h,
    spread,
    rewardsMinSize,
    rewardsMaxSpread,
    dailyRewardUsd,
    rewardPoolUsd,
    hasRewardProgram: rewardSignals.hasRewardProgram,
    score: Math.round(score),
    confidence,
    reasons,
    missingData,
  };
}

function compareOpportunities(a: Opportunity, b: Opportunity): number {
  const dailyA = a.dailyRewardUsd ?? -1;
  const dailyB = b.dailyRewardUsd ?? -1;
  if (dailyA !== dailyB) return dailyB - dailyA;
  const spreadA = a.rewardsMaxSpread ?? -1;
  const spreadB = b.rewardsMaxSpread ?? -1;
  if (spreadA !== spreadB) return spreadB - spreadA;
  const minSizeA = a.rewardsMinSize ?? Number.MAX_SAFE_INTEGER;
  const minSizeB = b.rewardsMinSize ?? Number.MAX_SAFE_INTEGER;
  if (minSizeA !== minSizeB) return minSizeA - minSizeB;
  const rewardA = a.rewardPoolUsd ?? -1;
  const rewardB = b.rewardPoolUsd ?? -1;
  if (rewardA !== rewardB) return rewardB - rewardA;
  const liqA = a.liquidity ?? -1;
  const liqB = b.liquidity ?? -1;
  if (liqA !== liqB) return liqB - liqA;
  return b.score - a.score;
}

function hasRewardSignal(o: Opportunity): boolean {
  return (
    !!o.hasRewardProgram ||
    (o.dailyRewardUsd ?? 0) > 0 ||
    (o.rewardPoolUsd ?? 0) > 0 ||
    (o.rewardsMaxSpread ?? 0) > 0 ||
    (o.rewardsMinSize ?? 0) > 0
  );
}

async function fetchReplayMarketDetail(
  conditionId: string
): Promise<Record<string, unknown> | null> {
  if (!REPLAY_API_KEY) return null;
  const url = `${REPLAY_BASE_URL}/api/polymarket/markets/${conditionId}`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': REPLAY_API_KEY,
      accept: 'application/json',
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { market?: Record<string, unknown> };
  return payload.market ?? null;
}

async function enrichSnapshotLive(snapshot: OpportunitiesSnapshot): Promise<OpportunitiesSnapshot> {
  if (!snapshot.opportunities.length) return snapshot;

  const top = snapshot.opportunities.slice(0, LIVE_REFRESH_TOP_N);
  const details = await Promise.all(top.map(item => fetchReplayMarketDetail(item.conditionId)));

  const byId = new Map<string, Opportunity>();
  for (let i = 0; i < top.length; i += 1) {
    const base = top[i];
    const detail = details[i];
    if (!detail) {
      byId.set(base.conditionId, base);
      continue;
    }

    const mergedRaw: Record<string, unknown> = {
      conditionId: base.conditionId,
      question: base.question,
      rewardsMinSize: base.rewardsMinSize,
      rewardsMaxSpread: base.rewardsMaxSpread,
      rewardPoolUsd: base.rewardPoolUsd,
      ...detail,
    };

    byId.set(base.conditionId, buildOpportunity(mergedRaw));
  }

  const merged = snapshot.opportunities.map(item => byId.get(item.conditionId) ?? item);
  const updated: OpportunitiesSnapshot = {
    ...snapshot,
    opportunities: merged.sort(compareOpportunities),
    liveUpdatedAt: new Date().toISOString(),
  };
  globalThis.__cheffOpportunitiesSnapshot = updated;
  return updated;
}

async function fetchGammaMarkets(): Promise<Record<string, unknown>[]> {
  const pageSize = 500;
  const maxPages = 8;
  const out: Record<string, unknown>[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const url = `${GAMMA_BASE_URL}/markets?closed=false&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Gamma fetch failed (${res.status})`);
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function fetchPolymarketRewardMarkets(
  type?: 'sponsored'
): Promise<Record<string, unknown>[]> {
  const byConditionId = new Map<string, Record<string, unknown>>();
  const maxPages = Number.isFinite(POLYMARKET_REWARDS_MAX_PAGES)
    ? Math.max(10, POLYMARKET_REWARDS_MAX_PAGES)
    : 250;
  const requestTimeoutMs = 7000;
  const retryCount = 3;

  const rateFromRow = (row: Record<string, unknown>): number => {
    const config = row.rewards_config as Array<Record<string, unknown>> | undefined;
    return toNumber(config?.[0]?.rate_per_day) ?? 0;
  };

  const mergeRows = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id =
        (row.condition_id as string | undefined) ?? (row.conditionId as string | undefined) ?? '';
      if (!id) continue;
      const prev = byConditionId.get(id);
      if (!prev || rateFromRow(row) > rateFromRow(prev)) {
        byConditionId.set(id, row);
      }
    }
  };

  const fetchPageWithRetry = async (url: string): Promise<Response | null> => {
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json' },
          next: { revalidate: 0 },
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (res.ok) return res;
      } catch {
        // Try again.
      }
    }
    return null;
  };

  let nextCursor: string | undefined = 'MA==';
  for (let page = 0; page < maxPages; page += 1) {
    if (!nextCursor) break;
    const params = new URLSearchParams({
      orderBy: 'rate_per_day',
      desc: 'true',
      nextCursor,
    });
    if (type) params.set('type', type);
    const url = `${POLYMARKET_BASE_URL}/api/rewards/markets?${params.toString()}`;
    const res = await fetchPageWithRetry(url);
    if (!res) break;
    const payload = (await res.json()) as {
      data?: Record<string, unknown>[];
      nextCursor?: string;
      next_cursor?: string;
    };
    const rows = payload.data ?? [];
    if (!rows.length) break;
    mergeRows(rows);
    const next =
      (payload.nextCursor as string | undefined) ?? (payload.next_cursor as string | undefined);
    if (!next || next === nextCursor) break;
    nextCursor = next;
  }

  return Array.from(byConditionId.values()).sort((a, b) => rateFromRow(b) - rateFromRow(a));
}

async function fetchReplayMarketsFallback(): Promise<Record<string, unknown>[]> {
  if (!REPLAY_API_KEY) throw new Error('Missing REPLAY_API_KEY');

  const seeds = ['will', 'who', 'bitcoin', 'election', 'fed', 'trump', 'crypto', 'rates', 'war'];
  const byId = new Map<string, Record<string, unknown>>();

  await Promise.all(
    seeds.map(async q => {
      const params = new URLSearchParams({
        venue: 'POLYMARKET',
        active: 'true',
        limit: String(REPLAY_SEARCH_LIMIT),
        q,
      });
      const url = `${REPLAY_BASE_URL}/api/markets/search?${params.toString()}`;
      const res = await fetch(url, {
        headers: { 'x-api-key': REPLAY_API_KEY, accept: 'application/json' },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { markets?: Record<string, unknown>[] };
      for (const m of payload.markets ?? []) {
        const id = (m.id as string | undefined) ?? '';
        if (id) byId.set(id, m);
      }
    })
  );

  return Array.from(byId.values()).slice(0, 90);
}

type ClobLevel = { price?: string | number; size?: string | number };
type ClobBook = { bids?: ClobLevel[]; asks?: ClobLevel[] };
type RewardToken = { token_id?: string; tokenId?: string };

function parseLevelValue(v: unknown): number {
  const n = toNumber(v);
  return n ?? 0;
}

function computeLiquidityFromBook(book: ClobBook, levelLimit = 20): number | undefined {
  const bids = (book.bids ?? []).slice(0, levelLimit);
  const asks = (book.asks ?? []).slice(0, levelLimit);
  if (!bids.length && !asks.length) return undefined;

  const topBid = bids[0] ? parseLevelValue(bids[0].price) : 0;
  const topAsk = asks[0] ? parseLevelValue(asks[0].price) : 0;
  if (topBid <= 0 || topAsk <= 0 || topAsk <= topBid) return undefined;
  const midpoint = (topBid + topAsk) / 2;
  const band = 0.02; // 2c around midpoint.

  let total = 0;
  for (const bid of bids) {
    const p = parseLevelValue(bid.price);
    const s = parseLevelValue(bid.size);
    if (Math.abs(p - midpoint) > band) continue;
    total += p * s;
  }
  for (const ask of asks) {
    const p = parseLevelValue(ask.price);
    const s = parseLevelValue(ask.size);
    if (Math.abs(p - midpoint) > band) continue;
    total += p * s;
  }
  return Number.isFinite(total) ? total : undefined;
}

function computeSpreadFromBook(book: ClobBook): number | undefined {
  const topBid = book.bids?.[0];
  const topAsk = book.asks?.[0];
  if (!topBid || !topAsk) return undefined;
  const bid = parseLevelValue(topBid.price);
  const ask = parseLevelValue(topAsk.price);
  if (ask <= 0 || bid <= 0) return undefined;
  return ask - bid;
}

function isLikelyNoiseMarket(o: Opportunity): boolean {
  const q = o.question.toLowerCase();
  const noisyPhrases = [
    'wins the toss',
    'lead the nba',
    'lead the nfl',
    'lead the nhl',
    'coach of the year',
    'sixth man',
    'olympics',
    'medal',
    'player of the year',
  ];
  if (noisyPhrases.some(p => q.includes(p))) return true;
  if (o.category?.toLowerCase() === 'sports' && (o.spread ?? 1) > 0.05) return true;
  return false;
}

const CLOB_BASE_URL = 'https://clob.polymarket.com';

function getTokenId(row: Record<string, unknown>): string | undefined {
  const metadata = (row.metadata as Record<string, unknown> | undefined) ?? {};
  const tokenIds = metadata.clobTokenIds as string[] | undefined;
  if (tokenIds?.[0]) return tokenIds[0];

  const rewardTokens = row.tokens as RewardToken[] | undefined;
  const rewardTokenId = rewardTokens?.[0]?.token_id ?? rewardTokens?.[0]?.tokenId;
  if (rewardTokenId) return rewardTokenId;
  return undefined;
}

function computeMidpointFromBook(book: ClobBook): number | undefined {
  const topBid = book.bids?.[0];
  const topAsk = book.asks?.[0];
  if (!topBid || !topAsk) return undefined;
  const bid = parseLevelValue(topBid.price);
  const ask = parseLevelValue(topAsk.price);
  if (bid <= 0 || ask <= 0) return undefined;
  return (bid + ask) / 2;
}

async function enrichRowsWithClob(
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;

  const enrichLimit = Math.min(rows.length, 80);
  const out = [...rows];
  const targets = out.slice(0, enrichLimit);
  const concurrency = 10;

  for (let start = 0; start < targets.length; start += concurrency) {
    const chunk = targets.slice(start, start + concurrency);
    await Promise.all(
      chunk.map(async (row, cidx) => {
        const idx = start + cidx;
        const tokenId = getTokenId(row);
        if (!tokenId) return;

        try {
          const url = `${CLOB_BASE_URL}/book?token_id=${tokenId}`;
          const res = await fetch(url, {
            headers: { accept: 'application/json' },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return;
          const book = (await res.json()) as ClobBook;

          const spread = computeSpreadFromBook(book);
          const liquidity = computeLiquidityFromBook(book);
          const midpoint = computeMidpointFromBook(book);

          out[idx] = {
            ...row,
            spread: spread ?? row.spread,
            liquidity: liquidity ?? row.liquidity,
            midpoint: midpoint ?? row.midpoint,
          };
        } catch {
          // CLOB fetch failed for this token, skip.
        }
      })
    );
  }

  return out;
}

export async function scanAllPolymarketMarkets(options?: {
  rewardOnly?: boolean;
  rewardType?: RewardType;
}): Promise<OpportunitiesSnapshot> {
  const rewardOnly = options?.rewardOnly ?? false;
  const rewardType = options?.rewardType ?? 'lp';
  const gammaStrict = DATA_MODE === 'gamma-strict';
  let rows: Record<string, unknown>[] = [];
  let source: OpportunitiesSnapshot['source'] = 'gamma';
  let gammaErrorMessage: string | undefined;
  let rewardsErrorMessage: string | undefined;

  const apiType = rewardType === 'sponsored' ? ('sponsored' as const) : undefined;

  try {
    const rewardsRows = await fetchPolymarketRewardMarkets(apiType);
    if (rewardsRows.length > 0) {
      source = 'polymarket-rewards';
      try {
        const gammaRows = await fetchGammaMarkets();
        const gammaByCondition = new Map<string, Record<string, unknown>>();
        for (const g of gammaRows) {
          const id =
            (g.conditionId as string | undefined) ?? (g.condition_id as string | undefined) ?? '';
          if (id) gammaByCondition.set(id, g);
        }
        rows = rewardsRows.map(rewardRow => {
          const id =
            (rewardRow.condition_id as string | undefined) ??
            (rewardRow.conditionId as string | undefined) ??
            '';
          const gammaRow = gammaByCondition.get(id) ?? {};
          return { ...gammaRow, ...rewardRow, conditionId: id || gammaRow.conditionId };
        });

        rows = await enrichRowsWithClob(rows);
      } catch (error) {
        gammaErrorMessage = error instanceof Error ? error.message : 'Unknown Gamma error';
        rows = rewardsRows;
        rows = await enrichRowsWithClob(rows);
      }
    }
  } catch (error) {
    rewardsErrorMessage = error instanceof Error ? error.message : 'Unknown rewards API error';
  }

  if (rows.length === 0 && rewardType === 'lp') {
    try {
      rows = await fetchGammaMarkets();
      source = 'gamma';
    } catch (error) {
      gammaErrorMessage = error instanceof Error ? error.message : 'Unknown Gamma error';
      if (gammaStrict) {
        throw new Error(
          `Gamma API unavailable in strict mode: ${gammaErrorMessage}. ` +
            'Deploy with server egress that can reach gamma-api.polymarket.com.'
        );
      }
      rows = await fetchReplayMarketsFallback();
      rows = await enrichRowsWithClob(rows);
      source = 'replay-fallback';
    }
  }

  const mapped = rows.map(buildOpportunity).filter(o => !isLikelyNoiseMarket(o));
  const filtered = mapped.filter(o => {
    const tradable = (o.spread ?? 1) <= 0.15 && (o.liquidity ?? 0) >= 100;
    return hasRewardSignal(o) || tradable;
  });
  const rewardMarkets = mapped.filter(o => hasRewardSignal(o));
  const base = rewardOnly ? rewardMarkets : filtered.length >= 15 ? filtered : mapped;
  const opportunities = base.sort(compareOpportunities);
  const rewardCoveragePct = mapped.length ? (rewardMarkets.length / mapped.length) * 100 : 0;
  const notes: string[] = [];
  if (rewardsErrorMessage) {
    notes.push(`Rewards API unavailable: ${rewardsErrorMessage}`);
  }
  if (gammaErrorMessage) {
    notes.push(`Gamma unavailable: ${gammaErrorMessage}`);
  }

  const snapshot: OpportunitiesSnapshot = {
    opportunities,
    fetchedAt: new Date().toISOString(),
    liveUpdatedAt: new Date().toISOString(),
    source,
    scannedCount: rows.length,
    notes,
    rewardCoveragePct,
    gammaStrict,
    rewardType,
  };

  if (rewardType === 'sponsored') {
    globalThis.__cheffSponsoredSnapshot = snapshot;
  } else {
    globalThis.__cheffOpportunitiesSnapshot = snapshot;
  }
  return enrichSnapshotLive(snapshot);
}

export async function getCachedOrFreshOpportunities(
  force = false,
  options?: { rewardOnly?: boolean; rewardType?: RewardType }
): Promise<OpportunitiesSnapshot> {
  const rewardOnly = options?.rewardOnly ?? false;
  const rewardType = options?.rewardType ?? 'lp';
  const cached =
    rewardType === 'sponsored'
      ? globalThis.__cheffSponsoredSnapshot
      : globalThis.__cheffOpportunitiesSnapshot;

  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_AFTER_MS) {
      const liveAge = cached.liveUpdatedAt
        ? Date.now() - new Date(cached.liveUpdatedAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (liveAge < LIVE_REFRESH_MS) {
        if (!rewardOnly) return cached;
        return {
          ...cached,
          opportunities: cached.opportunities.filter(o => hasRewardSignal(o)),
        };
      }

      if (!globalThis.__cheffLiveRefreshPromise) {
        globalThis.__cheffLiveRefreshPromise = enrichSnapshotLive(cached).finally(() => {
          globalThis.__cheffLiveRefreshPromise = undefined;
        });
      }
      const refreshed = await globalThis.__cheffLiveRefreshPromise;
      if (!rewardOnly) return refreshed;
      return {
        ...refreshed,
        opportunities: refreshed.opportunities.filter(o => hasRewardSignal(o)),
      };
    }
  }
  return scanAllPolymarketMarkets({ rewardOnly, rewardType });
}
