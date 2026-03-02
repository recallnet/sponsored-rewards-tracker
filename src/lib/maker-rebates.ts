/**
 * On-chain indexer for Polymarket maker rebates.
 *
 * Tracks USDC.e Transfer events FROM the Polymarket fee distributor
 * to maker addresses on Polygon. The distributor uses Multicall3
 * to batch ~200 transfers per transaction (~9 txns per day = ~1700 makers).
 *
 * The distributor address changes daily, so we discover it by finding
 * the address that made the most batch USDC.e transfers in a 24h window.
 *
 * Token: USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
 *
 * Fee-enabled market types:
 * - 15-min crypto (since Jan 19, 2026) — 20% of taker fees
 * - 5-min crypto  (since Feb 12, 2026) — 20% of taker fees
 * - NCAAB / Serie A (since Feb 18, 2026) — 25% of taker fees
 */

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
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

export interface DailyTotal {
  date: string;
  totalUsdc: number;
  transfers: number;
  receivers: number;
  distributor: string;
}

export interface TopReceiver {
  address: string;
  amount1d: number;
  amount7d: number;
  amountAll: number;
  pct1d: number;
}

export interface MakerRebatesSnapshot {
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

/* ─────── RPC helpers ─────── */

interface RawLog {
  topics: string[];
  data: string;
  transactionHash: string;
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
  address: string, topics: (string | null)[], from: number, to: number
): Promise<RawLog[]> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getLogs',
          params: [{ address, topics, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) }],
        }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const d = (await res.json()) as { result?: RawLog[]; error?: unknown };
      if (d.result && d.result.length > 0) return d.result;
      if (d.error) continue;
    } catch { continue; }
  }
  return [];
}

async function fetchAllLogs(
  address: string, topics: (string | null)[], fromBlock: number, toBlock: number
): Promise<RawLog[]> {
  const chunks: { from: number; to: number }[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK_SIZE + 1) {
    chunks.push({ from, to: Math.min(from + CHUNK_SIZE, toBlock) });
  }
  const CONCURRENCY = 6;
  const allLogs: RawLog[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(c => fetchLogsChunk(address, topics, c.from, c.to))
    );
    for (const logs of results) allLogs.push(...logs);
  }
  return allLogs;
}

/* ─────── distributor discovery ─────── */

/**
 * Finds the distributor for a ~24h window by scanning USDC.e Transfer events
 * FROM a known distributor (indexed as topics[1]) to the Multicall3 pattern.
 * A distributor is identified as any address that made 500+ USDC.e transfers
 * as sender (topics[1]) within the block range.
 */
async function discoverDistributor(fromBlock: number, toBlock: number): Promise<string | null> {
  const knownDistributors = getCachedDistributors();
  for (const dist of knownDistributors) {
    const distTopic = '0x000000000000000000000000' + dist.slice(2);
    const logs = await fetchAllLogs(USDC_E, [TRANSFER_TOPIC, distTopic], fromBlock, toBlock);
    if (logs.length >= 100) return dist;
  }
  return null;
}

function getCachedDistributors(): string[] {
  const cache = globalThis.__makerRebateCache;
  if (!cache) return [];
  return [...new Set(cache.dailyTotals.map(d => d.distributor))];
}

/**
 * Get multiple block timestamps for accurate date interpolation.
 */
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

/**
 * Scans outgoing USDC.e transfers from a known distributor.
 */
async function scanDistributor(
  distributor: string, fromBlock: number, toBlock: number
): Promise<{ transfers: { to: string; amount: number; date: string }[]; total: number }> {
  const distTopic = '0x000000000000000000000000' + distributor.slice(2);
  const logs = await fetchAllLogs(USDC_E, [TRANSFER_TOPIC, distTopic], fromBlock, toBlock);

  if (logs.length === 0) return { transfers: [], total: 0 };

  const refs = await getBlockTimestampRange(fromBlock, toBlock);

  let total = 0;
  const transfers = logs.map(log => {
    const to = '0x' + log.topics[2].slice(26);
    const amount = Number(BigInt(log.data)) / USDC_DECIMALS;
    const blockNum = parseInt(log.blockNumber, 16);
    const ts = interpolateTimestamp(blockNum, refs);
    const date = new Date(ts * 1000).toISOString().split('T')[0];
    total += amount;
    return { to, amount, date };
  });

  return { transfers, total };
}

/* ─────── build snapshot ─────── */

