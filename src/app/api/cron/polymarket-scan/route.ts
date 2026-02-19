import { NextRequest, NextResponse } from 'next/server';
import { scanAllPolymarketMarkets } from '@/lib/opportunities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(req: NextRequest): boolean {
  const userAgent = req.headers.get('user-agent') ?? '';
  if (userAgent.toLowerCase().includes('vercel-cron')) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow if no secret configured yet

  const authHeader = req.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await scanAllPolymarketMarkets();
    return NextResponse.json({
      ok: true,
      fetchedAt: snapshot.fetchedAt,
      source: snapshot.source,
      scannedCount: snapshot.scannedCount,
      topCount: snapshot.opportunities.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
