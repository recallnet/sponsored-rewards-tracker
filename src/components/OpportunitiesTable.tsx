'use client';

import { useState, lazy, Suspense, useEffect } from 'react';
import { preload } from 'swr';
import { fetcher } from './tabs/shared';

type Tab = 'sponsored' | 'lp' | 'maker';

const SponsoredTab = lazy(() => import('./tabs/SponsoredTab'));
const LpTab = lazy(() => import('./tabs/LpTab'));
const MakerTab = lazy(() => import('./tabs/MakerTab'));

const POLYMARKET_APIS = ['/api/sponsored', '/api/lp-rewards', '/api/maker-rebates'] as const;

export function OpportunitiesTable() {
  const [activeTab, setActiveTab] = useState<Tab>('sponsored');

  useEffect(() => {
    POLYMARKET_APIS.forEach(url => preload(url, fetcher));
  }, []);

  return (
    <div>
      <div className="flex gap-0 border-b border-[#333] mb-10">
        <TabButton active={activeTab === 'sponsored'} onClick={() => setActiveTab('sponsored')}>
          Sponsored Rewards
        </TabButton>
        <TabButton active={activeTab === 'lp'} onClick={() => setActiveTab('lp')}>
          LP Rewards
        </TabButton>
        <TabButton active={activeTab === 'maker'} onClick={() => setActiveTab('maker')}>
          Maker Rebates
        </TabButton>
      </div>

      <Suspense fallback={<Skeleton />}>
        {activeTab === 'sponsored' && <SponsoredTab />}
        {activeTab === 'lp' && <LpTab />}
        {activeTab === 'maker' && <MakerTab />}
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

export function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-16 bg-[#111]" />
      <div className="h-10 bg-[#111] w-2/3" />
      <div className="space-y-2 mt-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 bg-[#111]" />
        ))}
      </div>
    </div>
  );
}

export function ErrorBlock({ message, label }: { message?: string; label: string }) {
  return (
    <div className="border border-[#333] p-6">
      <p className="text-sm">Failed to load {label}.</p>
      <p className="text-xs text-[#555] mt-1">{message ?? 'Unknown error'}</p>
    </div>
  );
}

export function Stat({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={`px-5 py-4 ${border ? 'border-l border-[#333]' : ''}`}>
      <p className="text-[11px] text-[#555] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-mono font-bold">{value}</p>
    </div>
  );
}
