import { NextRequest, NextResponse } from 'next/server';
import { getMarketPrice, getOrderbook } from '@/lib/replay-lab/client';

/**
 * GET /api/markets/:marketId?venue=POLYMARKET|KALSHI
 *
 * Get real market price and orderbook from Replay Lab
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  const { marketId } = await params;
  const { searchParams } = new URL(request.url);
  const venue = (searchParams.get('venue') ?? 'POLYMARKET').toUpperCase() as
    | 'POLYMARKET'
    | 'KALSHI';

  try {
    const [price, orderbook] = await Promise.all([
      getMarketPrice(venue, marketId),
      getOrderbook(venue, marketId),
    ]);

    if (!price) {
      return NextResponse.json(
        { error: 'Market not found or Replay Lab unavailable' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      marketId,
      venue,
      yesPrice: price.yesPrice,
      noPrice: price.noPrice,
      timestamp: price.timestamp.toISOString(),
      orderbook: orderbook ?? { bids: [], asks: [] },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
