// Google Search Console API — Sitemap submission + URL Inspection + Indexing stats

import { getGoogleAccessToken } from "./google-auth.server";

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";

// ============================================
// TYPES
// ============================================

interface SitemapContentEntry {
  type: string;
  submitted: number;
  indexed: number;
}

export interface SitemapInfo {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending: boolean;
  contents: SitemapContentEntry[];
}

export interface SitemapsResult {
  success: boolean;
  sitemaps?: SitemapInfo[];
  error?: string;
  cachedAt?: number;
}

// ============================================
// SITEMAPS CACHE (in-memory, 1-hour TTL)
// ============================================

let sitemapsCache: { data: SitemapsResult; expiresAt: number } | null = null;
const SITEMAPS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function clearSitemapsCache(): void {
  sitemapsCache = null;
}

/**
 * Submit (or resubmit) a single sitemap to Google Search Console.
 */
export async function submitSitemap(
  siteUrl: string,
  sitemapUrl: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getGoogleAccessToken(WEBMASTERS_SCOPE);
  if (!token) {
    return { success: false, error: "No Google credentials configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const encodedSitemapUrl = encodeURIComponent(sitemapUrl);

  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps/${encodedSitemapUrl}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Submit all sitemaps (index + sub-sitemaps) to Google Search Console.
 */
export async function submitAllSitemaps(
  siteUrl: string
): Promise<{ results: Array<{ url: string; success: boolean; error?: string }> }> {
  // siteUrl may be "sc-domain:brycecanyon.travel" (domain property) — derive
  // actual HTTPS URLs for the sitemap paths while keeping sc-domain: for the API
  const httpBase = siteUrl.startsWith("sc-domain:")
    ? `https://${siteUrl.replace("sc-domain:", "")}`
    : siteUrl.replace(/\/$/, "");
  const sitemaps = [
    `${httpBase}/sitemap.xml`,
    `${httpBase}/sitemap-pages.xml`,
    `${httpBase}/sitemap-listings.xml`,
    `${httpBase}/sitemap-posts.xml`,
  ];

  const results: Array<{ url: string; success: boolean; error?: string }> = [];

  for (const url of sitemaps) {
    const result = await submitSitemap(siteUrl, url);
    results.push({ url, ...result });
    // Small delay between API calls to be respectful
    await new Promise((r) => setTimeout(r, 200));
  }

  return { results };
}

/**
 * Inspect a URL's indexing status via the URL Inspection API.
 */
export async function inspectUrl(
  siteUrl: string,
  inspectionUrl: string
): Promise<{
  success: boolean;
  verdict?: string;
  coverageState?: string;
  lastCrawlTime?: string;
  indexingState?: string;
  error?: string;
}> {
  const token = await getGoogleAccessToken(WEBMASTERS_SCOPE);
  if (!token) {
    return { success: false, error: "No Google credentials configured" };
  }

  try {
    const response = await fetch(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionUrl,
          siteUrl,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    const data = await response.json();
    const result = data.inspectionResult?.indexStatusResult;

    return {
      success: true,
      verdict: result?.verdict,
      coverageState: result?.coverageState,
      lastCrawlTime: result?.lastCrawlTime,
      indexingState: result?.indexingState,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List all sitemaps registered in Google Search Console with their
 * submitted/indexed counts. Results are cached in-memory for 1 hour.
 */
export async function listSitemaps(
  siteUrl: string,
  forceRefresh = false
): Promise<SitemapsResult> {
  // Return cached data if valid and not forced
  if (!forceRefresh && sitemapsCache && sitemapsCache.expiresAt > Date.now()) {
    return sitemapsCache.data;
  }

  const token = await getGoogleAccessToken(WEBMASTERS_SCOPE);
  if (!token) {
    return { success: false, error: "No Google credentials configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);

  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      // On failure, preserve stale cache if available
      if (sitemapsCache) {
        return sitemapsCache.data;
      }
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    const data = await response.json();
    const sitemaps: SitemapInfo[] = (data.sitemap || []).map((s: any) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      lastDownloaded: s.lastDownloaded,
      isPending: s.isPending || false,
      contents: (s.contents || []).map((c: any) => ({
        type: c.type,
        submitted: parseInt(c.submitted, 10) || 0,
        indexed: parseInt(c.indexed, 10) || 0,
      })),
    }));

    const result: SitemapsResult = {
      success: true,
      sitemaps,
      cachedAt: Date.now(),
    };

    sitemapsCache = { data: result, expiresAt: Date.now() + SITEMAPS_CACHE_TTL };
    return result;
  } catch (error) {
    // On failure, preserve stale cache if available
    if (sitemapsCache) {
      return sitemapsCache.data;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
