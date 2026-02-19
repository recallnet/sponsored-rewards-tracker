# Sponsored Rewards Tracker

On-chain Polymarket sponsored rewards dashboard. Indexes `Sponsored` and `Withdrawn` events from the Polymarket rewards sponsorship contract on Polygon, enriches with market metadata from the Gamma API, and displays active reward opportunities.

**Live:** [cheff-phi.vercel.app/opportunities](https://cheff-phi.vercel.app/opportunities)

## Run locally

```bash
npm install
npm run dev
```

## API

```
GET /api/sponsored         # returns all indexed events + overall stats
GET /api/sponsored?force=1 # bypass 5-min cache, fetch fresh on-chain data
```

## Deploy

Deployed on Vercel. Push to main triggers a new build.

```bash
vercel --prod
```

## MCP Skill

See [polymarket-rewards-mcp](https://github.com/sanketagarwal/polymarket-rewards-mcp) for a Cursor agent skill that queries this API.
