/**
 * Paper Exchange Engine
 *
 * Simulates order execution with realistic fills, slippage, and fees.
 * Uses real market prices from Replay Lab.
 */

import { calculateFee } from './fees';
import type {
  Agent,
  Order,
  Position,
  Trade,
  Portfolio,
  LeaderboardEntry,
  SubmitOrderRequest,
  SubmitOrderResponse,
  OrderStatus,
  Venue,
  Side,
  Action,
} from './types';

// =============================================================================
// In-Memory Storage (Persists across Next.js HMR)
// =============================================================================

// Use globalThis to persist across Hot Module Replacement in dev mode
declare global {
  var cheffStore:
    | {
        agents: Map<string, Agent>;
        orders: Map<string, Order>;
        positions: Map<string, Position>;
        trades: Map<string, Trade>;
        cash: Map<string, number>;
        realizedPnL: Map<string, number>;
      }
    | undefined;
}

if (!globalThis.cheffStore) {
  globalThis.cheffStore = {
    agents: new Map(),
    orders: new Map(),
    positions: new Map(),
    trades: new Map(),
    cash: new Map(),
    realizedPnL: new Map(),
  };
}

const agents = globalThis.cheffStore.agents;
const orders = globalThis.cheffStore.orders;
const positions = globalThis.cheffStore.positions;
const trades = globalThis.cheffStore.trades;
const cash = globalThis.cheffStore.cash;
const realizedPnL = globalThis.cheffStore.realizedPnL;

