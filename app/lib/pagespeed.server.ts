// Google PageSpeed Insights API
// Fetches performance scores and Core Web Vitals (LCP, CLS, INP)

import { getSettings } from "./queries.server";

// ============================================
// TYPES
// ============================================

export interface CoreWebVitals {
  lcp: number; // Largest Contentful Paint (seconds)
  cls: number; // Cumulative Layout Shift (unitless)
  inp: number; // Interaction to Next Paint (milliseconds)
}

export interface PageSpeedResult {
  success: boolean;
  strategy: "mobile" | "desktop";
  performanceScore?: number; // 0-100
  webVitals?: CoreWebVitals;
  error?: string;
  cachedAt?: number;
}

// ============================================
// CACHE (in-memory, 6-hour TTL)
// ============================================

const speedCache = new Map<
  string,
  { data: PageSpeedResult; expiresAt: number }
>();
const SPEED_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export function clearPageSpeedCache(): void {
  speedCache.clear();
}

// ============================================
// PAGESPEED INSIGHTS
// ============================================

/**
 * Get PageSpeed Insights performance score and Core Web Vitals.
 *
 * Uses the Google PageSpeed Insights API v5 (public API).
 * Auth: Google API key (reuses `google_places_api_key` setting).
 *
 * Note: This API call takes 3-8 seconds. The 6-hour cache mitigates
 * repeated slow loads. First cold-load may be slow.
 */
export async function getPageSpeedScore(
  url: string,
  strategy: "mobile" | "desktop",
  forceRefresh = false
): Promise<PageSpeedResult> {
  const cacheKey = `${url}_${strategy}`;

  if (!forceRefresh) {
    const cached = speedCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const settings = await getSettings();
  const apiKey = settings.google_places_api_key;
  if (!apiKey) {
    return {
      success: false,
      strategy,
      error: "No Google API key configured (Settings > Tracking > Google Places API Key)",
    };
  }

  try {
    const params = new URLSearchParams({
      url,
      category: "performance",
      strategy,
      key: apiKey,
    });

    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { signal: AbortSignal.timeout(15000) } // 15s timeout
    );

    if (!response.ok) {
      const body = await response.text();
      const stale = speedCache.get(cacheKey);
      if (stale) return stale.data;
      return {
        success: false,
        strategy,
        error: `HTTP ${response.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = await response.json();
    const lighthouse = data.lighthouseResult;
    const performanceScore = Math.round(
      (lighthouse?.categories?.performance?.score || 0) * 100
    );

    const audits = lighthouse?.audits || {};

    const webVitals: CoreWebVitals = {
      lcp: (audits["largest-contentful-paint"]?.numericValue || 0) / 1000, // ms → s
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      inp: audits["interaction-to-next-paint"]?.numericValue || 0, // already ms
    };

    const result: PageSpeedResult = {
      success: true,
      strategy,
      performanceScore,
      webVitals,
      cachedAt: Date.now(),
    };

    speedCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + SPEED_CACHE_TTL,
    });
    return result;
  } catch (error) {
    const stale = speedCache.get(cacheKey);
    if (stale) return stale.data;
    return {
      success: false,
      strategy,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// CORE WEB VITALS THRESHOLDS
// ============================================

export type VitalRating = "good" | "needs-improvement" | "poor";

export function rateLCP(seconds: number): VitalRating {
  if (seconds < 2.5) return "good";
  if (seconds < 4.0) return "needs-improvement";
  return "poor";
}

export function rateCLS(score: number): VitalRating {
  if (score < 0.1) return "good";
  if (score < 0.25) return "needs-improvement";
  return "poor";
}

export function rateINP(ms: number): VitalRating {
  if (ms < 200) return "good";
  if (ms < 500) return "needs-improvement";
  return "poor";
}
