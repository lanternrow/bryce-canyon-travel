// Bing Webmaster Tools API — Feed management, crawl stats, URL submission
// Auth: simple API key as query parameter (no OAuth/JWT needed)

import { getSettings } from "./queries.server";

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/**
 * Parse a short, human-readable error from Bing API error responses.
 * Bing returns verbose XML/JSON blobs — we extract just the message.
 */
function parseBingError(status: number, body: string): string {
  // Try to extract <Message>...</Message> from XML responses
  const xmlMsg = body.match(/<Message>(.*?)<\/Message>/i);
  if (xmlMsg) return `HTTP ${status}: ${xmlMsg[1]}`;

  // Try JSON { "Message": "..." }
  try {
    const json = JSON.parse(body);
    if (json.Message) return `HTTP ${status}: ${json.Message}`;
    if (json.ErrorCode) return `HTTP ${status}: ${json.ErrorCode}`;
  } catch {
    // not JSON
  }

  // Fallback: truncate raw body to something safe for URLs
  const short = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `HTTP ${status}: ${short.slice(0, 120)}`;
}

// ============================================
// TYPES
// ============================================

export interface BingFeedInfo {
  url: string;
  lastCrawled?: string;
  lastSubmitted?: string;
}

export interface BingFeedsResult {
  success: boolean;
  feeds?: BingFeedInfo[];
  error?: string;
  cachedAt?: number;
}

export interface BingCrawlStatsEntry {
  date: string;
  crawledPages: number;
  crawlErrors: number;
  inIndex: number;
  inLinks: number;
}

export interface BingCrawlStatsResult {
  success: boolean;
  stats?: BingCrawlStatsEntry[];
  error?: string;
  cachedAt?: number;
}

// ============================================
// FEEDS CACHE (in-memory, 1-hour TTL)
// ============================================

let feedsCache: { data: BingFeedsResult; expiresAt: number } | null = null;
const FEEDS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ============================================
// CRAWL STATS CACHE (in-memory, 1-hour TTL)
// ============================================

let crawlStatsCache: {
  data: BingCrawlStatsResult;
  expiresAt: number;
} | null = null;
const CRAWL_STATS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Clear both caches (called by dashboard refresh action).
 */
export function clearBingCache(): void {
  feedsCache = null;
  crawlStatsCache = null;
}

/**
 * Check if the Bing API key is configured in settings.
 */
export async function hasBingCredentials(): Promise<boolean> {
  const settings = await getSettings();
  return !!settings.bing_api_key;
}

/**
 * Helper: get the Bing API key from settings.
 * Returns null if not configured.
 */
async function getBingApiKey(): Promise<string | null> {
  const settings = await getSettings();
  return settings.bing_api_key || null;
}

// ============================================
// FEEDS (Sitemaps)
// ============================================

/**
 * List all sitemaps (feeds) registered in Bing Webmaster Tools.
 * Results are cached in-memory for 1 hour.
 */
