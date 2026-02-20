/**
 * Maker rebates data fetcher for Polymarket.
 *
 * Maker rebates are funded by taker fees on eligible market types.
 * A percentage of taker fees is redistributed daily to makers whose
 * liquidity was taken.
 *
 * Eligible market types:
 * - 15-minute crypto (BTC, ETH, SOL, XRP) → 20% rebate, feeRate=0.25, exponent=2
 * - 5-minute crypto (BTC, ETH, SOL, XRP)  → 20% rebate, feeRate=0.25, exponent=2
 * - NCAAB / Serie A (sports)               → 25% rebate, feeRate=0.0175, exponent=1
 *
 * Data source: Gamma API events endpoint, filtered by tag slugs (15M, 5M).
 * Series-level volume and liquidity are extracted from event responses.
 */

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const REQUEST_TIMEOUT_MS = 8_000;

/* ─────── types ─────── */

export interface FeeParams {
  feeRate: number;
  exponent: number;
  rebatePct: number;
}

export interface MakerRebateSeries {
  slug: string;
  title: string;
  asset: string;
  interval: string;
  feeType: string;
  feeParams: FeeParams;
  volume24hr: number;
  liquidity: number;
  activeEvents: number;
  estimatedDailyFees: number;
  estimatedDailyRebates: number;
}

export interface MakerRebatesSnapshot {
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

/* ─────── fee curve ─────── */

const CRYPTO_FEE: FeeParams = { feeRate: 0.25, exponent: 2, rebatePct: 0.20 };
const SPORTS_FEE: FeeParams = { feeRate: 0.0175, exponent: 1, rebatePct: 0.25 };

/**
 * Average effective fee rate for binary up/down markets.
 *
 * Formula: effective_rate(p) = feeRate × (p × (1 - p))^exponent
 * At p=0.50 (peak): crypto = 1.56%, sports = 0.44%
 *
 * These are binary "up or down" markets where ~80% of volume is in the
 * 0.40–0.60 price range. We use a weighted average that reflects this
 * rather than a uniform distribution.
 *
 * Crypto (exp=2): avg ~1.50% (weighted near p=0.50)
 * Sports (exp=1): avg ~0.40% (weighted near p=0.50)
 */
function avgEffectiveFeeRate(params: FeeParams): number {
  const { feeRate, exponent } = params;
  if (exponent === 2) return feeRate * 0.06;
  if (exponent === 1) return feeRate * 0.23;
  return feeRate * 0.06;
}

function estimateDailyFees(volume24hr: number, params: FeeParams): number {
  return volume24hr * avgEffectiveFeeRate(params);
}

/* ─────── gamma fetch ─────── */

interface GammaEvent {
  id: string;
  title?: string;
  slug?: string;
  volume24hr?: number;
  liquidity?: number;
  markets?: {
    feesEnabled?: boolean;
    feeType?: string;
    volume24hr?: number;
  }[];
  series?: {
    slug?: string;
    title?: string;
    volume24hr?: number;
    liquidity?: number;
    active?: boolean;
  }[];
  tags?: { slug?: string }[];
}

async function fetchGammaEventsByTag(tagSlug: string): Promise<GammaEvent[]> {
  const all: GammaEvent[] = [];
  const limit = 100;
  let offset = 0;

  for (let page = 0; page < 5; page++) {
    const url = `${GAMMA_BASE}/events?active=true&closed=false&limit=${limit}&offset=${offset}&tag_slug=${tagSlug}`;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) break;
      const data = (await res.json()) as GammaEvent[];
      if (!data.length) break;
      all.push(...data);
      if (data.length < limit) break;
      offset += limit;
    } catch {
      break;
    }
  }

  return all;
}

function parseAssetAndInterval(slug: string): { asset: string; interval: string } {
  const lower = slug.toLowerCase();
  let asset = 'Unknown';
  if (lower.includes('btc') || lower.includes('bitcoin')) asset = 'BTC';
  else if (lower.includes('eth') || lower.includes('ethereum')) asset = 'ETH';
  else if (lower.includes('sol') || lower.includes('solana')) asset = 'SOL';
  else if (lower.includes('xrp') || lower.includes('ripple')) asset = 'XRP';

  let interval = 'unknown';
  if (lower.includes('15m') || lower.includes('15-min')) interval = '15m';
  else if (lower.includes('5m') || lower.includes('5-min')) interval = '5m';
  else if (lower.includes('hourly') || lower.includes('1h')) interval = '1h';

  return { asset, interval };
}

