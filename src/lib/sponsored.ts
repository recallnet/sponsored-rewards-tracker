/**
 * On-chain indexer for Polymarket sponsored rewards.
 *
 * Reads `Sponsored` and `Withdrawn` events from the Polymarket
 * rewards-sponsorship contract on Polygon, then enriches each
 * market with its question text via the Gamma API.
 *
 * Contract: 0xf7cD89BE08Af4D4D6B1522852ceD49FC10169f64
 * Deployed at block 82810472.
 */

const REWARDS_CONTRACT = '0xf7cD89BE08Af4D4D6B1522852ceD49FC10169f64';
const DEPLOY_BLOCK = 82_810_472;
const USDC_DECIMALS = 1e6;

const SPONSORED_TOPIC = '0xa0e1f8e6fb6dd49d885fabbf89adb64c0ef2b16b2786c92d6851742572fb1d14';

const WITHDRAWN_TOPIC = '0xb607e1cd434478843932237c1441e30dade0dd0b82ec588670a1d43dea0599de';

const RPC_ENDPOINTS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://1rpc.io/matic',
  'https://rpc-mainnet.matic.quiknode.pro',
  'https://polygon.drpc.org',
];

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const CHUNK_SIZE = 40_000;
const RPC_TIMEOUT_MS = 15_000;

/* ─────── types ─────── */

export interface SponsoredEvent {
  marketId: string;
  sponsor: string;
  amountUsdc: number;
  startTime: string;
  endTime: string;
  durationDays: number;
  ratePerDayUsdc: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp?: string;
  marketQuestion?: string;
  marketSlug?: string;
  eventSlug?: string;
  withdrawn: boolean;
  returnedUsdc: number;
  consumedUsdc: number;
}

export interface SponsoredSnapshot {
  events: SponsoredEvent[];
  overall: {
    totalEvents: number;
    uniqueSponsors: number;
    uniqueMarkets: number;
    totalAmountUsdc: number;
    netAmountUsdc: number;
    totalReturnedUsdc: number;
    totalConsumedUsdc: number;
  };
  fetchedAt: string;
  fromBlock: number;
  toBlock: number;
}

/* ─────── RPC helpers ─────── */

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const d = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (d.error) continue;
      return d.result;
    } catch {
      continue;
    }
  }
  throw new Error(`All RPCs failed for ${method}`);
}

async function getLatestBlock(): Promise<number> {
  const hex = (await rpcCall('eth_blockNumber', [])) as string;
  return parseInt(hex, 16);
}

interface RawLog {
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
}

async function fetchLogsChunk(topic0: string, from: number, to: number): Promise<RawLog[]> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getLogs',
        params: [{
          address: REWARDS_CONTRACT,
          topics: [topic0],
          fromBlock: '0x' + from.toString(16),
          toBlock: '0x' + to.toString(16),
        }],
      });
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const d = (await res.json()) as { result?: RawLog[]; error?: unknown };
      if (d.result) return d.result;
    } catch { continue; }
  }
  return [];
}

async function fetchLogs(topic0: string, fromBlock: number, toBlock: number): Promise<RawLog[]> {
  const chunks: { from: number; to: number }[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK_SIZE + 1) {
    chunks.push({ from, to: Math.min(from + CHUNK_SIZE, toBlock) });
  }

  const CONCURRENCY = 10;
  const allLogs: RawLog[] = [];
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(c => fetchLogsChunk(topic0, c.from, c.to))
    );
    for (const logs of results) allLogs.push(...logs);
  }
  return allLogs;
}

/* ─────── event decoders ─────── */

function decodeSponsoredLog(log: RawLog): SponsoredEvent {
  const marketId = log.topics[1];
  const sponsor = '0x' + log.topics[2].slice(26);
  const data = log.data.slice(2);
  const amount = BigInt('0x' + data.slice(0, 64));
  const startTime = Number(BigInt('0x' + data.slice(64, 128)));
  const endTime = Number(BigInt('0x' + data.slice(128, 192)));
  const ratePerMinute = BigInt('0x' + data.slice(192, 256));
  const durationMinutes = (endTime - startTime) / 60;
  return {
    marketId,
    sponsor,
    amountUsdc: Number(amount) / USDC_DECIMALS,
    startTime: new Date(startTime * 1000).toISOString(),
    endTime: new Date(endTime * 1000).toISOString(),
    durationDays: Math.round(durationMinutes / (60 * 24)),
    ratePerDayUsdc: (Number(ratePerMinute) / USDC_DECIMALS) * 60 * 24,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    withdrawn: false,
    returnedUsdc: 0,
    consumedUsdc: 0,
  };
}

interface WithdrawnDecoded {
  marketId: string;
  sponsor: string;
  returnedUsdc: number;
  consumedUsdc: number;
}

