'use client';

import { Stat } from '../OpportunitiesTable';

export default function KalshiApyTab() {
  return (
    <>
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">
          Portfolio Interest Rate
        </p>
        <p className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
          3.75%
          <span className="text-2xl md:text-3xl text-[#555] font-normal"> APY</span>
        </p>
        <p className="text-sm text-[#555] mt-4 font-mono">
          Variable rate&ensp;·&ensp;applies to cash + open positions&ensp;·&ensp;paid monthly
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-[#333] mb-14">
        <Stat label="Current Rate" value="3.75% APY" />
        <Stat label="Min Balance" value="$250" border />
        <Stat label="Accrual" value="Daily" border />
        <Stat label="Payout" value="Monthly" border />
      </div>

      <div className="border border-[#333] mb-14 p-5">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-2">How It Works</p>
        <div className="text-sm text-[#888] space-y-3">
          <p>
            Kalshi pays <span className="text-white">3.75% variable APY</span> on both deposited cash and
            the collateral backing your open positions. Interest is calculated daily based on your net
            portfolio value at end of each trading day (using last-traded prices).
          </p>
          <p>
            You need at least <span className="text-white font-mono">$250</span> in your account to qualify.
            If your balance dips below, interest pauses until you're back above the threshold.
          </p>
          <p>
            Interest accrues daily and is paid out monthly (typically early in the month, up to 10 business days).
            The rate is variable and tracks Federal Reserve rates — Kalshi earns this through their banking
            partners and passes it along.
          </p>
        </div>
      </div>

      <div className="border border-[#333] p-5">
        <p className="text-[11px] tracking-[0.3em] uppercase text-[#555] mb-3">Earnings Calculator</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[1000, 5000, 10000, 50000].map(amount => {
            const annual = amount * 0.0375;
            const monthly = annual / 12;
            const daily = annual / 365;
            return (
              <div key={amount} className="border border-[#222] p-3">
                <p className="text-[#555] text-xs mb-2">${amount.toLocaleString()} portfolio</p>
                <p className="font-mono text-white">${monthly.toFixed(2)}/mo</p>
                <p className="font-mono text-[#888] text-xs mt-1">${daily.toFixed(2)}/day · ${annual.toFixed(0)}/yr</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[#444] font-mono">
        Rate as of Feb 2026&ensp;·&ensp;Variable, subject to change&ensp;·&ensp;
        Source: Kalshi Help Center
      </p>
    </>
  );
}
