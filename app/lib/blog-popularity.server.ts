import { hasGoogleCredentials } from "./google-auth.server";
import { runGA4Report } from "./ga4-analytics.server";
import {
  getPublishedBlogPostsForPopularity,
  getSettings,
  updateBlogPostPopularityMetrics,
} from "./queries.server";

const DEFAULT_POPULAR_PERCENT = 10;
const DEFAULT_MIN_VIEWS_30D = 1;

function normalizePagePath(path: string): string {
  const withoutQuery = path.split("?")[0] || "";
  if (withoutQuery.length <= 1) return withoutQuery || "/";
  return withoutQuery.replace(/\/+$/, "");
}

const LEGACY_ROOT_PATH_EXCLUSIONS = new Set([
  "admin",
  "api",
  "category",
  "contact",
  "dining",
  "experiences",
  "golf",
  "hiking",
  "listings",
  "llms.txt",
  "lodging",
  "news",
  "parks",
  "robots.txt",
  "sitemap-listings.xml",
  "sitemap-pages.xml",
  "sitemap-posts.xml",
  "sitemap.xml",
  "transportation",
]);

function extractBlogSlug(path: string): string | null {
  const normalized = normalizePagePath(path).toLowerCase();

  // Canonical /news/{slug}
  const newsMatch = normalized.match(/^\/news\/([^/]+)$/);
  if (newsMatch) {
    try {
      return decodeURIComponent(newsMatch[1]).trim().toLowerCase() || null;
    } catch {
      return null;
    }
  }

  // Legacy root-level /{slug}
  const legacyMatch = normalized.match(/^\/([^/]+)$/);
  if (!legacyMatch) return null;
  if (LEGACY_ROOT_PATH_EXCLUSIONS.has(legacyMatch[1])) return null;
  try {
    return decodeURIComponent(legacyMatch[1]).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function parsePopularPercent(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POPULAR_PERCENT;
  return Math.min(Math.max(Math.round(parsed), 1), 50);
}

function parseMinViews(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MIN_VIEWS_30D;
  // Never mark content as "popular" when it has zero views.
  return Math.max(Math.round(parsed), DEFAULT_MIN_VIEWS_30D);
}

export interface BlogPopularityRefreshResult {
  success: boolean;
  error?: string;
  totalPosts?: number;
  popularCount?: number;
  topBucketSize?: number;
  minViewsRequired?: number;
  thresholdViews?: number;
  gaRows?: number;
  gaMatchedPostPaths?: number;
  refreshedAt?: string;
}

export async function refreshBlogPopularityFromGA4(): Promise<BlogPopularityRefreshResult> {
  const settings = await getSettings();
  const ga4PropertyId = settings.ga4_property_id;

  if (!ga4PropertyId) {
    return { success: false, error: "GA4 property ID is not configured." };
  }
  if (!hasGoogleCredentials()) {
    return { success: false, error: "Google service account credentials are not configured." };
  }

  const posts = await getPublishedBlogPostsForPopularity();
  if (posts.length === 0) {
    await updateBlogPostPopularityMetrics([]);
    return {
      success: true,
      totalPosts: 0,
      popularCount: 0,
      topBucketSize: 0,
      minViewsRequired: parseMinViews(
        settings.popular_badge_min_views_30d_posts || settings.popular_badge_min_views_30d
      ),
      thresholdViews: 0,
      gaRows: 0,
      gaMatchedPostPaths: 0,
      refreshedAt: new Date().toISOString(),
    };
  }

  const popularPercent = parsePopularPercent(
    settings.popular_badge_percent_posts || settings.popular_badge_percent
  );
  const minViewsRequired = parseMinViews(
    settings.popular_badge_min_views_30d_posts || settings.popular_badge_min_views_30d
  );

  const report = await runGA4Report(ga4PropertyId, {
    startDate: "30daysAgo",
    endDate: "today",
    dimensions: ["pagePath"],
    metrics: ["screenPageViews"],
    orderBy: { metric: "screenPageViews", desc: true },
    limit: 5000,
  });

  if (!report.success) {
    return { success: false, error: report.error || "Failed to fetch GA4 news article views." };
  }

  const viewsBySlug: Record<string, number> = {};
  const validSlugs = new Set(posts.map((post) => String(post.slug || "").toLowerCase()));
  for (const row of report.rows || []) {
    const path = row.dimensionValues[0] || "";
    const slug = extractBlogSlug(path);
    if (!slug || !validSlugs.has(slug)) continue;
    viewsBySlug[slug] = (viewsBySlug[slug] || 0) + (row.metricValues[0] || 0);
  }

  const scored = posts.map((post) => {
    const slug = String(post.slug || "").toLowerCase();
    return {
      id: post.id,
      views30d: Math.round(viewsBySlug[slug] || 0),
    };
  });

  scored.sort((a, b) => b.views30d - a.views30d || a.id.localeCompare(b.id));

  const topBucketSize = Math.max(1, Math.ceil(scored.length * (popularPercent / 100)));
  const topBucket = scored.slice(0, topBucketSize);
  const popularIds = new Set(
    topBucket.filter((entry) => entry.views30d >= minViewsRequired).map((entry) => entry.id)
  );
  const thresholdViews = topBucket.length > 0 ? topBucket[topBucket.length - 1].views30d : 0;

  await updateBlogPostPopularityMetrics(
    scored.map((entry) => ({
      id: entry.id,
      views30d: entry.views30d,
      isPopular: popularIds.has(entry.id),
    }))
  );

  return {
    success: true,
    totalPosts: scored.length,
    popularCount: popularIds.size,
    topBucketSize,
    minViewsRequired,
    thresholdViews,
    gaRows: (report.rows || []).length,
    gaMatchedPostPaths: Object.keys(viewsBySlug).length,
    refreshedAt: new Date().toISOString(),
  };
}
