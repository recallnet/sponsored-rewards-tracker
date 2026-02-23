import { NextRequest, NextResponse } from 'next/server';
import { fetchSponsoredRewards } from '@/lib/sponsored';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const snapshot = await fetchSponsoredRewards(force);
    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load sponsored rewards', message },
      { status: 500 }
    );
  }
}
