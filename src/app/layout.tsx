import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sponsored Rewards Tracker',
  description: 'On-chain Polymarket sponsored rewards tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-[#333] sticky top-0 z-50 bg-black">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
            <div />
            <a
              href="https://github.com/sanketagarwal/polymarket-rewards-mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs border border-[#333] px-4 py-1.5 hover:text-white hover:border-white transition-colors text-[#999]"
            >
              Snipe Rewards
            </a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
