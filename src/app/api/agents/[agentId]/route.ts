import { NextRequest, NextResponse } from 'next/server';
import { getAgent } from '@/lib/exchange';

/**
 * GET /api/agents/:agentId - Get single agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    createdAt: agent.createdAt.toISOString(),
    startingCapital: agent.startingCapital,
  });
}
