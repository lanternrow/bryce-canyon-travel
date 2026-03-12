import { useState } from "react";
import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/admin-dashboard";
import { requireAuth } from "../lib/auth.server";
import {
  getAdminStats,
  getRecentListings,
  getRecentBlogPosts,
  getRecentReviews,
  getSettings,
  detectOrphanedContent,
} from "../lib/queries.server";
import { formatShortDate } from "../lib/format";
import { hasGoogleCredentials } from "../lib/google-auth.server";
import {
  listSitemaps,
  clearSitemapsCache,
  type SitemapsResult,
} from "../lib/search-console.server";
import {
  hasBingCredentials,
  listBingFeeds,
  getBingCrawlStats,
  clearBingCache,
  type BingFeedsResult,
  type BingCrawlStatsResult,
} from "../lib/bing-webmaster.server";
import { getSearchAnalytics } from "../lib/search-analytics.server";
import { runGA4Report } from "../lib/ga4-analytics.server";
import { getPageSpeedScore } from "../lib/pagespeed.server";
import { siteConfig } from "../lib/site-config";

export function meta({}: Route.MetaArgs) {
  return [{ title: `Dashboard | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [stats, recentListings, recentPosts, recentReviews, settings, orphanedContent] =
    await Promise.all([
      getAdminStats(),
      getRecentListings(5),
      getRecentBlogPosts(3),
      getRecentReviews(3),
      getSettings(),
      detectOrphanedContent(),
    ]);

  // Pre-compute timeAgo strings on the server to avoid hydration mismatch
  const now = Date.now();
  const listingsWithTimeAgo = (recentListings as any[]).map((l: any) => ({
    ...l,
    timeAgoText: computeTimeAgo(l.updated_at, now),
  }));

  // Indexing data from Google Search Console
  const gscConfigured = hasGoogleCredentials();
  let indexingData: SitemapsResult | null = null;

  if (gscConfigured) {
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    indexingData = await listSitemaps(siteUrl);
  }

  // Bing Webmaster data
  const bingConfigured = await hasBingCredentials();
  let bingFeedsData: BingFeedsResult | null = null;
  let bingCrawlData: BingCrawlStatsResult | null = null;

  if (bingConfigured) {
    const gscUrl = settings.gsc_site_url || siteConfig.siteUrl;
    const bingSiteUrl = gscUrl.startsWith("sc-domain:")
      ? `https://${gscUrl.replace("sc-domain:", "")}`
      : gscUrl;
    [bingFeedsData, bingCrawlData] = await Promise.all([
      listBingFeeds(bingSiteUrl),
      getBingCrawlStats(bingSiteUrl),
    ]);
  }

  // Quick-view monitoring data (non-blocking — failures won't break dashboard)
  let searchTotals: { clicks: number; impressions: number; ctr: number; position: number } | null = null;
  let ga4Sessions: number | null = null;
  let speedMobile: any = null;

  try {
    const rawMonitoringUrl = settings.gsc_site_url || "";
    const monitoringSiteUrl = rawMonitoringUrl.startsWith("sc-domain:")
      ? `https://${rawMonitoringUrl.replace("sc-domain:", "")}`
      : rawMonitoringUrl || siteConfig.siteUrl;

    // Compute date range for GSC (needs YYYY-MM-DD, not relative dates)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 28);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const results = await Promise.all([
      gscConfigured
        ? getSearchAnalytics(monitoringSiteUrl, {
            startDate: startStr,
            endDate: endStr,
            dimensions: ["date"],
            rowLimit: 90,
          })
            .then((r) => (r.success && r.totals ? r.totals : null))
            .catch(() => null)
        : null,
      settings.ga4_property_id && hasGoogleCredentials()
        ? runGA4Report(settings.ga4_property_id, {
            startDate: "28daysAgo",
            endDate: "today",
            dimensions: ["date"],
            metrics: ["sessions"],
            limit: 1,
          })
            .then((r) => (r.success && r.totals && r.totals.length > 0 ? r.totals[0] : null))
            .catch(() => null)
        : null,
      // PageSpeed is too slow (3-15s) for the dashboard loader — use cached only
      settings.google_places_api_key
        ? getPageSpeedScore(monitoringSiteUrl, "mobile")
            .catch(() => null)
        : null,
    ]);

    searchTotals = results[0] as typeof searchTotals;
    ga4Sessions = results[1] as typeof ga4Sessions;
    speedMobile = results[2];
  } catch {
    // Monitoring data is optional — dashboard still works without it
  }

  return {
    stats,
    recentListings: listingsWithTimeAgo,
    recentPosts,
    recentReviews,
    gscConfigured,
    indexingData,
    bingConfigured,
    bingFeedsData,
    bingCrawlData,
    orphanedContent,
    searchTotals,
    ga4Sessions,
    speedMobile,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "refresh-indexing") {
    clearSitemapsCache();
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    await listSitemaps(siteUrl, true);
  }

  if (intent === "refresh-bing") {
    clearBingCache();
    const settings = await getSettings();
    const gscUrl = settings.gsc_site_url || siteConfig.siteUrl;
    const bingSiteUrl = gscUrl.startsWith("sc-domain:")
      ? `https://${gscUrl.replace("sc-domain:", "")}`
      : gscUrl;
    await Promise.all([
      listBingFeeds(bingSiteUrl, true),
      getBingCrawlStats(bingSiteUrl, true),
    ]);
  }

  return { ok: true };
}

