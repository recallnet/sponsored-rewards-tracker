import { NextRequest, NextResponse } from 'next/server';
import { getTrades, getAgent } from '@/lib/exchange';

/**
 * GET /api/trades/:agentId - Get trade history for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);

  try {
    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const trades = getTrades(agentId, limit);

    return NextResponse.json({
      agentId,
      trades: trades.map(t => ({
        id: t.id,
        orderId: t.orderId,
        venue: t.venue,
        marketId: t.marketId,
        marketTitle: t.marketTitle,
        side: t.side,
        action: t.action,
        quantity: t.quantity,
        price: t.price,
        fees: t.fees,
        total: t.total,
        timestamp: t.timestamp.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
