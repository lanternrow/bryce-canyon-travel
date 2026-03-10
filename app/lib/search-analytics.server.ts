// Google Search Console — Search Analytics API
// Fetches query performance data: clicks, impressions, CTR, position

import { getGoogleAccessToken } from "./google-auth.server";

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";

// ============================================
// TYPES
// ============================================

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResult {
  success: boolean;
  rows?: SearchAnalyticsRow[];
  totals?: SearchAnalyticsTotals;
  error?: string;
  cachedAt?: number;
}

// ============================================
// CACHE (in-memory, 1-hour TTL)
// ============================================

const analyticsCache = new Map<
  string,
  { data: SearchAnalyticsResult; expiresAt: number }
>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function clearSearchAnalyticsCache(): void {
  analyticsCache.clear();
}

// ============================================
// SEARCH ANALYTICS QUERY
// ============================================

/**
 * Query Google Search Console search analytics data.
 * Dimensions: "date" for time-series, "query" for top searches, "page" for top pages.
 */
export async function getSearchAnalytics(
  siteUrl: string,
  options: {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    dimensions: ("query" | "page" | "date")[];
    rowLimit?: number; // default 25
    startRow?: number; // pagination offset
  },
  forceRefresh = false
): Promise<SearchAnalyticsResult> {
  const cacheKey = `${options.dimensions.join(",")}_${options.startDate}_${options.endDate}_${options.rowLimit || 25}_${options.startRow || 0}`;

  if (!forceRefresh) {
    const cached = analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const token = await getGoogleAccessToken(WEBMASTERS_SCOPE);
  if (!token) {
    return { success: false, error: "No Google credentials configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);

  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: options.startDate,
          endDate: options.endDate,
          dimensions: options.dimensions,
          rowLimit: options.rowLimit || 25,
          startRow: options.startRow || 0,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      const stale = analyticsCache.get(cacheKey);
      if (stale) return stale.data;
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    const data = await response.json();
    const rows: SearchAnalyticsRow[] = (data.rows || []).map((r: any) => ({
      keys: r.keys,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    // Compute weighted totals
    let totalClicks = 0;
    let totalImpressions = 0;
    let weightedPosition = 0;

    for (const r of rows) {
      totalClicks += r.clicks;
      totalImpressions += r.impressions;
      weightedPosition += r.position * r.impressions;
    }

    const totals: SearchAnalyticsTotals = {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      position: totalImpressions > 0 ? weightedPosition / totalImpressions : 0,
    };

    const result: SearchAnalyticsResult = {
      success: true,
      rows,
      totals,
      cachedAt: Date.now(),
    };

    analyticsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL,
    });
    return result;
  } catch (error) {
    const stale = analyticsCache.get(cacheKey);
    if (stale) return stale.data;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
