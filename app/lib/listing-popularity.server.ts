import { hasGoogleCredentials } from "./google-auth.server";
import { runGA4Report } from "./ga4-analytics.server";
import {
  getPublishedListingsForPopularity,
  getSettings,
  updateListingPopularityMetrics,
} from "./queries.server";

const DEFAULT_POPULAR_PERCENT = 10;
const DEFAULT_MIN_VIEWS_30D = 1;
const LISTING_PATH_PREFIX = "/listing/";

function normalizePagePath(path: string): string {
  const withoutQuery = path.split("?")[0] || "";
  if (withoutQuery.length <= 1) return withoutQuery || "/";
  return withoutQuery.replace(/\/+$/, "");
}

function toListingKey(type: string, slug: string): string {
  return `${type.toLowerCase()}/${slug.toLowerCase()}`;
}

function extractListingKey(path: string): string | null {
  const normalized = normalizePagePath(path).toLowerCase();
  const match = normalized.match(/^\/listing\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  try {
    const type = decodeURIComponent(match[1]);
    const slug = decodeURIComponent(match[2]);
    return toListingKey(type, slug);
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

export interface PopularityRefreshResult {
  success: boolean;
  error?: string;
  totalListings?: number;
  popularCount?: number;
  topBucketSize?: number;
  minViewsRequired?: number;
  thresholdViews?: number;
  gaRows?: number;
  gaListingPaths?: number;
  refreshedAt?: string;
}

export async function refreshListingPopularityFromGA4(): Promise<PopularityRefreshResult> {
  const settings = await getSettings();
  const ga4PropertyId = settings.ga4_property_id;

  if (!ga4PropertyId) {
    return { success: false, error: "GA4 property ID is not configured." };
  }
  if (!hasGoogleCredentials()) {
    return { success: false, error: "Google service account credentials are not configured." };
  }

  const listings = await getPublishedListingsForPopularity();
  if (listings.length === 0) {
    await updateListingPopularityMetrics([]);
    return {
      success: true,
      totalListings: 0,
      popularCount: 0,
      topBucketSize: 0,
      minViewsRequired: parseMinViews(settings.popular_badge_min_views_30d),
      thresholdViews: 0,
      gaRows: 0,
      gaListingPaths: 0,
      refreshedAt: new Date().toISOString(),
    };
  }

  const popularPercent = parsePopularPercent(settings.popular_badge_percent);
  const minViewsRequired = parseMinViews(settings.popular_badge_min_views_30d);

  const report = await runGA4Report(ga4PropertyId, {
    startDate: "30daysAgo",
    endDate: "today",
    dimensions: ["pagePath"],
    metrics: ["screenPageViews"],
    orderBy: { metric: "screenPageViews", desc: true },
    limit: 5000,
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: {
          matchType: "BEGINS_WITH",
          value: LISTING_PATH_PREFIX,
        },
      },
    },
  });

  if (!report.success) {
    return { success: false, error: report.error || "Failed to fetch GA4 listing views." };
  }

  const viewsByKey: Record<string, number> = {};
  for (const row of report.rows || []) {
    const path = row.dimensionValues[0] || "";
    const listingKey = extractListingKey(path);
    if (!listingKey) continue;
    viewsByKey[listingKey] = (viewsByKey[listingKey] || 0) + (row.metricValues[0] || 0);
  }

  const scored = listings.map((listing) => {
    const key = toListingKey(listing.type, listing.slug);
    return {
      id: listing.id,
      views30d: Math.round(viewsByKey[key] || 0),
    };
  });

  scored.sort((a, b) => b.views30d - a.views30d || a.id.localeCompare(b.id));

  const topBucketSize = Math.max(1, Math.ceil(scored.length * (popularPercent / 100)));
  const topBucket = scored.slice(0, topBucketSize);
  const popularIds = new Set(
    topBucket.filter((entry) => entry.views30d >= minViewsRequired).map((entry) => entry.id)
  );
  const thresholdViews = topBucket.length > 0 ? topBucket[topBucket.length - 1].views30d : 0;

  await updateListingPopularityMetrics(
    scored.map((entry) => ({
      id: entry.id,
      views30d: entry.views30d,
      isPopular: popularIds.has(entry.id),
    }))
  );

  return {
    success: true,
    totalListings: scored.length,
    popularCount: popularIds.size,
    topBucketSize,
    minViewsRequired,
    thresholdViews,
    gaRows: (report.rows || []).length,
    gaListingPaths: Object.keys(viewsByKey).length,
    refreshedAt: new Date().toISOString(),
  };
}
