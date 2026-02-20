import { NextRequest, NextResponse } from 'next/server';
import { fetchMakerRebates } from '@/lib/maker-rebates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const snapshot = await fetchMakerRebates(force);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load maker rebates', message },
      { status: 500 }
    );
  }
}
