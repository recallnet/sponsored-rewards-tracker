import { NextRequest, NextResponse } from 'next/server';
import { fetchLpRewards } from '@/lib/lp-rewards';
import { fetchSponsoredRewards } from '@/lib/sponsored';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.toLowerCase().includes('vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const lp = await fetchLpRewards(true);
    results.lp = { ok: true, markets: lp.overall.totalMarkets, daily: lp.overall.totalDailyRewards };
  } catch (e) {
    results.lp = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  try {
    const sp = await fetchSponsoredRewards(true);
    results.sponsored = { ok: true, events: sp.overall.totalEvents, markets: sp.overall.uniqueMarkets };
  } catch (e) {
    results.sponsored = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString(), ...results });
}
