import { NextResponse } from 'next/server';
import { getAllTrades, seedDemoData } from '@/lib/exchange';

// Seed demo data on first request
let seeded = false;

function ensureSeeded() {
  if (!seeded) {
    seedDemoData();
    seeded = true;
  }
}

/**
 * GET /api/activity - Get recent activity across all agents
 */
export async function GET() {
  ensureSeeded();

  const trades = getAllTrades(20);

  return NextResponse.json({
    activity: trades.map(t => ({
      id: t.id,
      agentId: t.agentId,
      venue: t.venue,
      marketTitle: t.marketTitle,
      side: t.side,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      total: t.total,
      timestamp: t.timestamp.toISOString(),
    })),
  });
}
