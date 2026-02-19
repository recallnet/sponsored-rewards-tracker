/**
 * Replay Lab API Client
 *
 * Fetches real market prices from Polymarket and Kalshi via Replay Lab.
 */

const REPLAY_LAB_BASE_URL = process.env.REPLAY_LAB_URL ?? 'https://api.replay.markets';

export type Venue = 'POLYMARKET' | 'KALSHI';

export interface MarketPrice {
  yesPrice: number;
  noPrice: number;
  timestamp: Date;
}

export interface Market {
  id: string;
  venue: Venue;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume24h?: number;
  closeTime?: string;
}

/**
 * Get current price for a market from Replay Lab
 */
export async function getMarketPrice(venue: Venue, marketId: string): Promise<MarketPrice | null> {
  try {
    const endpoint =
      venue === 'POLYMARKET'
        ? `/api/polymarket/clob/price?token_id=${marketId}`
        : `/api/kalshi/markets/${marketId}`;

    const response = await fetch(`${REPLAY_LAB_BASE_URL}${endpoint}`);

    if (!response.ok) {
      console.error(`Replay Lab API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (venue === 'POLYMARKET') {
      // Polymarket returns { price: number } for YES token
      const yesPrice = data.price ?? 0.5;
      return {
        yesPrice,
        noPrice: 1 - yesPrice,
        timestamp: new Date(),
      };
    } else {
      // Kalshi returns market object with yes_price, no_price
      return {
        yesPrice: data.yes_price ?? data.last_price ?? 0.5,
        noPrice: data.no_price ?? 1 - (data.last_price ?? 0.5),
        timestamp: new Date(),
      };
    }
  } catch (error) {
    console.error(`Failed to fetch price from Replay Lab:`, error);
    return null;
  }
}

/**
 * Get orderbook for a market
 */
export async function getOrderbook(
  venue: Venue,
  marketId: string
): Promise<{
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
} | null> {
  try {
    const endpoint =
      venue === 'POLYMARKET'
        ? `/api/polymarket/clob/book?token_id=${marketId}`
        : `/api/kalshi/markets/${marketId}/orderbook`;

    const response = await fetch(`${REPLAY_LAB_BASE_URL}${endpoint}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (venue === 'POLYMARKET') {
      return {
        bids: (data.bids ?? []).map((b: { price: string; size: string }) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        })),
        asks: (data.asks ?? []).map((a: { price: string; size: string }) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        })),
      };
    } else {
      // Kalshi format: { yes: [[price, size], ...], no: [[price, size], ...] }
      return {
        bids: (data.yes ?? []).map((level: [number, number]) => ({
          price: level[0] / 100, // Kalshi uses cents
          size: level[1],
        })),
        asks: (data.no ?? []).map((level: [number, number]) => ({
          price: level[0] / 100,
          size: level[1],
        })),
      };
    }
  } catch (error) {
    console.error(`Failed to fetch orderbook from Replay Lab:`, error);
    return null;
  }
}

/**
 * Search for similar markets across venues
 */
export async function searchMarkets(query: string): Promise<Market[]> {
  try {
    const response = await fetch(
      `${REPLAY_LAB_BASE_URL}/api/markets/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.markets ?? [];
  } catch (error) {
    console.error(`Failed to search markets:`, error);
    return [];
  }
}

/**
 * Get arb calculation from Replay Lab
 */
export async function calculateArb(
  marketA: { venue: Venue; marketId: string; side: 'YES' | 'NO' },
  marketB: { venue: Venue; marketId: string; side: 'YES' | 'NO' }
): Promise<{
  priceA: number;
  priceB: number;
  spread: number;
  spreadPct: number;
  isArb: boolean;
} | null> {
  try {
    const response = await fetch(`${REPLAY_LAB_BASE_URL}/api/arb/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legA: {
          venue: marketA.venue.toLowerCase(),
          marketId: marketA.marketId,
          side: marketA.side,
        },
        legB: {
          venue: marketB.venue.toLowerCase(),
          marketId: marketB.marketId,
          side: marketB.side,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to calculate arb:`, error);
    return null;
  }
}
