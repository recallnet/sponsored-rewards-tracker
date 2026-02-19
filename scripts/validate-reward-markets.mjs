#!/usr/bin/env node

const baseUrl = (process.env.OPPORTUNITIES_BASE_URL ?? 'https://cheff-phi.vercel.app').replace(
  /\/$/,
  ''
);
const endpoint = `${baseUrl}/api/opportunities?force=1&rewardOnly=1`;

function isRewardMarket(item) {
  const dailyRewardUsd = Number(item?.dailyRewardUsd ?? 0);
  const rewardPoolUsd = Number(item?.rewardPoolUsd ?? 0);
  const rewardsMinSize = Number(item?.rewardsMinSize ?? 0);
  const rewardsMaxSpread = Number(item?.rewardsMaxSpread ?? 0);
  const hasRewardProgram = Boolean(item?.hasRewardProgram);
  return (
    hasRewardProgram ||
    dailyRewardUsd > 0 ||
    rewardPoolUsd > 0 ||
    rewardsMinSize > 0 ||
    rewardsMaxSpread > 0
  );
}

async function main() {
  const res = await fetch(endpoint, {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const payload = await res.json();
  const markets = Array.isArray(payload?.opportunities) ? payload.opportunities : [];
  const rewardMarkets = markets.filter(isRewardMarket);
  const withDailyReward = markets.filter(item => Number(item?.dailyRewardUsd ?? 0) > 0);

  if (rewardMarkets.length === 0) {
    throw new Error(
      `No reward markets found at ${endpoint}. Source=${payload?.source ?? 'unknown'}, scannedCount=${payload?.scannedCount ?? 'unknown'}`
    );
  }
  if (withDailyReward.length === 0) {
    throw new Error(
      `No markets with dailyRewardUsd found at ${endpoint}. Source=${payload?.source ?? 'unknown'}, scannedCount=${payload?.scannedCount ?? 'unknown'}`
    );
  }

  const sample = rewardMarkets.slice(0, 5).map(m => ({
    question: String(m?.question ?? '').slice(0, 90),
    dailyRewardUsd: m?.dailyRewardUsd ?? null,
    rewardPoolUsd: m?.rewardPoolUsd ?? null,
    rewardsMinSize: m?.rewardsMinSize ?? null,
    rewardsMaxSpread: m?.rewardsMaxSpread ?? null,
    hasRewardProgram: Boolean(m?.hasRewardProgram),
  }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        endpoint,
        source: payload?.source ?? 'unknown',
        scannedCount: payload?.scannedCount ?? null,
        opportunitiesReturned: markets.length,
        rewardMarketsReturned: rewardMarkets.length,
        dailyRewardMarketsReturned: withDailyReward.length,
        sample,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(`[test:rewards] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