function feeParamsForType(feeType: string | undefined): FeeParams {
  if (!feeType) return CRYPTO_FEE;
  if (feeType.includes('sports') || feeType.includes('ncaab') || feeType.includes('serie')) {
    return SPORTS_FEE;
  }
  return CRYPTO_FEE;
}

/* ─────── build snapshot ─────── */

async function buildSnapshot(): Promise<MakerRebatesSnapshot> {
  const [events15m, events5m] = await Promise.all([
    fetchGammaEventsByTag('15M'),
    fetchGammaEventsByTag('5M'),
  ]);

  const seriesMap = new Map<string, {
    title: string;
    volume24hr: number;
    liquidity: number;
    activeEvents: number;
    feeType: string;
  }>();

  function processEvents(events: GammaEvent[]) {
    for (const evt of events) {
      const feeType = evt.markets?.[0]?.feeType ?? '';
      for (const s of evt.series ?? []) {
        if (!s.slug) continue;
        const existing = seriesMap.get(s.slug);
        if (!existing) {
          seriesMap.set(s.slug, {
            title: s.title ?? s.slug,
            volume24hr: s.volume24hr ?? 0,
            liquidity: s.liquidity ?? 0,
            activeEvents: 1,
            feeType,
          });
        } else {
          existing.activeEvents++;
          if (s.volume24hr && s.volume24hr > existing.volume24hr) {
            existing.volume24hr = s.volume24hr;
          }
          if (s.liquidity && s.liquidity > existing.liquidity) {
            existing.liquidity = s.liquidity;
          }
        }
      }
    }
  }

  processEvents(events15m);
  processEvents(events5m);

  const seriesList: MakerRebateSeries[] = [];

  for (const [slug, info] of seriesMap) {
    const { asset, interval } = parseAssetAndInterval(slug);
    const params = feeParamsForType(info.feeType);
    const estFees = estimateDailyFees(info.volume24hr, params);
    const estRebates = estFees * params.rebatePct;

    seriesList.push({
      slug,
      title: info.title,
      asset,
      interval,
      feeType: info.feeType || 'crypto',
      feeParams: params,
      volume24hr: info.volume24hr,
      liquidity: info.liquidity,
      activeEvents: info.activeEvents,
      estimatedDailyFees: Math.round(estFees * 100) / 100,
      estimatedDailyRebates: Math.round(estRebates * 100) / 100,
    });
  }

  seriesList.sort((a, b) => b.estimatedDailyRebates - a.estimatedDailyRebates);

  const totalVol = seriesList.reduce((s, x) => s + x.volume24hr, 0);
  const totalLiq = seriesList.reduce((s, x) => s + x.liquidity, 0);
  const totalFees = seriesList.reduce((s, x) => s + x.estimatedDailyFees, 0);
  const totalRebates = seriesList.reduce((s, x) => s + x.estimatedDailyRebates, 0);
  const totalActive = seriesList.reduce((s, x) => s + x.activeEvents, 0);

  return {
    series: seriesList,
    overall: {
      totalSeries: seriesList.length,
      totalVolume24hr: totalVol,
      totalLiquidity: totalLiq,
      estimatedDailyFees: Math.round(totalFees * 100) / 100,
      estimatedDailyRebates: Math.round(totalRebates * 100) / 100,
      activeEvents: totalActive,
    },
    feeInfo: {
      cryptoMaxEffRate: '1.56%',
      sportsMaxEffRate: '0.44%',
      cryptoRebatePct: '20%',
      sportsRebatePct: '25%',
    },
    fetchedAt: new Date().toISOString(),
  };
}

/* ─────── cache ─────── */

declare global {
  // eslint-disable-next-line no-var
  var __makerRebatesSnapshot: MakerRebatesSnapshot | undefined;
}

const STALE_MS = 5 * 60 * 1000;

export async function fetchMakerRebates(force = false): Promise<MakerRebatesSnapshot> {
  const cached = globalThis.__makerRebatesSnapshot;
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_MS) return cached;
  }

  const snapshot = await buildSnapshot();
  globalThis.__makerRebatesSnapshot = snapshot;
  return snapshot;
}
