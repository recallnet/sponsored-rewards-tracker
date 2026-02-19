import { NextRequest, NextResponse } from 'next/server';
import { getPositions, getAgent } from '@/lib/exchange';

/**
 * GET /api/positions/:agentId - Get all positions for an agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const positions = getPositions(agentId);

    return NextResponse.json({
      agentId,
      positions: positions.map(p => ({
        id: p.id,
        venue: p.venue,
        marketId: p.marketId,
        marketTitle: p.marketTitle,
        side: p.side,
        quantity: p.quantity,
        avgEntryPrice: p.avgEntryPrice,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPct: p.unrealizedPnLPct,
        openedAt: p.openedAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
