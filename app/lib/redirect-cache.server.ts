// ============================================
// Redirect Cache — In-memory cache with 60s TTL
// ============================================
// Avoids hitting the database on every single request.
// The full redirect map is loaded once and reused
// until the TTL expires or the cache is explicitly cleared.

import { getAllRedirectsMap, incrementRedirectHitCount } from "./queries.server";

type RedirectEntry = { id: string; to: string; code: number };

let cache: Map<string, RedirectEntry> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function ensureCache(): Promise<Map<string, RedirectEntry>> {
  const now = Date.now();
  if (cache && now - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  try {
    cache = await getAllRedirectsMap();
    cacheTimestamp = now;
  } catch (err) {
    console.error("Failed to load redirects cache:", err);
    if (!cache) cache = new Map();
  }
  return cache;
}

/**
 * Look up a redirect for the given pathname.
 * Returns null if no redirect is configured.
 */
export async function lookupRedirect(
  pathname: string,
): Promise<RedirectEntry | null> {
  const map = await ensureCache();
  return map.get(pathname) || null;
}

/**
 * Fire-and-forget: increment the hit counter for a redirect.
 */
export function handleRedirectHit(id: string): void {
  incrementRedirectHitCount(id).catch(() => {});
}

/**
 * Clear the in-memory cache (e.g. after CRUD operations).
 */
export function clearRedirectCache(): void {
  cache = null;
  cacheTimestamp = 0;
}