function computeTimeAgo(dateStr: string, nowMs: number): string {
  const date = new Date(dateStr);
  const diffMs = nowMs - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatShortDate(dateStr);
}

const typeColors: Record<string, string> = {
  dining: "bg-orange-100 text-orange-700",
  lodging: "bg-blue-100 text-blue-700",
  experiences: "bg-purple-100 text-purple-700",
  hiking: "bg-green-100 text-green-700",
  transportation: "bg-gray-100 text-gray-700",
  parks: "bg-emerald-100 text-emerald-700",
  golf: "bg-lime-100 text-lime-700",
};

const postCategoryPalette = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-rose-100 text-rose-700",
];

function getPostCategoryBadgeClass(category: string | null | undefined) {
  if (!category) return "bg-gray-100 text-gray-700";
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash << 5) - hash + category.charCodeAt(i);
    hash |= 0;
  }
  return postCategoryPalette[Math.abs(hash) % postCategoryPalette.length];
}

function StarRating({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`text-sm ${i < count ? "text-amber-400" : "text-gray-200"}`}
        >
          &#9733;
        </span>
      ))}
    </span>
  );
}

// ============================================
// Indexing Overview Card
// ============================================

const STATIC_PAGE_COUNT = 9; // must match base STATIC_PAGES in sitemap-pages[.]xml.ts

/** Map a sitemap path to a human-friendly label */
function sitemapLabel(path: string): string | null {
  if (path.includes("sitemap-pages")) return "Pages";
  if (path.includes("sitemap-listings")) return "Listings";
  if (path.includes("sitemap-posts")) return "News Articles";
  if (path.includes("sitemap.xml") && !path.includes("sitemap-")) return null; // skip index
  return null;
}

