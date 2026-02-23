'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const platforms = [
  { label: 'Polymarket', href: '/opportunities' },
  { label: 'Limitless', href: '/limitless' },
  { label: 'Kalshi', href: '/kalshi' },
] as const;

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1">
      {platforms.map(p => {
        const active = pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`text-xs px-4 py-1.5 transition-colors ${
              active
                ? 'text-white bg-[#1a1a1a] border border-[#444]'
                : 'text-[#555] hover:text-[#999] border border-transparent'
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
