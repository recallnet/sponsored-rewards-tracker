const API_BASE = 'https://api.limitless.exchange';
const API_KEY = process.env.LIMITLESS_API_KEY ?? '';
const PAGE_LIMIT = 25;

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': API_KEY },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Limitless API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface LimitlessMarket {
  id: number;
  title: string;
  categories: string[];
  tags: string[];
  tradeType: string;
  volume: string;
  volumeFormatted: string;
  isRewardable?: boolean;
  settings?: {
    minSize?: string;
    maxSpread?: number;
    dailyReward?: string;
    rewardsEpoch?: string;
    c?: string;
  };
  status: string;
  slug: string;
}

interface BrowseResponse {
  data: LimitlessMarket[];
  totalMarketsCount: number;
}

export interface CategoryBreakdown {
  category: string;
  marketCount: number;
  dailyReward: number;
}

export interface LimitlessLpSnapshot {
  totalDailyBudget: number;
  rewardableMarkets: number;
  totalClobMarkets: number;
  categories: CategoryBreakdown[];
  topMarkets: {
    title: string;
    slug: string;
    dailyReward: number;
    maxSpread: number;
    minSize: number;
    category: string;
    volume: number;
  }[];
  nextPayoutUtc: string;
  fetchedAt: string;
}

interface LeaderboardPeriod {
  id: string;
  start: number;
  startIso: string;
  end: number;
  endIso: string;
  points: number;
}

interface LeaderboardUser {
  account: string;
  displayName: string;
  points: string;
  totalPoints: number;
  rankName: string;
  leaderboardPosition: string;
}

interface LeaderboardResponse {
  data: LeaderboardUser[];
  page: number;
  limit: number;
  periods: LeaderboardPeriod[];
  totalRows: number;
  totalPages: number;
}

export interface SeasonData {
  name: string;
  totalPoints: number;
  periods: { start: string; end: string; points: number }[];
  status: 'completed' | 'active' | 'upcoming';
}

export interface PointsLeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  weeklyPoints: number;
  totalPoints: number;
  rankName: string;
}

export interface LimitlessPointsSnapshot {
  allTimeTotal: number;
  thisWeekTotal: number;
  dailyAverage: number;
  seasons: SeasonData[];
  currentSeason: string;
  topEarners: PointsLeaderboardEntry[];
  nextDistribution: string;
  fetchedAt: string;
}

let lpCache: { data: LimitlessLpSnapshot; ts: number } | null = null;
const STALE_MS = 2 * 60 * 1000;

export async function fetchLimitlessLpRewards(force = false): Promise<LimitlessLpSnapshot> {
  if (!force && lpCache && Date.now() - lpCache.ts < STALE_MS) {
    return lpCache.data;
  }

  const allMarkets: LimitlessMarket[] = [];
  let page = 1;
  let total = Infinity;

  while (allMarkets.length < total) {
    const res = await apiFetch<BrowseResponse>('/markets/active', {
      limit: String(PAGE_LIMIT),
      page: String(page),
      tradeType: 'clob',
    });
    total = res.totalMarketsCount;
    if (!res.data.length) break;
    allMarkets.push(...res.data);
    page++;
  }

  const catMap = new Map<string, { count: number; daily: number }>();
  let totalDailyBudget = 0;
  let rewardableCount = 0;

  const enriched: (LimitlessMarket & { _dr: number })[] = [];

  for (const m of allMarkets) {
    const dr = parseFloat(m.settings?.dailyReward ?? '0');
    if (dr > 0) {
      rewardableCount++;
      totalDailyBudget += dr;
      enriched.push({ ...m, _dr: dr });
      const cat = m.categories?.[0] ?? 'Other';
      const entry = catMap.get(cat) ?? { count: 0, daily: 0 };
      entry.count++;
      entry.daily += dr;
      catMap.set(cat, entry);
    }
  }

  const categories: CategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, marketCount: v.count, dailyReward: v.daily }))
    .sort((a, b) => b.dailyReward - a.dailyReward);

  const topMarkets = enriched
    .sort((a, b) => b._dr - a._dr)
    .slice(0, 30)
    .map(m => ({
      title: m.title,
      slug: m.slug,
      dailyReward: m._dr,
      maxSpread: (m.settings?.maxSpread ?? 0) * 100,
      minSize: parseInt(m.settings?.minSize ?? '0') / 1e6,
      category: m.categories?.[0] ?? 'Other',
      volume: parseFloat(m.volumeFormatted ?? '0'),
    }));

  const now = new Date();
  const nextPayout = new Date(now);
  nextPayout.setUTCHours(12, 0, 0, 0);
  if (nextPayout.getTime() <= now.getTime()) {
    nextPayout.setUTCDate(nextPayout.getUTCDate() + 1);
  }

  const snapshot: LimitlessLpSnapshot = {
    totalDailyBudget,
    rewardableMarkets: rewardableCount,
    totalClobMarkets: allMarkets.length,
    categories,
    topMarkets,
    nextPayoutUtc: nextPayout.toISOString(),
    fetchedAt: new Date().toISOString(),
  };

  lpCache = { data: snapshot, ts: Date.now() };
  return snapshot;
}

let pointsCache: { data: LimitlessPointsSnapshot; ts: number } | null = null;

export async function fetchLimitlessPoints(force = false): Promise<LimitlessPointsSnapshot> {
  if (!force && pointsCache && Date.now() - pointsCache.ts < STALE_MS) {
    return pointsCache.data;
  }

  const seasons: SeasonData[] = [];
  let allTimeTotal = 0;

  for (const season of ['SEASON2', 'SEASON3'] as const) {
    const monthly = await apiFetch<LeaderboardResponse>('/leaderboard/month', {
      metric: 'points',
      page: '1',
      limit: '1',
      season,
    });

    const totalPts = monthly.periods.reduce((sum, p) => sum + p.points, 0);
    allTimeTotal += totalPts;

    const isActive = season === 'SEASON3';
    seasons.push({
      name: season === 'SEASON2' ? 'Season 2' : 'Season 3',
      totalPoints: totalPts,
      periods: monthly.periods
        .filter(p => p.points > 0)
        .map(p => ({ start: p.startIso, end: p.endIso, points: p.points })),
      status: isActive ? 'active' : 'completed',
    });
  }

  const weeklyData = await apiFetch<LeaderboardResponse>('/leaderboard/week', {
    metric: 'points',
    page: '1',
    limit: '15',
    season: 'SEASON3',
  });

  const latestWeek = weeklyData.periods.length > 0
    ? weeklyData.periods[weeklyData.periods.length - 1]
    : null;
  const thisWeekTotal = latestWeek?.points ?? 0;
  const dailyAverage = thisWeekTotal / 7;

  const topEarners: PointsLeaderboardEntry[] = weeklyData.data.map(u => ({
    rank: parseInt(u.leaderboardPosition),
    address: u.account,
    displayName: u.displayName,
    weeklyPoints: parseFloat(u.points),
    totalPoints: u.totalPoints,
    rankName: u.rankName,
  }));

  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + ((1 + 7 - now.getUTCDay()) % 7 || 7));
  nextMonday.setUTCHours(12, 0, 0, 0);

  const snapshot: LimitlessPointsSnapshot = {
    allTimeTotal,
    thisWeekTotal,
    dailyAverage,
    seasons,
    currentSeason: 'Season 3',
    topEarners,
    nextDistribution: nextMonday.toISOString(),
    fetchedAt: new Date().toISOString(),
  };

  pointsCache = { data: snapshot, ts: Date.now() };
  return snapshot;
}