function coverageColor(pct: number): string {
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

function timeAgoShort(ms: number): string {
  const diffMs = Date.now() - ms;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function IndexingOverview({
  gscConfigured,
  indexingData,
  publishedListings,
  blogPosts,
}: {
  gscConfigured: boolean;
  indexingData: SitemapsResult | null;
  publishedListings: number;
  blogPosts: number;
}) {
  const fetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";

  // Not configured state
  if (!gscConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-dark mb-2">
          Indexing Overview
        </h2>
        <p className="text-sm text-gray-500">
          Google Search Console credentials are not configured.{" "}
          <Link to="/admin/monitoring/indexing" className="text-primary hover:underline">
            Go to Monitoring &rarr; Indexing
          </Link>{" "}
          to set up your service account.
        </p>
      </div>
    );
  }

  // Error / no data
  if (!indexingData || !indexingData.success || !indexingData.sitemaps) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-dark">
            Indexing Overview
          </h2>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-indexing" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Retry"}
            </button>
          </fetcher.Form>
        </div>
        <p className="text-sm text-gray-500">
          {indexingData?.error || "Unable to fetch indexing data from Google Search Console. Try refreshing."}
        </p>
      </div>
    );
  }

  // Build rows from sitemaps
  const ourCounts: Record<string, number> = {
    Pages: STATIC_PAGE_COUNT,
    Listings: publishedListings,
    "News Articles": blogPosts,
  };

  type RowData = {
    label: string;
    submitted: number;
    indexed: number;
    published: number;
  };

  const rows: RowData[] = [];

  for (const sm of indexingData.sitemaps) {
    const label = sitemapLabel(sm.path);
    if (!label) continue;

    // Sum across all content types in this sitemap
    let submitted = 0;
    let indexed = 0;
    for (const c of sm.contents) {
      submitted += c.submitted;
      indexed += c.indexed;
    }

    rows.push({
      label,
      submitted,
      indexed,
      published: ourCounts[label] ?? 0,
    });
  }

  // Totals
  const totalSubmitted = rows.reduce((s, r) => s + r.submitted, 0);
  const totalIndexed = rows.reduce((s, r) => s + r.indexed, 0);
  const totalPublished = rows.reduce((s, r) => s + r.published, 0);
  const totalCoverage = totalPublished > 0 ? Math.round((totalIndexed / totalPublished) * 100) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dark">
          Indexing Overview
        </h2>
        <div className="flex items-center gap-3">
          {indexingData.cachedAt && (
            <span className="text-xs text-gray-400">
              Checked {timeAgoShort(indexingData.cachedAt)}
            </span>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-indexing" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </fetcher.Form>
        </div>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Sitemap
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Submitted
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Indexed
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Published
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Coverage
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const coverage = row.published > 0 ? Math.round((row.indexed / row.published) * 100) : 0;
            return (
              <tr key={row.label} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">
                  {row.label}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                  {row.submitted}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                  {row.indexed}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                  {row.published}
                </td>
                <td className={`px-6 py-3 text-sm font-semibold text-right tabular-nums ${coverageColor(coverage)}`}>
                  {coverage}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td className="px-6 py-3 text-sm font-bold text-gray-900">Total</td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalSubmitted}
            </td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalIndexed}
            </td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalPublished}
            </td>
            <td className={`px-6 py-3 text-sm font-bold text-right tabular-nums ${coverageColor(totalCoverage)}`}>
              {totalCoverage}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ============================================
// Bing Webmaster Overview Card
// ============================================

