import { NextRequest, NextResponse } from 'next/server';
import { fetchLpRewards } from '@/lib/lp-rewards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const snapshot = await fetchLpRewards(force);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load LP rewards', message },
      { status: 500 }
    );
  }
}
