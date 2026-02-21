import { NextRequest, NextResponse } from 'next/server';
import { fetchLpRewards } from '@/lib/lp-rewards';
import { fetchSponsoredRewards } from '@/lib/sponsored';
import { fetchMakerRebates } from '@/lib/maker-rebates';
import { initDb } from '@/lib/db';

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

  await initDb().catch(e => console.error('[cron] initDb error:', e));

  const results: Record<string, unknown> = {};

  try {
    const lp = await fetchLpRewards(true);
    results.lp = { ok: true, total1d: lp.overall.total1d, receivers: lp.overall.totalReceivers };
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
    results.maker = { ok: true, total1d: mr.overall.total1d, receivers: mr.overall.totalReceivers };
  } catch (e) {
    results.maker = { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString(), ...results });
}
