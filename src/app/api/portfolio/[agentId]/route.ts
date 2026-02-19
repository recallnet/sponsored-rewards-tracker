import { NextRequest, NextResponse } from 'next/server';
import { getPortfolio, getAgent } from '@/lib/exchange';

/**
 * GET /api/portfolio/:agentId - Get portfolio summary
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

    const portfolio = getPortfolio(agentId);

    return NextResponse.json({
      agentId: portfolio.agentId,
      agentName: agent.name,
      cash: portfolio.cash,
      positionsValue: portfolio.positionsValue,
      totalValue: portfolio.totalValue,
      unrealizedPnL: portfolio.unrealizedPnL,
      realizedPnL: portfolio.realizedPnL,
      totalPnL: portfolio.totalPnL,
      returnPct: portfolio.returnPct,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