// =============================================================================
// ID Generation
// =============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateApiKey(): string {
  return `sk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

// =============================================================================
// Agent Management
// =============================================================================

export function registerAgent(
  name: string,
  description: string = '',
  startingCapital: number = 10000
): Agent {
  const agent: Agent = {
    id: generateId('agent'),
    name,
    description,
    apiKey: generateApiKey(),
    createdAt: new Date(),
    startingCapital,
  };

  agents.set(agent.id, agent);
  cash.set(agent.id, startingCapital);
  realizedPnL.set(agent.id, 0);

  return agent;
}

export function getAgent(agentId: string): Agent | undefined {
  return agents.get(agentId);
}

export function getAgentByApiKey(apiKey: string): Agent | undefined {
  for (const agent of agents.values()) {
    if (agent.apiKey === apiKey) {
      return agent;
    }
  }
  return undefined;
}

export function getAllAgents(): Agent[] {
  return Array.from(agents.values());
}

// =============================================================================
// Price Management - Uses Replay Lab for Real Prices
// =============================================================================

import { getMarketPrice as fetchReplayLabPrice } from '../replay-lab/client';

// Price cache with TTL (30 seconds)
const priceCache: Map<string, { yesPrice: number; noPrice: number; fetchedAt: number }> = new Map();
const PRICE_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Set a price manually (for testing or when Replay Lab is unavailable)
 */
export function setMockPrice(venue: Venue, marketId: string, yesPrice: number): void {
  const key = `${venue}:${marketId}`;
  priceCache.set(key, { yesPrice, noPrice: 1 - yesPrice, fetchedAt: Date.now() });
}

/**
 * Get price - first checks cache, then fetches from Replay Lab
 * Falls back to default price if Replay Lab is unavailable
 */
export function getPrice(venue: Venue, marketId: string): { yesPrice: number; noPrice: number } {
  const key = `${venue}:${marketId}`;
  const cached = priceCache.get(key);

  // Return cached price if still valid
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return { yesPrice: cached.yesPrice, noPrice: cached.noPrice };
  }

  // Trigger async fetch but return cached/default immediately
  // This prevents blocking order execution
  fetchPriceAsync(venue, marketId);

  // Return cached (even if stale) or default
  if (cached) {
    return { yesPrice: cached.yesPrice, noPrice: cached.noPrice };
  }

  // Default price if nothing cached
  const defaultPrice = { yesPrice: 0.5, noPrice: 0.5 };
  return defaultPrice;
}

/**
 * Async price fetch from Replay Lab
 */
async function fetchPriceAsync(venue: Venue, marketId: string): Promise<void> {
  try {
    const price = await fetchReplayLabPrice(venue, marketId);
    if (price) {
      const key = `${venue}:${marketId}`;
      priceCache.set(key, {
        yesPrice: price.yesPrice,
        noPrice: price.noPrice,
        fetchedAt: Date.now(),
      });
    }
  } catch (error) {
    // Silently fail - will use cached or default price
  }
}

/**
 * Force refresh price from Replay Lab (blocking)
 */
export async function refreshPrice(
  venue: Venue,
  marketId: string
): Promise<{ yesPrice: number; noPrice: number } | null> {
  const price = await fetchReplayLabPrice(venue, marketId);
  if (price) {
    const key = `${venue}:${marketId}`;
    priceCache.set(key, {
      yesPrice: price.yesPrice,
      noPrice: price.noPrice,
      fetchedAt: Date.now(),
    });
    return { yesPrice: price.yesPrice, noPrice: price.noPrice };
  }
  return null;
}

// =============================================================================
// Order Execution
// =============================================================================

export function submitOrder(
  agentId: string,
  request: SubmitOrderRequest,
  marketTitle?: string
): SubmitOrderResponse {
  const agent = agents.get(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const agentCash = cash.get(agentId) ?? 0;
  const prices = getPrice(request.venue, request.marketId);
  const price = request.side === 'YES' ? prices.yesPrice : prices.noPrice;

  // Apply slight slippage for market orders (0.5% average)
  const slippage = request.orderType === 'MARKET' ? 1 + (Math.random() * 0.01 - 0.005) : 1;
  const fillPrice = request.action === 'BUY' ? price * slippage : price / slippage;

  // Calculate cost and fees
  const grossCost = request.quantity * fillPrice;
  const fees = calculateFee(request.venue, fillPrice, request.quantity);
  const totalCost = request.action === 'BUY' ? grossCost + fees : -grossCost + fees;

  // Check if agent has enough cash for buy
  if (request.action === 'BUY' && totalCost > agentCash) {
    const order: Order = {
      id: generateId('order'),
      agentId,
      venue: request.venue,
      marketId: request.marketId,
      marketTitle,
      side: request.side,
      action: request.action,
      quantity: request.quantity,
      orderType: request.orderType,
      limitPrice: request.limitPrice,
      status: 'REJECTED' as OrderStatus,
      filledQty: 0,
      avgPrice: 0,
      fees: 0,
      createdAt: new Date(),
    };
    orders.set(order.id, order);

    return {
      orderId: order.id,
      status: 'REJECTED',
      filledQty: 0,
      avgPrice: 0,
      fees: 0,
      timestamp: order.createdAt,
    };
  }

  // Simulate partial fill (10% chance)
  const isPartialFill = Math.random() < 0.1;
  const filledQty = isPartialFill
    ? Math.floor(request.quantity * (0.5 + Math.random() * 0.4))
    : request.quantity;

  const actualCost = filledQty * fillPrice;
  const actualFees = calculateFee(request.venue, fillPrice, filledQty);

  // Create order
  const order: Order = {
    id: generateId('order'),
    agentId,
    venue: request.venue,
    marketId: request.marketId,
    marketTitle,
    side: request.side,
    action: request.action,
    quantity: request.quantity,
    orderType: request.orderType,
    limitPrice: request.limitPrice,
    status: filledQty === request.quantity ? 'FILLED' : 'PARTIAL',
    filledQty,
    avgPrice: fillPrice,
    fees: actualFees,
    createdAt: new Date(),
    filledAt: new Date(),
  };
  orders.set(order.id, order);

  // Create trade record
  const trade: Trade = {
    id: generateId('trade'),
    agentId,
    orderId: order.id,
    venue: request.venue,
    marketId: request.marketId,
    marketTitle,
    side: request.side,
    action: request.action,
    quantity: filledQty,
    price: fillPrice,
    fees: actualFees,
    total: request.action === 'BUY' ? actualCost + actualFees : actualCost - actualFees,
    timestamp: new Date(),
  };
  trades.set(trade.id, trade);

  // Update cash
  if (request.action === 'BUY') {
    cash.set(agentId, agentCash - actualCost - actualFees);
  } else {
    cash.set(agentId, agentCash + actualCost - actualFees);
  }

  // Update positions
  updatePosition(
    agentId,
    request.venue,
    request.marketId,
    request.side,
    request.action,
    filledQty,
    fillPrice,
    marketTitle
  );

  return {
    orderId: order.id,
    status: order.status,
    filledQty,
    avgPrice: fillPrice,
    fees: actualFees,
    timestamp: order.createdAt,
  };
}

// =============================================================================
// Position Management
// =============================================================================

function getPositionKey(agentId: string, venue: Venue, marketId: string, side: Side): string {
  return `${agentId}:${venue}:${marketId}:${side}`;
}

function updatePosition(
  agentId: string,
  venue: Venue,
  marketId: string,
  side: Side,
  action: Action,
  quantity: number,
  price: number,
  marketTitle?: string
): void {
  const key = getPositionKey(agentId, venue, marketId, side);
  const existing = positions.get(key);

  if (action === 'BUY') {
    if (existing) {
      // Add to existing position (average in)
      const totalQty = existing.quantity + quantity;
      const totalCost = existing.avgEntryPrice * existing.quantity + price * quantity;
      existing.quantity = totalQty;
      existing.avgEntryPrice = totalCost / totalQty;
      existing.currentPrice = price;
      existing.marketValue = totalQty * price;
      existing.unrealizedPnL = (price - existing.avgEntryPrice) * totalQty;
      existing.unrealizedPnLPct = ((price - existing.avgEntryPrice) / existing.avgEntryPrice) * 100;
    } else {
      // Create new position
      const position: Position = {
        id: generateId('pos'),
        agentId,
        venue,
        marketId,
        marketTitle,
        side,
        quantity,
        avgEntryPrice: price,
        currentPrice: price,
        marketValue: quantity * price,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
        openedAt: new Date(),
      };
      positions.set(key, position);
    }
  } else {
    // SELL - reduce or close position
    if (existing) {
      const pnl = (price - existing.avgEntryPrice) * quantity;
      const currentRealized = realizedPnL.get(agentId) ?? 0;
      realizedPnL.set(agentId, currentRealized + pnl);

      if (quantity >= existing.quantity) {
        // Close position
        positions.delete(key);
      } else {
        // Reduce position
        existing.quantity -= quantity;
        existing.currentPrice = price;
        existing.marketValue = existing.quantity * price;
        existing.unrealizedPnL = (price - existing.avgEntryPrice) * existing.quantity;
        existing.unrealizedPnLPct =
          ((price - existing.avgEntryPrice) / existing.avgEntryPrice) * 100;
      }
    }
  }
}

export function getPositions(agentId: string): Position[] {
  const result: Position[] = [];
  for (const position of positions.values()) {
    if (position.agentId === agentId) {
      // Update current price
      const prices = getPrice(position.venue, position.marketId);
      position.currentPrice = position.side === 'YES' ? prices.yesPrice : prices.noPrice;
      position.marketValue = position.quantity * position.currentPrice;
      position.unrealizedPnL = (position.currentPrice - position.avgEntryPrice) * position.quantity;
      position.unrealizedPnLPct =
        ((position.currentPrice - position.avgEntryPrice) / position.avgEntryPrice) * 100;
      result.push(position);
    }
  }
  return result;
}

// =============================================================================
// Portfolio
// =============================================================================

export function getPortfolio(agentId: string): Portfolio {
  const agent = agents.get(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const agentCash = cash.get(agentId) ?? 0;
  const agentPositions = getPositions(agentId);
  const positionsValue = agentPositions.reduce((sum, p) => sum + p.marketValue, 0);
  const unrealizedPnL = agentPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const agentRealizedPnL = realizedPnL.get(agentId) ?? 0;
  const totalValue = agentCash + positionsValue;
  const totalPnL = unrealizedPnL + agentRealizedPnL;

  return {
    agentId,
    cash: agentCash,
    positionsValue,
    totalValue,
    unrealizedPnL,
    realizedPnL: agentRealizedPnL,
    totalPnL,
    returnPct: (totalPnL / agent.startingCapital) * 100,
  };
}

// =============================================================================
// Trade History
// =============================================================================

export function getTrades(agentId: string, limit: number = 100): Trade[] {
  const result: Trade[] = [];
  for (const trade of trades.values()) {
    if (trade.agentId === agentId) {
      result.push(trade);
    }
  }
  return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
}

export function getAllTrades(limit: number = 100): Trade[] {
  return Array.from(trades.values())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

// =============================================================================
// Leaderboard
// =============================================================================

export function getLeaderboard(): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const agent of agents.values()) {
    const portfolio = getPortfolio(agent.id);
    const agentTrades = getTrades(agent.id, 1000);

    // Calculate win rate
    let wins = 0;
    for (const trade of agentTrades) {
      if (trade.action === 'SELL') {
        // Check if this was a profitable trade
        const position = Array.from(positions.values()).find(
          p => p.agentId === agent.id && p.venue === trade.venue && p.marketId === trade.marketId
        );
        if (position && trade.price > position.avgEntryPrice) {
          wins++;
        }
      }
    }
    const winRate = agentTrades.length > 0 ? (wins / agentTrades.length) * 100 : 0;

    entries.push({
      agentId: agent.id,
      name: agent.name,
      totalPnL: portfolio.totalPnL,
      returnPct: portfolio.returnPct,
      trades: agentTrades.length,
      winRate,
      rank: 0,
    });
  }

  // Sort by total P&L and assign ranks
  entries.sort((a, b) => b.totalPnL - a.totalPnL);
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return entries;
}

// =============================================================================
// Initialization
// =============================================================================

export function seedDemoData(): void {
  // No demo data - prices come from Replay Lab
  // No demo agents - only real agents will appear
}
