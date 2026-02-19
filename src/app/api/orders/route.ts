import { NextRequest, NextResponse } from 'next/server';
import { submitOrder, getAgentByApiKey } from '@/lib/exchange';
import type { Venue, Side, Action, OrderType } from '@/lib/exchange';

/**
 * POST /api/orders - Submit an order
 *
 * Headers:
 *   X-Agent-Key: sk_xxx
 *
 * Body:
 *   venue: "POLYMARKET" | "KALSHI"
 *   marketId: string
 *   side: "YES" | "NO"
 *   action: "BUY" | "SELL"
 *   quantity: number
 *   orderType: "MARKET" | "LIMIT" | "IOC" | "FOK"
 *   limitPrice?: number
 *   marketTitle?: string
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate agent
    const apiKey = request.headers.get('X-Agent-Key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-Agent-Key header' }, { status: 401 });
    }

    const agent = getAgentByApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { venue, marketId, side, action, quantity, orderType, limitPrice, marketTitle } = body;

    // Validate required fields
    if (!venue || !marketId || !side || !action || !quantity || !orderType) {
      return NextResponse.json(
        { error: 'Missing required fields: venue, marketId, side, action, quantity, orderType' },
        { status: 400 }
      );
    }

    // Validate enums
    if (!['POLYMARKET', 'KALSHI'].includes(venue)) {
      return NextResponse.json(
        { error: 'Invalid venue. Must be POLYMARKET or KALSHI' },
        { status: 400 }
      );
    }

    if (!['YES', 'NO'].includes(side)) {
      return NextResponse.json({ error: 'Invalid side. Must be YES or NO' }, { status: 400 });
    }

    if (!['BUY', 'SELL'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be BUY or SELL' }, { status: 400 });
    }

    // Submit order
    const result = submitOrder(
      agent.id,
      {
        venue: venue as Venue,
        marketId,
        side: side as Side,
        action: action as Action,
        quantity: Number(quantity),
        orderType: orderType as OrderType,
        limitPrice: limitPrice ? Number(limitPrice) : undefined,
      },
      marketTitle
    );

    return NextResponse.json({
      orderId: result.orderId,
      status: result.status,
      filledQty: result.filledQty,
      avgPrice: result.avgPrice,
      fees: result.fees,
      timestamp: result.timestamp.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
