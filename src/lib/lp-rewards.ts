/**
 * On-chain indexer for Polymarket LP rewards.
 *
 * Tracks USDC.e Transfer events FROM the LP rewards distributor
 * to liquidity provider addresses on Polygon. The distributor sends
 * rewards daily at midnight UTC via Multicall3 batch transfers
 * (~1,400 recipients per day).
 *
 * Distributor: 0xc288480574783bd7615170660d71753378159c47
 * Token: USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
 */

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const LP_DISTRIBUTOR = '0xc288480574783bd7615170660d71753378159c47';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USDC_DECIMALS = 1e6;
const RPC_TIMEOUT_MS = 12_000;
const CHUNK_SIZE = 10_000;
const BLOCKS_PER_DAY = 43_200;

const RPC_ENDPOINTS = [
  'https://polygon.drpc.org',
  'https://polygon-bor-rpc.publicnode.com',
  'https://rpc-mainnet.matic.quiknode.pro',
];

/* ─────── types ─────── */

export interface LpDailyTotal {
  date: string;
  totalUsdc: number;
  transfers: number;
  receivers: number;
}

export interface LpTopReceiver {
  address: string;
  amount1d: number;
  amount7d: number;
  amountAll: number;
  pct1d: number;
}

export interface LpRewardsSnapshot {
  dailyTotals: LpDailyTotal[];
  topReceivers: LpTopReceiver[];
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

/* ─────── RPC helpers ─────── */

interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const d = (await res.json()) as { result?: unknown; error?: unknown };
      if (d.error) continue;
      return d.result;
    } catch { continue; }
  }
  throw new Error('All RPCs failed');
}

async function getLatestBlock(): Promise<number> {
  const hex = (await rpcCall('eth_blockNumber', [])) as string;
  return parseInt(hex, 16);
}

async function getBlockTimestamp(blockNum: number): Promise<number> {
  const result = (await rpcCall('eth_getBlockByNumber', [
    '0x' + blockNum.toString(16), false
  ])) as { timestamp?: string } | null;
  return result?.timestamp ? parseInt(result.timestamp, 16) : 0;
}

async function fetchLogsChunk(
  topics: (string | null)[], from: number, to: number
): Promise<RawLog[]> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getLogs',
          params: [{
            address: USDC_E,
            topics,
            fromBlock: '0x' + from.toString(16),
            toBlock: '0x' + to.toString(16),
          }],
        }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const d = (await res.json()) as { result?: RawLog[]; error?: { message?: string } };
      if (d.result && d.result.length > 0) return d.result;
      if (d.error) console.error(`[lp-rewards] RPC ${rpc} error: ${JSON.stringify(d.error)}`);
    } catch (e) {
      console.error(`[lp-rewards] RPC ${rpc} exception: ${e}`);
      continue;
    }
  }
  return [];
}

async function fetchAllLogs(
  topics: (string | null)[], fromBlock: number, toBlock: number
): Promise<RawLog[]> {
  const chunks: { from: number; to: number }[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK_SIZE + 1) {
    chunks.push({ from, to: Math.min(from + CHUNK_SIZE, toBlock) });
  }
  const CONCURRENCY = 4;
  const allLogs: RawLog[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(c => fetchLogsChunk(topics, c.from, c.to))
    );
    for (const logs of results) allLogs.push(...logs);
  }
  return allLogs;
}

/* ─────── timestamp interpolation ─────── */

async function getBlockTimestampRange(
  fromBlock: number, toBlock: number
): Promise<{ block: number; ts: number }[]> {
  const points = [fromBlock, Math.floor((fromBlock + toBlock) / 2), toBlock];
  const results: { block: number; ts: number }[] = [];
  for (const b of points) {
    const ts = await getBlockTimestamp(b);
    if (ts > 0) results.push({ block: b, ts });
  }
  return results;
}

function interpolateTimestamp(
  blockNum: number, refs: { block: number; ts: number }[]
): number {
  if (refs.length === 0) return Math.floor(Date.now() / 1000);
  if (refs.length === 1) return refs[0].ts + (blockNum - refs[0].block) * 2;
  let closest = refs[0];
  for (const r of refs) {
    if (Math.abs(r.block - blockNum) < Math.abs(closest.block - blockNum)) {
      closest = r;
    }
  }
  const next = refs.find(r => r.block !== closest.block && r.block > closest.block) ?? refs[refs.length - 1];
  if (next.block === closest.block) return closest.ts + (blockNum - closest.block) * 2;
  const rate = (next.ts - closest.ts) / (next.block - closest.block);
  return Math.floor(closest.ts + (blockNum - closest.block) * rate);
}

/* ─────── build snapshot ─────── */

