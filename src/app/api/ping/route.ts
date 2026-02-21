import { NextResponse } from 'next/server';
import { fetchLpRewards } from '@/lib/lp-rewards';
import { fetchSponsoredRewards } from '@/lib/sponsored';
import { fetchMakerRebates } from '@/lib/maker-rebates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const THROTTLE_MS = 3 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __lastPingAt: number | undefined;
}

export async function GET() {
  const last = globalThis.__lastPingAt ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < THROTTLE_MS) {
    return NextResponse.json({
      status: 'throttled',
      nextScanInMs: THROTTLE_MS - elapsed,
    });
  }

  globalThis.__lastPingAt = Date.now();
  const t0 = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const lp = await fetchLpRewards(true);
    results.lp = { ok: true, total1d: lp.overall.total1d, days: lp.dailyTotals.length };
  } catch (e) {
    results.lp = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  try {
    const sp = await fetchSponsoredRewards(true);
    results.sponsored = { ok: true, events: sp.overall.totalEvents, markets: sp.overall.uniqueMarkets };
  } catch (e) {
    results.sponsored = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  try {
    const mr = await fetchMakerRebates(true);
    results.maker = { ok: true, total1d: mr.overall.total1d, days: mr.dailyTotals.length };
  } catch (e) {
    results.maker = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  return NextResponse.json({
    status: 'scanned',
    durationMs: Date.now() - t0,
    scannedAt: new Date().toISOString(),
    ...results,
  });
}
