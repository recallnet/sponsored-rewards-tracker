/**
 * Paper Exchange Types
 */

export type Venue = 'POLYMARKET' | 'KALSHI';
export type Side = 'YES' | 'NO';
export type Action = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'IOC' | 'FOK';
export type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'REJECTED';

export interface Agent {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  createdAt: Date;
  startingCapital: number;
}

export interface Order {
  id: string;
  agentId: string;
  venue: Venue;
  marketId: string;
  marketTitle?: string;
  side: Side;
  action: Action;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  status: OrderStatus;
  filledQty: number;
  avgPrice: number;
  fees: number;
  createdAt: Date;
  filledAt?: Date;
}

export interface Position {
  id: string;
  agentId: string;
  venue: Venue;
  marketId: string;
  marketTitle?: string;
  side: Side;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  openedAt: Date;
}

export interface Trade {
  id: string;
  agentId: string;
  orderId: string;
  venue: Venue;
  marketId: string;
  marketTitle?: string;
  side: Side;
  action: Action;
  quantity: number;
  price: number;
  fees: number;
  total: number;
  timestamp: Date;
}

export interface Portfolio {
  agentId: string;
  cash: number;
  positionsValue: number;
  totalValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  returnPct: number;
}

export interface LeaderboardEntry {
  agentId: string;
  name: string;
  totalPnL: number;
  returnPct: number;
  trades: number;
  winRate: number;
  rank: number;
}

export interface MarketData {
  id: string;
  venue: Venue;
  title: string;
  yesPrice: number;
  noPrice: number;
  spread: number;
  volume24h?: number;
  liquidity?: number;
  closeTime?: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: Date;
}

export interface SubmitOrderRequest {
  venue: Venue;
  marketId: string;
  side: Side;
  action: Action;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
}

export interface SubmitOrderResponse {
  orderId: string;
  status: OrderStatus;
  filledQty: number;
  avgPrice: number;
  fees: number;
  timestamp: Date;
}
