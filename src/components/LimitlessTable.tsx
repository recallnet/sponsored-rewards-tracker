'use client';

import { useState, lazy, Suspense } from 'react';
import { Skeleton } from './OpportunitiesTable';

type Tab = 'lp' | 'points';

const LimitlessLpTab = lazy(() => import('./tabs/LimitlessLpTab'));
const LimitlessPointsTab = lazy(() => import('./tabs/LimitlessPointsTab'));

export function LimitlessTable() {
  const [activeTab, setActiveTab] = useState<Tab>('lp');

  return (
    <div>
      <div className="flex gap-0 border-b border-[#333] mb-10">
        <TabButton active={activeTab === 'lp'} onClick={() => setActiveTab('lp')}>
          LP Rewards
        </TabButton>
        <TabButton active={activeTab === 'points'} onClick={() => setActiveTab('points')}>
          Points
        </TabButton>
      </div>

      <Suspense fallback={<Skeleton />}>
        {activeTab === 'lp' && <LimitlessLpTab />}
        {activeTab === 'points' && <LimitlessPointsTab />}
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