function decodeWithdrawnLog(log: RawLog): WithdrawnDecoded {
  const marketId = log.topics[1];
  const sponsor = '0x' + log.topics[2].slice(26);
  const data = log.data.slice(2);
  const returned = BigInt('0x' + data.slice(0, 64));
  const consumed = BigInt('0x' + data.slice(64, 128));
  return {
    marketId,
    sponsor,
    returnedUsdc: Number(returned) / USDC_DECIMALS,
    consumedUsdc: Number(consumed) / USDC_DECIMALS,
  };
}

/* ─────── Gamma enrichment ─────── */

interface GammaMarket {
  conditionId?: string;
  question?: string;
  slug?: string;
  events?: { slug?: string }[];
}

async function enrichMarketNames(events: SponsoredEvent[]): Promise<void> {
  const conditionIds = [...new Set(events.map(e => e.marketId))];
  const batchSize = 50;
  const CONCURRENCY = 10;
  const map = new Map<string, { question: string; slug: string; eventSlug: string }>();

  const batches: string[][] = [];
  for (let i = 0; i < conditionIds.length; i += batchSize) {
    batches.push(conditionIds.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (batch) => {
      const qs = batch.map(id => `condition_ids=${id}`).join('&');
      try {
        const res = await fetch(`${GAMMA_BASE}/markets?${qs}&limit=${batch.length}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return;
        const markets = (await res.json()) as GammaMarket[];
        for (const m of markets) {
          const cid = m.conditionId ?? '';
          const eventSlug = m.events?.[0]?.slug ?? '';
          if (cid) map.set(cid, { question: m.question ?? '', slug: m.slug ?? '', eventSlug });
        }
      } catch { /* best-effort */ }
    }));
  }

  for (const ev of events) {
    const info = map.get(ev.marketId);
    if (info) {
      ev.marketQuestion = info.question;
      ev.marketSlug = info.slug;
      ev.eventSlug = info.eventSlug;
    }
  }
}

/* ─────── main scan ─────── */

declare global {
  // eslint-disable-next-line no-var
  var __sponsoredSnapshot: SponsoredSnapshot | undefined;
}

const STALE_MS = 5 * 60 * 1000;

export async function fetchSponsoredRewards(force = false): Promise<SponsoredSnapshot> {
  const cached = globalThis.__sponsoredSnapshot;
  if (!force && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < STALE_MS) return cached;
  }

  const latestBlock = await getLatestBlock();
  const fromBlock = cached?.toBlock ? cached.toBlock + 1 : DEPLOY_BLOCK;

  const [sponsoredLogs, withdrawnLogs] = await Promise.all([
    fetchLogs(SPONSORED_TOPIC, fromBlock, latestBlock),
    fetchLogs(WITHDRAWN_TOPIC, fromBlock, latestBlock),
  ]);
  const newEvents = sponsoredLogs.map(decodeSponsoredLog);

  const withdrawals = withdrawnLogs.map(decodeWithdrawnLog);
  const withdrawMap = new Map<string, WithdrawnDecoded>();
  for (const w of withdrawals) {
    const key = `${w.marketId}:${w.sponsor.toLowerCase()}`;
    withdrawMap.set(key, w);
  }

  for (const ev of newEvents) {
    const key = `${ev.marketId}:${ev.sponsor.toLowerCase()}`;
    const w = withdrawMap.get(key);
    if (w) {
      ev.withdrawn = true;
      ev.returnedUsdc = w.returnedUsdc;
      ev.consumedUsdc = w.consumedUsdc;
    }
  }

  const allEvents = cached ? [...cached.events, ...newEvents] : newEvents;

  if (cached && withdrawals.length > 0) {
    for (const ev of allEvents) {
      const key = `${ev.marketId}:${ev.sponsor.toLowerCase()}`;
      const w = withdrawMap.get(key);
      if (w) {
        ev.withdrawn = true;
        ev.returnedUsdc = w.returnedUsdc;
        ev.consumedUsdc = w.consumedUsdc;
      }
    }
  }

  await enrichMarketNames(allEvents.filter(e => !e.marketQuestion));

  const uniqueSponsors = new Set(allEvents.map(e => e.sponsor.toLowerCase()));
  const uniqueMarkets = new Set(allEvents.map(e => e.marketId));
  const totalAmountUsdc = allEvents.reduce((s, e) => s + e.amountUsdc, 0);
  const totalReturnedUsdc = allEvents.reduce((s, e) => s + e.returnedUsdc, 0);
  const totalConsumedUsdc = allEvents.reduce((s, e) => s + e.consumedUsdc, 0);

  const snapshot: SponsoredSnapshot = {
    events: allEvents.sort((a, b) => b.amountUsdc - a.amountUsdc),
    overall: {
      totalEvents: allEvents.length,
      uniqueSponsors: uniqueSponsors.size,
      uniqueMarkets: uniqueMarkets.size,
      totalAmountUsdc,
      netAmountUsdc: totalAmountUsdc - totalReturnedUsdc,
      totalReturnedUsdc,
      totalConsumedUsdc,
    },
    fetchedAt: new Date().toISOString(),
    fromBlock: DEPLOY_BLOCK,
    toBlock: latestBlock,
  };

  globalThis.__sponsoredSnapshot = snapshot;
  return snapshot;
}
