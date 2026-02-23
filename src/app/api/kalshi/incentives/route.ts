import { NextRequest, NextResponse } from 'next/server';
import { fetchKalshiIncentives } from '@/lib/kalshi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const data = await fetchKalshiIncentives(force);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[kalshi/incentives]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
