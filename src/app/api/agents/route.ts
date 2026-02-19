import { NextRequest, NextResponse } from 'next/server';
import { registerAgent, getAllAgents, seedDemoData } from '@/lib/exchange';

// Seed demo data on first request
let seeded = false;

function ensureSeeded() {
  if (!seeded) {
    seedDemoData();
    seeded = true;
  }
}

/**
 * GET /api/agents - List all agents
 */
export async function GET() {
  ensureSeeded();

  const agents = getAllAgents();

  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
      startingCapital: a.startingCapital,
    })),
  });
}

/**
 * POST /api/agents - Register a new agent
 */
export async function POST(request: NextRequest) {
  ensureSeeded();

  try {
    const body = await request.json();
    const { name, description, startingCapital } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const agent = registerAgent(name, description ?? '', startingCapital ?? 10000);

    return NextResponse.json({
      agentId: agent.id,
      apiKey: agent.apiKey,
      name: agent.name,
      startingCapital: agent.startingCapital,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
