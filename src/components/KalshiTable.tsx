'use client';

import { useState, lazy, Suspense } from 'react';
import { Skeleton } from './OpportunitiesTable';

type Tab = 'volume' | 'liquidity' | 'apy';

const KalshiVolumeTab = lazy(() => import('./tabs/KalshiVolumeTab'));
const KalshiLiquidityTab = lazy(() => import('./tabs/KalshiLiquidityTab'));
const KalshiApyTab = lazy(() => import('./tabs/KalshiApyTab'));

export function KalshiTable() {
  const [activeTab, setActiveTab] = useState<Tab>('volume');

  return (
    <div>
      <div className="flex gap-0 border-b border-[#333] mb-10">
        <TabButton active={activeTab === 'volume'} onClick={() => setActiveTab('volume')}>
          Volume Incentives
        </TabButton>
        <TabButton active={activeTab === 'liquidity'} onClick={() => setActiveTab('liquidity')}>
          Liquidity Incentives
        </TabButton>
        <TabButton active={activeTab === 'apy'} onClick={() => setActiveTab('apy')}>
          APY
        </TabButton>
      </div>

      <Suspense fallback={<Skeleton />}>
        {activeTab === 'volume' && <KalshiVolumeTab />}
        {activeTab === 'liquidity' && <KalshiLiquidityTab />}
        {activeTab === 'apy' && <KalshiApyTab />}
      </Suspense>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 text-sm tracking-wide transition-colors border-b-2 -mb-[1px] ${
        active
          ? 'border-white text-white'
          : 'border-transparent text-[#555] hover:text-[#999]'
      }`}
    >
      {children}
    </button>
  );
}