export async function listBingFeeds(
  siteUrl: string,
  forceRefresh = false
): Promise<BingFeedsResult> {
  // Return cached data if valid and not forced
  if (!forceRefresh && feedsCache && feedsCache.expiresAt > Date.now()) {
    return feedsCache.data;
  }

  const apiKey = await getBingApiKey();
  if (!apiKey) {
    return { success: false, error: "No Bing API key configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);

  try {
    const response = await fetch(
      `${BING_API_BASE}/GetFeeds?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const body = await response.text();
      // On failure, preserve stale cache if available
      if (feedsCache) {
        return feedsCache.data;
      }
      return { success: false, error: parseBingError(response.status, body) };
    }

    const data = await response.json();

    // Bing returns { d: [...] } wrapper
    const rawFeeds: any[] = data.d || data || [];
    const feeds: BingFeedInfo[] = (
      Array.isArray(rawFeeds) ? rawFeeds : []
    ).map((f: any) => ({
      url: f.Url || f.url || "",
      lastCrawled: f.LastCrawlDate || f.lastCrawled || undefined,
      lastSubmitted: f.LastSubmitDate || f.lastSubmitted || undefined,
    }));

    const result: BingFeedsResult = {
      success: true,
      feeds,
      cachedAt: Date.now(),
    };

    feedsCache = { data: result, expiresAt: Date.now() + FEEDS_CACHE_TTL };
    return result;
  } catch (error) {
    // On failure, preserve stale cache if available
    if (feedsCache) {
      return feedsCache.data;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// CRAWL STATS
// ============================================

/**
 * Get crawl statistics from Bing Webmaster Tools.
 * Results are cached in-memory for 1 hour.
 */
export async function getBingCrawlStats(
  siteUrl: string,
  forceRefresh = false
): Promise<BingCrawlStatsResult> {
  // Return cached data if valid and not forced
  if (
    !forceRefresh &&
    crawlStatsCache &&
    crawlStatsCache.expiresAt > Date.now()
  ) {
    return crawlStatsCache.data;
  }

  const apiKey = await getBingApiKey();
  if (!apiKey) {
    return { success: false, error: "No Bing API key configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);

  try {
    const response = await fetch(
      `${BING_API_BASE}/GetCrawlStats?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const body = await response.text();
      if (crawlStatsCache) {
        return crawlStatsCache.data;
      }
      return { success: false, error: parseBingError(response.status, body) };
    }

    const data = await response.json();

    // Bing returns { d: [...] } wrapper
    const rawStats: any[] = data.d || data || [];
    const stats: BingCrawlStatsEntry[] = (
      Array.isArray(rawStats) ? rawStats : []
    ).map((s: any) => ({
      date: s.Date || s.date || "",
      crawledPages: s.CrawledPages ?? s.crawledPages ?? 0,
      crawlErrors: s.CrawlErrors ?? s.crawlErrors ?? 0,
      inIndex: s.InIndex ?? s.inIndex ?? 0,
      inLinks: s.InLinks ?? s.inLinks ?? 0,
    }));

    const result: BingCrawlStatsResult = {
      success: true,
      stats,
      cachedAt: Date.now(),
    };

    crawlStatsCache = {
      data: result,
      expiresAt: Date.now() + CRAWL_STATS_CACHE_TTL,
    };
    return result;
  } catch (error) {
    if (crawlStatsCache) {
      return crawlStatsCache.data;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// SUBMIT FEEDS (Sitemaps)
// ============================================

/**
 * Submit a single sitemap (feed) to Bing Webmaster Tools.
 */
export async function submitBingFeed(
  siteUrl: string,
  feedUrl: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = await getBingApiKey();
  if (!apiKey) {
    return { success: false, error: "No Bing API key configured" };
  }

  try {
    const response = await fetch(
      `${BING_API_BASE}/SubmitFeed?apikey=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ siteUrl, feedUrl }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: parseBingError(response.status, body) };
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
 * Submit all sitemaps to Bing Webmaster Tools.
 */
export async function submitAllBingFeeds(
  siteUrl: string
): Promise<{
  results: Array<{ url: string; success: boolean; error?: string }>;
}> {
  const baseUrl = siteUrl.replace(/\/$/, "");
  const sitemaps = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap-pages.xml`,
    `${baseUrl}/sitemap-listings.xml`,
    `${baseUrl}/sitemap-posts.xml`,
  ];

  const results: Array<{ url: string; success: boolean; error?: string }> = [];

  for (const url of sitemaps) {
    const result = await submitBingFeed(siteUrl, url);
    results.push({ url, ...result });
    // Small delay between API calls to be respectful
    await new Promise((r) => setTimeout(r, 200));
  }

  return { results };
}

// ============================================
// URL BATCH SUBMISSION
// ============================================

/**
 * Submit a batch of URLs directly to Bing for crawling.
 * Complements IndexNow as a belt-and-suspenders approach.
 */
export async function submitBingUrlBatch(
  siteUrl: string,
  urls: string[]
): Promise<{ success: boolean; error?: string }> {
  if (urls.length === 0) {
    return { success: true };
  }

  const apiKey = await getBingApiKey();
  if (!apiKey) {
    return { success: false, error: "No Bing API key configured" };
  }

  try {
    const response = await fetch(
      `${BING_API_BASE}/SubmitUrlBatch?apikey=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          siteUrl,
          urlList: urls,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: parseBingError(response.status, body) };
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
 * Get URL info (index status) for a single URL from Bing.
 */
export async function getBingUrlInfo(
  siteUrl: string,
  pageUrl: string
): Promise<{
  success: boolean;
  httpCode?: number;
  lastCrawled?: string;
  error?: string;
}> {
  const apiKey = await getBingApiKey();
  if (!apiKey) {
    return { success: false, error: "No Bing API key configured" };
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const encodedPageUrl = encodeURIComponent(pageUrl);

  try {
    const response = await fetch(
      `${BING_API_BASE}/GetUrlInfo?siteUrl=${encodedSiteUrl}&url=${encodedPageUrl}&apikey=${apiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: parseBingError(response.status, body) };
    }

    const data = await response.json();
    const info = data.d || data;

    return {
      success: true,
      httpCode: info?.HttpCode ?? info?.httpCode,
      lastCrawled: info?.LastCrawledDate ?? info?.lastCrawled,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
