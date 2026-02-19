import { NextRequest, NextResponse } from 'next/server';
import { getCachedOrFreshOpportunities } from '@/lib/opportunities';
import type { RewardType } from '@/lib/opportunities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const rewardOnlyParam = request.nextUrl.searchParams.get('rewardOnly');
    const rewardOnly = rewardOnlyParam === null ? true : rewardOnlyParam !== '0';
    const typeParam = request.nextUrl.searchParams.get('type');
    const rewardType: RewardType = typeParam === 'sponsored' ? 'sponsored' : 'lp';
    const snapshot = await getCachedOrFreshOpportunities(force, { rewardOnly, rewardType });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const gammaUnavailable = message.toLowerCase().includes('gamma api unavailable');
    return NextResponse.json(
      {
        error: 'Failed to load opportunities',
        message,
      },
      { status: gammaUnavailable ? 503 : 500 }
    );
  }
}
