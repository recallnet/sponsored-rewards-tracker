const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function normalizePath(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function withBasePath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = normalizePath(path);
  if (!BASE_PATH) return normalized;
  if (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`)) return normalized;

  return `${BASE_PATH}${normalized}`;
}

export function apiPath(path: string): string {
  return withBasePath(path);
}
