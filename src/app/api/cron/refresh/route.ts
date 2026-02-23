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

  const [lpResult, spResult, mrResult] = await Promise.allSettled([
    fetchLpRewards(true),
    fetchSponsoredRewards(true),
    fetchMakerRebates(true),
  ]);

  const results: Record<string, unknown> = {};

  if (lpResult.status === 'fulfilled') {
    const lp = lpResult.value;
    results.lp = { ok: true, total1d: lp.overall.total1d, receivers: lp.overall.totalReceivers };
  } else {
    results.lp = { ok: false, error: lpResult.reason instanceof Error ? lpResult.reason.message : 'unknown' };
  }

  if (spResult.status === 'fulfilled') {
    const sp = spResult.value;
    results.sponsored = { ok: true, events: sp.overall.totalEvents, markets: sp.overall.uniqueMarkets };
  } else {
    results.sponsored = { ok: false, error: spResult.reason instanceof Error ? spResult.reason.message : 'unknown' };
  }

  if (mrResult.status === 'fulfilled') {
    const mr = mrResult.value;
    results.maker = { ok: true, total1d: mr.overall.total1d, receivers: mr.overall.totalReceivers };
  } else {
    results.maker = { ok: false, error: mrResult.reason instanceof Error ? mrResult.reason.message : 'unknown' };
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString(), ...results });
}
