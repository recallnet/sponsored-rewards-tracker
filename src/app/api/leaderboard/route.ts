import { NextResponse } from 'next/server';
import { getLeaderboard, seedDemoData } from '@/lib/exchange';

// Seed demo data on first request
let seeded = false;

function ensureSeeded() {
  if (!seeded) {
    seedDemoData();
    seeded = true;
  }
}

/**
 * GET /api/leaderboard - Get agent leaderboard
 */
export async function GET() {
  ensureSeeded();

  const leaderboard = getLeaderboard();

  return NextResponse.json({
    agents: leaderboard.map(entry => ({
      rank: entry.rank,
      agentId: entry.agentId,
      name: entry.name,
      totalPnL: entry.totalPnL,
      returnPct: entry.returnPct,
      trades: entry.trades,
      winRate: entry.winRate,
    })),
  });
}
