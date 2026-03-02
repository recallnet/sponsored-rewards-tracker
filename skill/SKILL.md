---
name: prediction-market-rewards
description: Query live reward data from Polymarket, Limitless, and Kalshi prediction markets. Covers sponsored rewards, LP rewards, maker rebates, points systems, and incentive programs. Use when building reward-tracking bots, analyzing prediction market incentives, comparing platforms, or when the user asks about market maker earnings, LP yields, or reward distributions.
---

# Prediction Market Rewards Tracker

## When to use this skill

Use when the user asks about:
- Polymarket rewards (sponsored, LP, maker rebates)
- Limitless Exchange rewards (LP rewards, points)
- Kalshi incentive programs (volume, liquidity)
- Comparing rewards across prediction market platforms
- Building bots that track or act on reward data
- Analyzing which markets pay the most LP rewards

## Available MCP Tools

If the `rewards-tracker` MCP server is configured, call these tools directly:

| Tool | Returns |
|------|---------|
| `rewards_summary` | Cross-platform overview in one call (start here) |
| `polymarket_sponsored_rewards` | Sponsored events, amounts, active markets, top sponsors |
| `polymarket_lp_rewards` | Daily USDC distributions, top receivers, 1d/7d/all totals |
| `polymarket_maker_rebates` | Daily rebate distributions, top receivers, averages |
| `limitless_lp_rewards` | Daily USDC budget per market, category breakdown |
| `limitless_points` | Season totals, weekly/daily distribution, top earners |
| `kalshi_incentives` | Volume + liquidity programs, totals, top markets with links |

All tools accept an optional `force: true` parameter to bypass cache.

## REST API (no MCP required)

Base URL: `https://sponsored-rewards-tracker.vercel.app`

| Endpoint | Method | Data |
|----------|--------|------|
| `/api/sponsored` | GET | Polymarket sponsored rewards |
| `/api/lp-rewards` | GET | Polymarket LP rewards |
| `/api/maker-rebates` | GET | Polymarket maker rebates |
| `/api/limitless/lp-rewards` | GET | Limitless LP rewards |
| `/api/limitless/points` | GET | Limitless points |
| `/api/kalshi/incentives` | GET | Kalshi incentive programs |

Append `?force=1` to bypass cache. Responses are JSON with `Cache-Control: s-maxage=60, stale-while-revalidate=300`.

## Data Shapes

### Polymarket Sponsored Rewards
```typescript
{
  events: [{
    marketId, sponsor, amountUsdc, startTime, endTime,
    ratePerDayUsdc, marketQuestion, eventSlug, withdrawn, consumedUsdc
  }],
  overall: {
    totalEvents, uniqueSponsors, uniqueMarkets,
    totalAmountUsdc, netAmountUsdc, totalReturnedUsdc, totalConsumedUsdc
  }
}
```

### Polymarket LP Rewards / Maker Rebates
```typescript
{
  dailyTotals: [{ date, totalUsdc, transfers, receivers }],
  topReceivers: [{ address, amount1d, amount7d, amountAll, pct1d }],
  overall: { total1d, total7d, totalAll, totalReceivers, avgDaily }
}
```

### Limitless LP Rewards
```typescript
{
  totalDailyBudget, rewardableMarkets, totalClobMarkets,
  categories: [{ category, marketCount, dailyReward }],
  topMarkets: [{ title, slug, dailyReward, maxSpread, minSize, category, volume }],
  nextPayoutUtc
}
```

### Limitless Points
```typescript
{
  allTimeTotal, thisWeekTotal, dailyAverage,
  seasons: [{ name, totalPoints, periods: [{ start, end, points }], status }],
  currentSeason,
  topEarners: [{ rank, address, displayName, weeklyPoints, totalPoints, rankName }],
  nextDistribution  // ISO date string
}
```

### Kalshi Incentives
```typescript
{
  grandTotalUsd,
  active: { totalPrograms, totalRewardUsd, volumePrograms, volumeRewardUsd, liquidityPrograms, liquidityRewardUsd },
  paidOut: { totalPrograms, totalRewardUsd, volumePrograms, volumeRewardUsd, liquidityPrograms, liquidityRewardUsd },
  closed: { totalPrograms, totalRewardUsd, volumePrograms, volumeRewardUsd, liquidityPrograms, liquidityRewardUsd },
  activeMarkets: [{ marketTicker, title, eventTicker, type, rewardUsd, startDate, endDate, targetSize, discountBps }],
  topPaidOutMarkets: [{ marketTicker, title, eventTicker, type, rewardUsd, startDate, endDate }],
  recentPayouts: [{ marketTicker, title, type, rewardUsd, startDate, endDate }]
}
```

## Platform Overview

| Platform | Chain | Reward Types | Update Frequency |
|----------|-------|-------------|-----------------|
| **Polymarket** | Polygon | Sponsored rewards, LP rewards, Maker rebates | On-chain events, daily payouts |
| **Limitless** | Base | LP rewards (USDC), Points (seasons) | Daily at 12:00 UTC |
| **Kalshi** | N/A (centralized) | Volume incentives, Liquidity incentives, 3.75% APY | Per-program periods |

## Example: Quick Comparison

```bash
curl -s https://sponsored-rewards-tracker.vercel.app/api/lp-rewards | jq '.overall'
curl -s https://sponsored-rewards-tracker.vercel.app/api/kalshi/incentives | jq '{grand: .grandTotalUsd, active: .active.totalRewardUsd}'
```

## Key Numbers to Know

- **Polymarket sponsored rewards**: ~$489K deposited by 10K+ sponsors across 2K+ markets
- **Polymarket LP rewards**: ~$21K/day USDC to ~5,700 LPs
- **Polymarket maker rebates**: ~$150K/day USDC to ~6,500 makers
- **Limitless LP rewards**: ~$4-6K/day across ~197 markets, paid at 12:00 UTC
- **Limitless points**: ~335K/day, 102M all-time, Season 3 active
- **Kalshi**: $1.43M total paid out, 297 active programs ($47K in pools)
- **Kalshi volume incentives**: $0.005/contract cap, pools $300–$10K per market
- **Kalshi liquidity incentives**: $10–$1,000 daily pools, scored second-by-second

## MCP Server Setup

Add to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "rewards-tracker": {
      "command": "node",
      "args": ["/path/to/rewards-tracker-mcp/dist/index.js"]
    }
  }
}
```

Or with a custom API URL:

```json
{
  "mcpServers": {
    "rewards-tracker": {
      "command": "node",
      "args": ["/path/to/rewards-tracker-mcp/dist/index.js"],
      "env": {
        "REWARDS_TRACKER_URL": "https://your-deployment.vercel.app"
      }
    }
  }
}
```