function BingOverview({
  bingConfigured,
  bingFeedsData,
  bingCrawlData,
}: {
  bingConfigured: boolean;
  bingFeedsData: BingFeedsResult | null;
  bingCrawlData: BingCrawlStatsResult | null;
}) {
  const fetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";

  // Not configured
  if (!bingConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-dark mb-2">
          Bing Webmaster Overview
        </h2>
        <p className="text-sm text-gray-500">
          Bing API key is not configured.{" "}
          <Link
            to="/admin/monitoring/indexing"
            className="text-primary hover:underline"
          >
            Go to Monitoring &rarr; Indexing
          </Link>{" "}
          to add your API key.
        </p>
      </div>
    );
  }

  // Error / no data
  const hasError =
    (!bingFeedsData || !bingFeedsData.success) &&
    (!bingCrawlData || !bingCrawlData.success);

  if (hasError) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-dark">
            Bing Webmaster Overview
          </h2>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-bing" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Retry"}
            </button>
          </fetcher.Form>
        </div>
        <p className="text-sm text-gray-500">
          {bingFeedsData?.error ||
            bingCrawlData?.error ||
            "Unable to fetch data from Bing Webmaster Tools. Try refreshing."}
        </p>
      </div>
    );
  }

  // Latest crawl stats (most recent day)
  const latestStats =
    bingCrawlData?.stats && bingCrawlData.stats.length > 0
      ? bingCrawlData.stats[bingCrawlData.stats.length - 1]
      : null;

  const cachedAt = bingFeedsData?.cachedAt || bingCrawlData?.cachedAt;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-dark">
            Bing Webmaster Overview
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {cachedAt && (
            <span className="text-xs text-gray-400">
              Checked {timeAgoShort(cachedAt)}
            </span>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-bing" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
            >
              <svg
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      <div className="p-6">
        {/* Crawl Health Stats */}
        {latestStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Pages Crawled
              </p>
              <p className="text-2xl font-bold text-dark tabular-nums">
                {latestStats.crawledPages.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Crawl Errors
              </p>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  latestStats.crawlErrors > 0
                    ? "text-red-600"
                    : "text-dark"
                }`}
              >
                {latestStats.crawlErrors.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Pages in Index
              </p>
              <p className="text-2xl font-bold text-dark tabular-nums">
                {latestStats.inIndex.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Inbound Links
              </p>
              <p className="text-2xl font-bold text-dark tabular-nums">
                {latestStats.inLinks.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Registered Sitemaps */}
        {bingFeedsData?.feeds && bingFeedsData.feeds.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Registered Sitemaps
            </h3>
            <table className="w-full">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Sitemap
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Last Crawled
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bingFeedsData.feeds.map((feed) => {
                  // Extract just the path from the URL
                  let label = feed.url;
                  try {
                    label = new URL(feed.url).pathname.replace(/^\//, "");
                  } catch {
                    // Use full URL if parsing fails
                  }
                  return (
                    <tr key={feed.url} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900 font-mono text-xs">
                        {label}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right text-xs">
                        {feed.lastCrawled
                          ? timeAgoShort(new Date(feed.lastCrawled).getTime())
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No feeds registered */}
        {bingFeedsData?.feeds &&
          bingFeedsData.feeds.length === 0 &&
          !latestStats && (
            <p className="text-sm text-gray-500">
              No sitemaps registered in Bing yet. Use{" "}
              <Link
                to="/admin/monitoring/indexing"
                className="text-primary hover:underline"
              >
                Monitoring &rarr; Indexing
              </Link>{" "}
              to submit your sitemaps.
            </p>
          )}
      </div>
    </div>
  );
}

// ============================================
// Orphaned Content Card
// ============================================

function OrphanedContentCard({
  orphanedContent,
}: {
  orphanedContent: {
    orphanedListings: { id: string; name: string; type: string; slug: string }[];
    orphanedPosts: { id: string; title: string; slug: string }[];
  };
}) {
  const { orphanedListings, orphanedPosts } = orphanedContent;
  const totalOrphaned = orphanedListings.length + orphanedPosts.length;
  const [showListings, setShowListings] = useState(false);
  const [showPosts, setShowPosts] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-dark">Orphaned Content</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${totalOrphaned === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {totalOrphaned === 0 ? "All linked" : `${totalOrphaned} orphaned`}
          </span>
        </div>
      </div>
      <div className="p-6">
        {totalOrphaned === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            All published content has at least one inbound internal link. Great for SEO!
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              These published pages have no inbound internal links from other content. Adding internal links improves discoverability and SEO.
            </p>

            {/* Orphaned Listings */}
            {orphanedListings.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowListings(!showListings)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-primary transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showListings ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  Listings ({orphanedListings.length})
                </button>
                {showListings && (
                  <ul className="mt-2 space-y-1 ml-5">
                    {orphanedListings.slice(0, 10).map((l) => (
                      <li key={l.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${typeColors[l.type] || "bg-gray-100 text-gray-700"}`}>{l.type}</span>
                          <span className="text-gray-700 truncate">{l.name}</span>
                        </div>
                        <Link to={`/admin/listings/${l.id}/edit`} className="text-xs text-primary hover:underline flex-shrink-0 ml-2">Edit</Link>
                      </li>
                    ))}
                    {orphanedListings.length > 10 && (
                      <li className="text-xs text-gray-400 italic">…and {orphanedListings.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Orphaned Posts */}
            {orphanedPosts.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPosts(!showPosts)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-primary transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showPosts ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  News Articles ({orphanedPosts.length})
                </button>
                {showPosts && (
                  <ul className="mt-2 space-y-1 ml-5">
                    {orphanedPosts.slice(0, 10).map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate">{p.title}</span>
                        <Link to={`/admin/posts/${p.id}/edit`} className="text-xs text-primary hover:underline flex-shrink-0 ml-2">Edit</Link>
                      </li>
                    ))}
                    {orphanedPosts.length > 10 && (
                      <li className="text-xs text-gray-400 italic">…and {orphanedPosts.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    stats,
    recentListings,
    recentPosts,
    recentReviews,
    gscConfigured,
    indexingData,
    bingConfigured,
    bingFeedsData,
    bingCrawlData,
    orphanedContent,
    searchTotals,
    ga4Sessions,
    speedMobile,
  } = loaderData;
  const searchTotalsValue = searchTotals as
    | { clicks: number; impressions: number; ctr: number; position: number }
    | null;
  const ga4SessionsValue = ga4Sessions as number | null;

  const statCards = [
    {
      label: "Total Listings",
      value: stats.listings.total.toString(),
      change: `${stats.listings.published} published`,
      changeType: "neutral",
    },
    {
      label: "Published",
      value: stats.listings.published.toString(),
      change: stats.listings.total > 0
        ? `${Math.round((stats.listings.published / stats.listings.total) * 100)}% of total`
        : "0%",
      changeType: "neutral",
    },
    {
      label: "News Articles",
      value: stats.blogPosts.toString(),
      change: "",
      changeType: "neutral",
    },
    {
      label: "Google Reviews",
      value: Number(stats.reviews.total_reviews).toLocaleString(),
      change: stats.reviews.linked_count > 0
        ? `${Number(stats.reviews.avg_rating).toFixed(1)} avg across ${stats.reviews.linked_count} listings`
        : "No listings linked",
      changeType: stats.reviews.linked_count > 0 ? "positive" : "neutral",
    },
    {
      label: "Pending Items",
      value: (stats.listings.pending + stats.listings.draft).toString(),
      change: "Needs attention",
      changeType: "warning",
    },
  ];

  const quickActions = [
    { label: "Add Listing", description: "Create a new directory listing", href: "/admin/listings/new", icon: "M12 4v16m8-8H4" },
    { label: "Add News Article", description: "Write a new news article", href: "/admin/posts/new", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
    { label: "Manage Media", description: "Upload and organize images", href: "/admin/media", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { label: "Google Reviews", description: "View and sync Google Reviews data", href: "/admin/reviews", icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" },
    { label: "Edit Categories", description: "Manage listing and news categories", href: "/admin/categories", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
    { label: "Site Settings", description: "Configure site preferences", href: "/admin/settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Welcome back. Here's what's happening with your site.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-lg p-6"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold text-dark mt-1">
              {stat.value}
            </p>
            <p
              className={`text-xs mt-1 ${
                stat.changeType === "positive"
                  ? "text-green-600"
                  : stat.changeType === "warning"
                    ? "text-amber-600"
                    : "text-gray-400"
              }`}
            >
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions grid */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-dark mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                <svg
                  className="w-5 h-5 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d={action.icon}
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">
                  {action.label}
                </p>
                <p className="text-xs text-gray-500">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Monitoring Quick-View Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link
          to="/admin/monitoring/search"
          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-primary/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Search Clicks (28d)</p>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {searchTotalsValue ? searchTotalsValue.clicks.toLocaleString() : "—"}
          </p>
          {searchTotalsValue && (
            <p className="text-xs text-gray-400 mt-1">
              {searchTotalsValue.impressions.toLocaleString()} impressions · {(searchTotalsValue.ctr * 100).toFixed(1)}% CTR
            </p>
          )}
          {!searchTotalsValue && (
            <p className="text-xs text-gray-400 mt-1">Not configured</p>
          )}
        </Link>

        <Link
          to="/admin/monitoring/analytics"
          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-primary/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions (28d)</p>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {ga4SessionsValue !== null ? ga4SessionsValue.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {ga4SessionsValue !== null ? "GA4 traffic data" : "Not configured"}
          </p>
        </Link>

        <Link
          to="/admin/monitoring/speed"
          className="bg-white border border-gray-200 rounded-lg p-5 hover:border-primary/30 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Speed Score (Mobile)</p>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          {speedMobile?.success ? (
            <>
              <p className={`text-2xl font-bold tabular-nums ${
                (speedMobile.performanceScore || 0) >= 90
                  ? "text-green-600"
                  : (speedMobile.performanceScore || 0) >= 50
                    ? "text-amber-600"
                    : "text-red-600"
              }`}>
                {speedMobile.performanceScore}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                LCP: {speedMobile.webVitals?.lcp.toFixed(1)}s · CLS: {speedMobile.webVitals?.cls.toFixed(3)}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-dark tabular-nums">—</p>
              <p className="text-xs text-gray-400 mt-1">Not configured</p>
            </>
          )}
        </Link>
      </div>

      {/* Indexing Overview */}
      <IndexingOverview
        gscConfigured={gscConfigured}
        indexingData={indexingData as SitemapsResult | null}
        publishedListings={stats.listings.published}
        blogPosts={stats.blogPosts}
      />

      {/* Bing Webmaster Overview */}
      <BingOverview
        bingConfigured={bingConfigured}
        bingFeedsData={bingFeedsData as BingFeedsResult | null}
        bingCrawlData={bingCrawlData as BingCrawlStatsResult | null}
      />

      {/* Orphaned Content */}
      <OrphanedContentCard orphanedContent={orphanedContent as any} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Recent Listings */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-dark">
                Recent Listings
              </h2>
              <Link
                to="/admin/listings"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(recentListings as any[]).map((listing: any) => (
                  <tr key={listing.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-medium text-sm text-gray-900">
                        {listing.name}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                          typeColors[listing.type] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {listing.type}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                          listing.status === "published"
                            ? "bg-green-100 text-green-700"
                            : listing.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {listing.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {listing.timeAgoText}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        to={`/admin/listings/${listing.id}/edit`}
                        className="text-sm text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: News Articles + Google Reviews */}
        <div className="space-y-6">
          {/* Recent News Articles */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-dark">
                Recent News Articles
              </h2>
              <Link
                to="/admin/posts"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {(recentPosts as any[]).map((post: any) => (
                <div
                  key={post.id}
                  className="px-6 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {post.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${getPostCategoryBadgeClass(post.category)}`}
                      >
                        {post.category || "Uncategorized"}
                      </span>
                      {post.published_at
                        ? formatShortDate(post.published_at)
                        : "Draft"}
                    </p>
                  </div>
                  <Link
                    to={`/admin/posts/${post.id}/edit`}
                    className="text-sm text-primary hover:underline whitespace-nowrap"
                  >
                    Edit
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Google Reviews */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-dark">
                Latest Google Reviews
              </h2>
              <Link
                to="/admin/reviews"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {(recentReviews as any[]).length > 0 ? (
                (recentReviews as any[]).map((review: any, idx: number) => (
                  <div key={idx} className="px-6 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm text-gray-900">
                        {review.author_name || "Anonymous"}
                      </p>
                      <StarRating count={review.rating || 0} />
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      on {review.listing_name || "Unknown listing"}
                    </p>
                    {review.text && (
                      <p className="text-xs text-gray-400 line-clamp-2">{review.text}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">
                  No Google Reviews yet. Link listings to Google Place IDs to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
