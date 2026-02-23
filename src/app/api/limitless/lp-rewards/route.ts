import { NextRequest, NextResponse } from 'next/server';
import { fetchLimitlessLpRewards } from '@/lib/limitless';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const data = await fetchLimitlessLpRewards(force);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[limitless/lp-rewards]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