async function buildSnapshot(): Promise<LpRewardsSnapshot> {
  const latestBlock = await getLatestBlock();
  const refTs = await getBlockTimestamp(latestBlock);
  const cache = globalThis.__lpRewardCache;

  const scanFrom = cache?.lastScannedBlock
    ? cache.lastScannedBlock + 1
    : latestBlock - BLOCKS_PER_DAY * 3;
  const scanTo = latestBlock;

  const distTopic = '0x000000000000000000000000' + LP_DISTRIBUTOR.slice(2);
  const logs = await fetchAllLogs([TRANSFER_TOPIC, distTopic], scanFrom, scanTo);

  const refs = logs.length > 0 ? await getBlockTimestampRange(scanFrom, scanTo) : [];

  const transfers = logs.map(log => {
    const to = '0x' + log.topics[2].slice(26);
    const amount = Number(BigInt(log.data)) / USDC_DECIMALS;
    const blockNum = parseInt(log.blockNumber, 16);
    const ts = interpolateTimestamp(blockNum, refs);
    const date = new Date(ts * 1000).toISOString().split('T')[0];
    return { to, amount, date };
  });

  const prevDailys = cache?.dailyTotals ?? [];
  const prevReceiverAll = cache?.receiverAll ?? new Map<string, number>();

  const dailyMap = new Map<string, { total: number; count: number; receivers: Set<string> }>();
  for (const d of prevDailys) {
    dailyMap.set(d.date, { total: d.totalUsdc, count: d.transfers, receivers: new Set() });
  }

  const receiverAll = new Map(prevReceiverAll);
  const today = new Date(refTs * 1000).toISOString().split('T')[0];
  const d7 = new Date(refTs * 1000); d7.setDate(d7.getDate() - 7);
  const cutoff7d = d7.toISOString().split('T')[0];

  const receiver1d = new Map<string, number>();
  const receiver7d = new Map<string, number>();

  for (const t of transfers) {
    const existing = dailyMap.get(t.date);
    if (existing && !prevDailys.some(d => d.date === t.date)) {
      existing.total += t.amount;
      existing.count++;
      existing.receivers.add(t.to);
    } else if (!existing) {
      dailyMap.set(t.date, { total: t.amount, count: 1, receivers: new Set([t.to]) });
    }

    receiverAll.set(t.to, (receiverAll.get(t.to) ?? 0) + t.amount);

    if (t.date >= today) {
      receiver1d.set(t.to, (receiver1d.get(t.to) ?? 0) + t.amount);
    }
    if (t.date >= cutoff7d) {
      receiver7d.set(t.to, (receiver7d.get(t.to) ?? 0) + t.amount);
    }
  }

  const dailyTotals: LpDailyTotal[] = [...dailyMap.entries()]
    .map(([date, info]) => ({
      date,
      totalUsdc: Math.round(info.total * 100) / 100,
      transfers: info.count,
      receivers: info.receivers.size || info.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let total1d = [...receiver1d.values()].reduce((s, v) => s + v, 0);
  if (total1d === 0 && dailyTotals.length > 0) {
    total1d = dailyTotals[dailyTotals.length - 1].totalUsdc;
  }
  const total7d = [...receiver7d.values()].reduce((s, v) => s + v, 0) ||
    dailyTotals.reduce((s, d) => s + d.totalUsdc, 0);
  const totalAll = [...receiverAll.values()].reduce((s, v) => s + v, 0);
  const totalTransfers = dailyTotals.reduce((s, d) => s + d.transfers, 0);
  const daysCount = dailyTotals.length || 1;

  const topReceivers: LpTopReceiver[] = [...receiverAll.entries()]
    .map(([addr, allAmt]) => ({
      address: addr,
      amount1d: Math.round((receiver1d.get(addr) ?? 0) * 100) / 100,
      amount7d: Math.round((receiver7d.get(addr) ?? 0) * 100) / 100,
      amountAll: Math.round(allAmt * 100) / 100,
      pct1d: total1d > 0 ? Math.round(((receiver1d.get(addr) ?? 0) / total1d) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.amount1d - a.amount1d)
    .slice(0, 50);

  const snapshot: LpRewardsSnapshot = {
    dailyTotals,
    topReceivers,
    overall: {
      total1d: Math.round(total1d * 100) / 100,
      total7d: Math.round(total7d * 100) / 100,
      totalAll: Math.round(totalAll * 100) / 100,
      totalReceivers: receiverAll.size,
      totalTransfers,
      avgDaily: Math.round((totalAll / daysCount) * 100) / 100,
    },
    fetchedAt: new Date().toISOString(),
    fromBlock: scanFrom,
    toBlock: latestBlock,
  };

  globalThis.__lpRewardCache = {
    dailyTotals,
    receiverAll,
    lastScannedBlock: latestBlock,
  };
  globalThis.__lpRewardsSnapshot = snapshot;
  return snapshot;
}

/* ─────── cache ─────── */

import { loadCache, saveCache } from './db';

interface LpCacheData {
  dailyTotals: LpDailyTotal[];
  receiverAll: Map<string, number>;
  lastScannedBlock: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __lpRewardsSnapshot: LpRewardsSnapshot | undefined;
  // eslint-disable-next-line no-var
  var __lpRewardCache: LpCacheData | undefined;
}

const STALE_MS = 5 * 60 * 1000;

async function hydrateFromDb(): Promise<void> {
  if (globalThis.__lpRewardCache) return;
  const row = await loadCache('lp');
  if (!row) return;
  const v = row.value as {
    dailyTotals: LpDailyTotal[];
    receiverAll: Record<string, number>;
  };
  globalThis.__lpRewardCache = {
    dailyTotals: v.dailyTotals ?? [],
    receiverAll: new Map(Object.entries(v.receiverAll ?? {})),
    lastScannedBlock: row.lastBlock,
  };
  console.log(`[lp-rewards] Hydrated from DB: ${v.dailyTotals?.length ?? 0} days, block ${row.lastBlock}`);
}

async function persistToDb(): Promise<void> {
  const cache = globalThis.__lpRewardCache;
  if (!cache) return;
  const serialized = {
    dailyTotals: cache.dailyTotals,
    receiverAll: Object.fromEntries(cache.receiverAll),
  };
  await saveCache('lp', serialized, cache.lastScannedBlock);
}

export async function fetchLpRewards(force = false): Promise<LpRewardsSnapshot> {
  const cached = globalThis.__lpRewardsSnapshot;
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_MS) return cached;
  }
  await hydrateFromDb();
  const snapshot = await buildSnapshot();
  persistToDb().catch(e => console.error('[lp-rewards] persist error:', e));
  return snapshot;
}
