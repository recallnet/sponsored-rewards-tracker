import { formatCurrency } from "@/lib/utils";
import { withBasePath } from "@/lib/base-path";

export const PAGE_SIZE = 50;

export const SWR_CONFIG = {
  refreshInterval: 60_000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 15_000,
  keepPreviousData: true,
} as const;

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(withBasePath(url));
  if (!res.ok) throw new Error(await res.text().catch(() => `${res.status}`));
  return res.json() as Promise<T>;
};

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function formatTimeLeft(iso?: string): string {
  if (!iso) return "--";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.ceil(ms / 60_000);
  return `${mins}m`;
}

export function addr(a: string): string {
  return a.length <= 12 ? a : `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function polymarketUrl(eventSlug?: string): string | null {
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return null;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n);
}