async function buildSnapshot(): Promise<MakerRebatesSnapshot> {
  const latestBlock = await getLatestBlock();
  const refTs = await getBlockTimestamp(latestBlock);
  const cache = globalThis.__makerRebateCache;

  const KNOWN_DISTRIBUTOR = '0x3a9418b2651c8164db5ebc56f12008137865e0f7';

  const scanFrom = cache?.lastScannedBlock
    ? cache.lastScannedBlock + 1
    : latestBlock - BLOCKS_PER_DAY * 3;
  const scanTo = latestBlock;

  let distributor = KNOWN_DISTRIBUTOR;
  const discovered = await discoverDistributor(scanFrom, scanTo);
  if (discovered) distributor = discovered;

  const { transfers } = await scanDistributor(distributor, scanFrom, scanTo);

  const prevDailys = cache?.dailyTotals ?? [];
  const prevReceiverAll = cache?.receiverAll ?? new Map<string, number>();

  const dailyMap = new Map<string, { total: number; count: number; receivers: Set<string>; distributor: string }>();
  for (const d of prevDailys) {
    dailyMap.set(d.date, {
      total: d.totalUsdc, count: d.transfers,
      receivers: new Set(), distributor: d.distributor
    });
  }

  const receiverAll = new Map(prevReceiverAll);
  const today = new Date(refTs * 1000).toISOString().split('T')[0];
  const cutoff1d = today;
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
      dailyMap.set(t.date, {
        total: t.amount, count: 1,
        receivers: new Set([t.to]), distributor
      });
    }

    receiverAll.set(t.to, (receiverAll.get(t.to) ?? 0) + t.amount);

    if (t.date >= cutoff1d) {
      receiver1d.set(t.to, (receiver1d.get(t.to) ?? 0) + t.amount);
    }
    if (t.date >= cutoff7d) {
      receiver7d.set(t.to, (receiver7d.get(t.to) ?? 0) + t.amount);
    }
  }

  const dailyTotals: DailyTotal[] = [...dailyMap.entries()]
    .map(([date, info]) => ({
      date,
      totalUsdc: Math.round(info.total * 100) / 100,
      transfers: info.count,
      receivers: info.receivers.size || info.count,
      distributor: info.distributor || distributor,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let total1d = [...receiver1d.values()].reduce((s, v) => s + v, 0);
  if (total1d === 0 && dailyTotals.length > 0) {
    const lastDay = dailyTotals[dailyTotals.length - 1];
    total1d = lastDay.totalUsdc;
  }
  const total7d = [...receiver7d.values()].reduce((s, v) => s + v, 0) || 
    dailyTotals.reduce((s, d) => s + d.totalUsdc, 0);
  const totalAll = [...receiverAll.values()].reduce((s, v) => s + v, 0);
  const totalTransfers = dailyTotals.reduce((s, d) => s + d.transfers, 0);

  const topReceivers: TopReceiver[] = [...receiverAll.entries()]
    .map(([addr, allAmt]) => ({
      address: addr,
      amount1d: Math.round((receiver1d.get(addr) ?? 0) * 100) / 100,
      amount7d: Math.round((receiver7d.get(addr) ?? 0) * 100) / 100,
      amountAll: Math.round(allAmt * 100) / 100,
      pct1d: total1d > 0 ? Math.round(((receiver1d.get(addr) ?? 0) / total1d) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.amount1d - a.amount1d)
    .slice(0, 50);

  const daysCount = dailyTotals.length || 1;

  const snapshot: MakerRebatesSnapshot = {
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
    fromBlock: latestBlock - BLOCKS_PER_DAY * 2,
    toBlock: latestBlock,
  };

  globalThis.__makerRebateCache = {
    dailyTotals,
    receiverAll,
    lastScannedBlock: latestBlock,
    distributors: [...new Set([distributor, ...getCachedDistributors()])],
  };
  globalThis.__makerRebatesSnapshot = snapshot;
  return snapshot;
}

/* ─────── cache ─────── */

import { loadCache, saveCache } from './db';

interface CacheData {
  dailyTotals: DailyTotal[];
  receiverAll: Map<string, number>;
  lastScannedBlock: number;
  distributors: string[];
}

declare global {
  var __makerRebatesSnapshot: MakerRebatesSnapshot | undefined;
  var __makerRebateCache: CacheData | undefined;
}

const STALE_MS = 5 * 60 * 1000;

async function hydrateFromDb(): Promise<void> {
  if (globalThis.__makerRebateCache) return;
  const row = await loadCache('maker');
  if (!row) return;
  const v = row.value as {
    dailyTotals: DailyTotal[];
    receiverAll: Record<string, number>;
    distributors: string[];
  };
  globalThis.__makerRebateCache = {
    dailyTotals: v.dailyTotals ?? [],
    receiverAll: new Map(Object.entries(v.receiverAll ?? {})),
    lastScannedBlock: row.lastBlock,
    distributors: v.distributors ?? [],
  };
  console.log(`[maker-rebates] Hydrated from DB: ${v.dailyTotals?.length ?? 0} days, block ${row.lastBlock}`);
}

async function persistToDb(): Promise<void> {
  const cache = globalThis.__makerRebateCache;
  if (!cache) return;
  const serialized = {
    dailyTotals: cache.dailyTotals,
    receiverAll: Object.fromEntries(cache.receiverAll),
    distributors: cache.distributors,
  };
  await saveCache('maker', serialized, cache.lastScannedBlock);
}

export async function fetchMakerRebates(force = false): Promise<MakerRebatesSnapshot> {
  const cached = globalThis.__makerRebatesSnapshot;
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_MS) return cached;
  }
  await hydrateFromDb();
  const snapshot = await buildSnapshot();
  persistToDb().catch(e => console.error('[maker-rebates] persist error:', e));
  return snapshot;
}
