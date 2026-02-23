# Prediction Market Rewards Tracker

Live dashboard and MCP server for tracking rewards across **Polymarket**, **Limitless**, and **Kalshi** prediction markets.

**Live:** [sponsored-rewards-tracker.vercel.app](https://sponsored-rewards-tracker.vercel.app/opportunities)

## What it tracks

| Platform | Reward Types | Source |
|----------|-------------|--------|
| **Polymarket** | Sponsored rewards, LP rewards, Maker rebates | On-chain (Polygon) |
| **Limitless** | LP rewards (USDC), Points (seasons) | REST API (Base L2) |
| **Kalshi** | Volume incentives, Liquidity incentives, APY | REST API |

## REST API

All endpoints return JSON. Append `?force=1` to bypass cache.

| Endpoint | Description |
|----------|-------------|
| `GET /api/sponsored` | Polymarket sponsored rewards (events, markets, sponsors) |
| `GET /api/lp-rewards` | Polymarket LP reward distributions |
| `GET /api/maker-rebates` | Polymarket maker rebate distributions |
| `GET /api/limitless/lp-rewards` | Limitless LP rewards per market |
| `GET /api/limitless/points` | Limitless points by season |
| `GET /api/kalshi/incentives` | Kalshi volume + liquidity incentive programs |

## MCP Server

The `mcp-server/` package exposes all reward data as MCP tools that AI agents can call.

### Setup

```bash
cd mcp-server
npm install
npm run build
```

### Add to Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "rewards-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

### Available tools

| Tool | Description |
|------|-------------|
| `rewards_summary` | Cross-platform overview (start here) |
| `polymarket_sponsored_rewards` | Sponsored events, amounts, top sponsors |
| `polymarket_lp_rewards` | LP distributions, top receivers |
| `polymarket_maker_rebates` | Maker rebate distributions |
| `limitless_lp_rewards` | LP reward budgets per market |
| `limitless_points` | Points by season, top earners |
| `kalshi_incentives` | Volume + liquidity incentive programs |

### Custom deployment

Point to your own Vercel deployment:

```json
{
  "mcpServers": {
    "rewards-tracker": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "REWARDS_TRACKER_URL": "https://your-deployment.vercel.app"
      }
    }
  }
}
```

## Cursor Skill

The `skill/SKILL.md` file teaches AI agents how to use the reward data. Install it by copying to your Cursor skills directory:

```bash
cp -r skill/ ~/.cursor/skills/prediction-market-rewards/
```

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
vercel --prod
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection (for Polymarket scan state) |
| `CRON_SECRET` | No | Auth secret for cron endpoint |
