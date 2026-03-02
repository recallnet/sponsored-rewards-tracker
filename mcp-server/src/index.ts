#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE = "https://sponsored-rewards-tracker.vercel.app";

const BASE_URL = process.env.REWARDS_TRACKER_URL ?? DEFAULT_BASE;

async function fetchApi<T>(path: string, force = false): Promise<T> {
  const url = `${BASE_URL}${path}${force ? "?force=1" : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function summarizeJson(data: unknown, maxDepth = 2): string {
  return JSON.stringify(data, null, 2).slice(0, 8000);
}

const server = new McpServer({
  name: "rewards-tracker",
  version: "1.0.0",
});

// ── Polymarket tools ──

server.tool(
  "polymarket_sponsored_rewards",
  "Get Polymarket sponsored rewards: total deposited, net amount, active markets, top sponsors, individual sponsorship events with market names and amounts",
  { force: z.boolean().optional().describe("Force refresh from chain (slower)") },
  async ({ force }) => {
    const data = await fetchApi("/api/sponsored", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

server.tool(
  "polymarket_lp_rewards",
  "Get Polymarket LP rewards: daily USDC distributions, top receivers by amount, 1d/7d/all-time totals, average daily payout",
  { force: z.boolean().optional().describe("Force refresh from chain (slower)") },
  async ({ force }) => {
    const data = await fetchApi("/api/lp-rewards", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

server.tool(
  "polymarket_maker_rebates",
  "Get Polymarket maker rebates: daily USDC rebate distributions, top receivers, 1d/7d/all-time totals, average daily rebate amount",
  { force: z.boolean().optional().describe("Force refresh from chain (slower)") },
  async ({ force }) => {
    const data = await fetchApi("/api/maker-rebates", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

// ── Limitless tools ──

server.tool(
  "limitless_lp_rewards",
  "Get Limitless Exchange LP rewards: total daily USDC budget, active market count, category breakdown, top markets by reward size",
  { force: z.boolean().optional().describe("Force refresh") },
  async ({ force }) => {
    const data = await fetchApi("/api/limitless/lp-rewards", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

server.tool(
  "limitless_points",
  "Get Limitless Exchange points: all-time total, weekly distribution, daily average, season breakdown, top earners this week",
  { force: z.boolean().optional().describe("Force refresh") },
  async ({ force }) => {
    const data = await fetchApi("/api/limitless/points", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

// ── Kalshi tools ──

server.tool(
  "kalshi_incentives",
  "Get Kalshi incentive programs: volume incentives, liquidity incentives, total distributed, active/paid-out program counts, top markets by pool size with titles and links",
  { force: z.boolean().optional().describe("Force refresh") },
  async ({ force }) => {
    const data = await fetchApi("/api/kalshi/incentives", force);
    return { content: [{ type: "text" as const, text: summarizeJson(data) }] };
  },
);

// ── Cross-platform summary ──

server.tool(
  "rewards_summary",
  "Get a high-level summary of rewards across all platforms (Polymarket, Limitless, Kalshi) in a single call. Good starting point for analysis.",
  {},
  async () => {
    const [sponsored, lp, maker, limitlessLp, limitlessPoints, kalshi] =
      await Promise.allSettled([
        fetchApi<any>("/api/sponsored"),
        fetchApi<any>("/api/lp-rewards"),
        fetchApi<any>("/api/maker-rebates"),
        fetchApi<any>("/api/limitless/lp-rewards"),
        fetchApi<any>("/api/limitless/points"),
        fetchApi<any>("/api/kalshi/incentives"),
      ]);

    const get = (r: PromiseSettledResult<any>) =>
      r.status === "fulfilled" ? r.value : { error: (r as PromiseRejectedResult).reason?.message };

    const summary = {
      polymarket: {
        sponsored_rewards: (() => {
          const d = get(sponsored);
          return d.error ? d : {
            totalDeposited: d.overall?.totalAmountUsdc,
            netAmount: d.overall?.netAmountUsdc,
            consumed: d.overall?.totalConsumedUsdc,
            uniqueMarkets: d.overall?.uniqueMarkets,
            uniqueSponsors: d.overall?.uniqueSponsors,
          };
        })(),
        lp_rewards: (() => {
          const d = get(lp);
          return d.error ? d : {
            today: d.overall?.total1d,
            sevenDay: d.overall?.total7d,
            allTime: d.overall?.totalAll,
            avgDaily: d.overall?.avgDaily,
            receivers: d.overall?.totalReceivers,
          };
        })(),
        maker_rebates: (() => {
          const d = get(maker);
          return d.error ? d : {
            today: d.overall?.total1d,
            sevenDay: d.overall?.total7d,
            allTime: d.overall?.totalAll,
            avgDaily: d.overall?.avgDaily,
            receivers: d.overall?.totalReceivers,
          };
        })(),
      },
      limitless: {
        lp_rewards: (() => {
          const d = get(limitlessLp);
          return d.error ? d : {
            dailyBudget: d.totalDailyBudget,
            activeMarkets: d.rewardableMarkets,
          };
        })(),
        points: (() => {
          const d = get(limitlessPoints);
          return d.error ? d : {
            allTimeTotal: d.allTimeTotal,
            thisWeekTotal: d.thisWeekTotal,
            dailyAverage: d.dailyAverage,
            currentSeason: d.currentSeason,
          };
        })(),
      },
      kalshi: (() => {
        const d = get(kalshi);
        return d.error ? d : {
          grandTotalDistributed: d.grandTotalUsd,
          volume: { totalPaidOut: d.paidOut?.volumeRewardUsd, activeNow: d.active?.volumeRewardUsd },
          liquidity: { totalPaidOut: d.paidOut?.liquidityRewardUsd, activeNow: d.active?.liquidityRewardUsd },
        };
      })(),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
