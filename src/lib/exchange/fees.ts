/**
 * Fee Calculations
 *
 * Accurate fee structures for prediction market venues.
 */

import type { Venue } from './types';

/**
 * Calculate Kalshi fee for a trade.
 * Formula: 0.07 * price * (1 - price) * contracts
 * Peaks at ~1.75% at 50/50 odds
 */
export function calculateKalshiFee(price: number, contracts: number): number {
  return 0.07 * price * (1 - price) * contracts;
}

/**
 * Calculate Polymarket fee for a trade.
 * Global: 0% on most markets
 * US: 0.1% taker fee
 */
export function calculatePolymarketFee(
  price: number,
  contracts: number,
  isUS: boolean = false
): number {
  if (!isUS) {
    return 0;
  }
  return contracts * price * 0.001;
}

/**
 * Calculate fee for any venue.
 */
export function calculateFee(
  venue: Venue,
  price: number,
  contracts: number,
  isUS: boolean = false
): number {
  if (venue === 'KALSHI') {
    return calculateKalshiFee(price, contracts);
  }
  return calculatePolymarketFee(price, contracts, isUS);
}

/**
 * Format fee as currency string.
 */
export function formatFee(fee: number): string {
  return `$${fee.toFixed(4)}`;
}
