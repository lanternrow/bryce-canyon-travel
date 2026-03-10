import { Link, useLoaderData, useFetcher, Form, redirect, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-monitoring-indexing";
import { requireAuth } from "../lib/auth.server";
import { getSettings, updateSetting, getAdminStats } from "../lib/queries.server";
import { hasGoogleCredentials } from "../lib/google-auth.server";
import {
  listSitemaps,
  clearSitemapsCache,
  submitAllSitemaps,
  inspectUrl,
  type SitemapsResult,
} from "../lib/search-console.server";
import {
  hasBingCredentials,
  listBingFeeds,
  getBingCrawlStats,
  clearBingCache,
  submitAllBingFeeds,
  type BingFeedsResult,
  type BingCrawlStatsResult,
} from "../lib/bing-webmaster.server";
import { siteConfig } from "../lib/site-config";

// ============================================
// Meta
// ============================================

export function meta() {
  return [{ title: `Indexing | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// Loader
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [settings, stats] = await Promise.all([getSettings(), getAdminStats()]);

  const gscConfigured = hasGoogleCredentials();
  const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;

  let indexingData: SitemapsResult | null = null;
  if (gscConfigured) {
    indexingData = await listSitemaps(siteUrl);
  }

  const bingConfigured = await hasBingCredentials();
  let bingFeedsData: BingFeedsResult | null = null;
  let bingCrawlData: BingCrawlStatsResult | null = null;

  if (bingConfigured) {
    [bingFeedsData, bingCrawlData] = await Promise.all([
      listBingFeeds(siteUrl),
      getBingCrawlStats(siteUrl),
    ]);
  }

  return {
    settings,
    gscConfigured,
    indexingData,
    bingConfigured,
    bingFeedsData,
    bingCrawlData,
    publishedListings: stats.listings.published,
    blogPosts: stats.blogPosts,
  };
}

// ============================================
// Action
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "refresh-indexing") {
    clearSitemapsCache();
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    await listSitemaps(siteUrl, true);
    return { ok: true };
  }

  if (intent === "refresh-bing") {
    clearBingCache();
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    await Promise.all([
      listBingFeeds(siteUrl, true),
      getBingCrawlStats(siteUrl, true),
    ]);
    return { ok: true };
  }

  if (intent === "submit-sitemaps") {
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    const result = await submitAllSitemaps(siteUrl);
    const succeeded = result.results.filter((r) => r.success).length;
    const failed = result.results.filter((r) => !r.success).length;
    const msg =
      failed > 0
        ? `Submitted ${succeeded} sitemaps to Google (${failed} failed)`
        : `Submitted ${succeeded} sitemaps to Google`;
    return redirect(`/admin/monitoring/indexing?toast=${encodeURIComponent(msg)}`);
  }

  if (intent === "submit-sitemaps-bing") {
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    const result = await submitAllBingFeeds(siteUrl);
    const succeeded = result.results.filter((r) => r.success).length;
    const failed = result.results.filter((r) => !r.success).length;
    const msg =
      failed > 0
        ? `Submitted ${succeeded} sitemaps to Bing (${failed} failed)`
        : `Submitted ${succeeded} sitemaps to Bing`;
    return redirect(`/admin/monitoring/indexing?toast=${encodeURIComponent(msg)}`);
  }

  if (intent === "save-gsc") {
    const gscSiteUrl = (formData.get("gsc_site_url") as string) || "";
    await updateSetting("gsc_site_url", gscSiteUrl);
    return redirect("/admin/monitoring/indexing?tab=configuration&toast=Google+Search+Console+settings+saved");
  }

  if (intent === "save-bing") {
    const bingApiKey = (formData.get("bing_api_key") as string) || "";
    await updateSetting("bing_api_key", bingApiKey);
    return redirect("/admin/monitoring/indexing?tab=configuration&toast=Bing+Webmaster+settings+saved");
  }

  if (intent === "save-indexnow") {
    const indexnowApiKey = (formData.get("indexnow_api_key") as string) || "";
    await updateSetting("indexnow_api_key", indexnowApiKey);
    return redirect("/admin/monitoring/indexing?tab=configuration&toast=IndexNow+settings+saved");
  }

  if (intent === "save-tracking") {
    for (const key of ["ga4_measurement_id", "ga4_property_id", "google_ads_id", "gsc_verification", "facebook_pixel_id"]) {
      await updateSetting(key, (formData.get(key) as string) || "");
    }
    return redirect("/admin/monitoring/indexing?tab=configuration&toast=Tracking+settings+saved");
  }

  if (intent === "inspect-url") {
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;
    const inspectionUrl = (formData.get("url") as string) || "";
    if (!inspectionUrl) {
      return { inspectResult: null, error: "URL is required" };
    }
    const result = await inspectUrl(siteUrl, inspectionUrl);
    return { inspectResult: result };
  }

  return { ok: true };
}

// ============================================
// Helper functions
// ============================================

type Tab = "indexing" | "configuration";

const STATIC_PAGE_COUNT = 10;

function sitemapLabel(path: string): string | null {
  if (path.includes("sitemap-pages")) return "Pages";
  if (path.includes("sitemap-listings")) return "Listings";
  if (path.includes("sitemap-posts")) return "News Articles";
  if (path.includes("sitemap.xml") && !path.includes("sitemap-")) return null;
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

function verdictBadge(verdict: string): { label: string; className: string } {
  switch (verdict) {
    case "PASS":
      return { label: "Pass", className: "bg-emerald-100 text-emerald-700" };
    case "PARTIAL":
      return { label: "Partial", className: "bg-amber-100 text-amber-700" };
    case "FAIL":
      return { label: "Fail", className: "bg-red-100 text-red-700" };
    case "NEUTRAL":
      return { label: "Neutral", className: "bg-gray-100 text-gray-700" };
    default:
      return { label: verdict || "Unknown", className: "bg-gray-100 text-gray-700" };
  }
}

// ============================================
// Refresh icon SVG (reused across sections)
// ============================================

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`}
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
  );
}

// ============================================
// Google Indexing Status Section
// ============================================

function GoogleIndexingStatus({
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

  if (!gscConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-dark mb-2">
          Google Indexing Status
        </h2>
        <p className="text-sm text-gray-500">
          Google Search Console credentials are not configured.{" "}
          <span className="text-primary">
            Switch to the Configuration tab to set up your credentials.
          </span>
        </p>
      </div>
    );
  }

  if (!indexingData || !indexingData.success || !indexingData.sitemaps) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-dark">
            Google Indexing Status
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
          {indexingData?.error ||
            "Unable to fetch indexing data from Google Search Console. Try refreshing."}
        </p>
      </div>
    );
  }

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

  const totalSubmitted = rows.reduce((s, r) => s + r.submitted, 0);
  const totalIndexed = rows.reduce((s, r) => s + r.indexed, 0);
  const totalPublished = rows.reduce((s, r) => s + r.published, 0);
  const totalCoverage =
    totalPublished > 0
      ? Math.round((totalIndexed / totalPublished) * 100)
      : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dark">
          Google Indexing Status
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
              <RefreshIcon spinning={isRefreshing} />
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
            const coverage =
              row.published > 0
                ? Math.round((row.indexed / row.published) * 100)
                : 0;
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
                <td
                  className={`px-6 py-3 text-sm font-semibold text-right tabular-nums ${coverageColor(coverage)}`}
                >
                  {coverage}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td className="px-6 py-3 text-sm font-bold text-gray-900">
              Total
            </td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalSubmitted}
            </td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalIndexed}
            </td>
            <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
              {totalPublished}
            </td>
            <td
              className={`px-6 py-3 text-sm font-bold text-right tabular-nums ${coverageColor(totalCoverage)}`}
            >
              {totalCoverage}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ============================================
// Bing Indexing Status Section
// ============================================

function BingIndexingStatus({
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

  if (!bingConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-dark mb-2">
          Bing Indexing Status
        </h2>
        <p className="text-sm text-gray-500">
          Bing API key is not configured.{" "}
          <span className="text-primary">
            Switch to the Configuration tab to add your API key.
          </span>
        </p>
      </div>
    );
  }

  const hasError =
    (!bingFeedsData || !bingFeedsData.success) &&
    (!bingCrawlData || !bingCrawlData.success);

  if (hasError) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-dark">
            Bing Indexing Status
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

  const latestStats =
    bingCrawlData?.stats && bingCrawlData.stats.length > 0
      ? bingCrawlData.stats[bingCrawlData.stats.length - 1]
      : null;

  const cachedAt = bingFeedsData?.cachedAt || bingCrawlData?.cachedAt;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dark">
          Bing Indexing Status
        </h2>
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
              <RefreshIcon spinning={isRefreshing} />
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
                          : "\u2014"}
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
              No sitemaps registered in Bing yet. Use the Submit Sitemaps
              buttons above to get started.
            </p>
          )}
      </div>
    </div>
  );
}

// ============================================
// Sitemap Submission Section (on Indexing tab)
// ============================================

function SitemapSubmission({
  gscConfigured,
  bingConfigured,
}: {
  gscConfigured: boolean;
  bingConfigured: boolean;
}) {
  const googleFetcher = useFetcher();
  const bingFetcher = useFetcher();
  const isSubmittingGoogle = googleFetcher.state !== "idle";
  const isSubmittingBing = bingFetcher.state !== "idle";

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-dark">
          Submit Sitemaps
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Submit all sitemaps (index, pages, listings, news articles) to search engines.
        </p>
      </div>
      <div className="p-6">
        <div className="flex flex-wrap gap-3">
          <googleFetcher.Form method="post">
            <input type="hidden" name="intent" value="submit-sitemaps" />
            <button
              type="submit"
              disabled={!gscConfigured || isSubmittingGoogle}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className={`w-4 h-4 ${isSubmittingGoogle ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isSubmittingGoogle ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                )}
              </svg>
              {isSubmittingGoogle ? "Submitting..." : "Submit to Google"}
            </button>
          </googleFetcher.Form>
          <bingFetcher.Form method="post">
            <input type="hidden" name="intent" value="submit-sitemaps-bing" />
            <button
              type="submit"
              disabled={!bingConfigured || isSubmittingBing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className={`w-4 h-4 ${isSubmittingBing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isSubmittingBing ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                )}
              </svg>
              {isSubmittingBing ? "Submitting..." : "Submit to Bing"}
            </button>
          </bingFetcher.Form>
        </div>
        {(!gscConfigured || !bingConfigured) && (
          <p className="text-xs text-gray-400 mt-3">
            {!gscConfigured && !bingConfigured
              ? "Both Google and Bing credentials need to be configured in the Configuration tab."
              : !gscConfigured
                ? "Google Search Console credentials need to be configured in the Configuration tab."
                : "Bing Webmaster API key needs to be configured in the Configuration tab."}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// URL Inspection Section
// ============================================

function UrlInspection({ gscConfigured }: { gscConfigured: boolean }) {
  const fetcher = useFetcher();
  const isInspecting = fetcher.state !== "idle";
  const inspectResult = (fetcher.data as any)?.inspectResult;
  const inspectError = (fetcher.data as any)?.error;

  if (!gscConfigured) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-dark">
          URL Inspection
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Check the indexing status of a specific URL in Google Search Console.
        </p>
      </div>
      <div className="p-6">
        <fetcher.Form method="post" className="flex gap-3">
          <input type="hidden" name="intent" value="inspect-url" />
          <input
            type="url"
            name="url"
            placeholder={`${siteConfig.siteUrl}/dining`}
            required
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm"
          />
          <button
            type="submit"
            disabled={isInspecting}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isInspecting ? "Inspecting..." : "Inspect"}
          </button>
        </fetcher.Form>

        {inspectError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {inspectError}
          </div>
        )}

        {inspectResult && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            {!inspectResult.success ? (
              <div className="p-4 bg-red-50 text-sm text-red-700">
                {inspectResult.error || "Inspection failed"}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Verdict
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${verdictBadge(inspectResult.verdict || "").className}`}
                  >
                    {verdictBadge(inspectResult.verdict || "").label}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Coverage State
                  </span>
                  <span className="text-sm text-gray-600">
                    {inspectResult.coverageState || "\u2014"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Indexing State
                  </span>
                  <span className="text-sm text-gray-600">
                    {inspectResult.indexingState || "\u2014"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">
                    Last Crawl Time
                  </span>
                  <span className="text-sm text-gray-600">
                    {inspectResult.lastCrawlTime
                      ? new Date(inspectResult.lastCrawlTime).toLocaleString()
                      : "\u2014"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Configuration Tab Content
// ============================================

function ConfigurationTab({
  settings,
  gscConfigured,
}: {
  settings: Record<string, string>;
  gscConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Google Search Console */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-dark">
              Google Search Console
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                gscConfigured
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${gscConfigured ? "bg-emerald-500" : "bg-gray-400"}`}
              />
              {gscConfigured ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>
        <div className="p-6">
          <Form method="post">
            <input type="hidden" name="intent" value="save-gsc" />
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                name="gsc_site_url"
                defaultValue={settings.gsc_site_url || ""}
                placeholder={siteConfig.siteUrl}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Must match the property URL in Google Search Console exactly
              (including protocol). Service account is configured via the{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">
                GOOGLE_SERVICE_ACCOUNT_JSON
              </code>{" "}
              environment variable.
            </p>
          </Form>
        </div>
      </div>

      {/* Bing Webmaster */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-dark">
            Bing Webmaster Tools
          </h2>
        </div>
        <div className="p-6">
          <Form method="post">
            <input type="hidden" name="intent" value="save-bing" />
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <div className="flex gap-3">
              <input
                type="password"
                name="bing_api_key"
                defaultValue={settings.bing_api_key || ""}
                placeholder="Enter Bing Webmaster API key"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </Form>
        </div>
      </div>

      {/* IndexNow */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-dark">IndexNow</h2>
        </div>
        <div className="p-6">
          <Form method="post">
            <input type="hidden" name="intent" value="save-indexnow" />
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                name="indexnow_api_key"
                defaultValue={settings.indexnow_api_key || ""}
                placeholder="Enter IndexNow API key"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              IndexNow instantly notifies search engines (Bing, Yandex) when
              content changes.
            </p>
          </Form>
        </div>
      </div>

      {/* Site Analytics & Tracking */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-dark">Site Analytics & Tracking</h2>
        </div>
        <div className="p-6">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="save-tracking" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GA4 Measurement ID</label>
              <input type="text" name="ga4_measurement_id" defaultValue={settings.ga4_measurement_id || ""} placeholder="G-XXXXXXXXXX" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GA4 Property ID (Data API)</label>
              <input type="text" name="ga4_property_id" defaultValue={settings.ga4_property_id || ""} placeholder="123456789" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono" />
              <p className="text-xs text-gray-400 mt-1">Numeric property ID from GA4 Admin &gt; Property Settings. Service account must be added as Viewer. Powers the <a href="/admin/monitoring/analytics" className="text-primary hover:underline">Site Analytics</a> dashboard.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Ads ID</label>
              <input type="text" name="google_ads_id" defaultValue={settings.google_ads_id || ""} placeholder="AW-XXXXXXXXX" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Search Console Verification</label>
              <input type="text" name="gsc_verification" defaultValue={settings.gsc_verification || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono" />
              <p className="text-xs text-gray-400 mt-1">Meta tag content value for Google Search Console ownership verification.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Pixel ID</label>
              <input type="text" name="facebook_pixel_id" defaultValue={settings.facebook_pixel_id || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono" />
            </div>
            <div className="pt-1">
              <button type="submit" className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">Save</button>
            </div>
          </Form>
        </div>
      </div>

      {/* Robots.txt */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-dark">Robots.txt</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600">
            Your{" "}
            <a
              href="/robots.txt"
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline"
            >
              robots.txt
            </a>{" "}
            is auto-generated and includes your sitemap URLs. Search engines use
            it to discover your sitemaps automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Toast notification
// ============================================

function Toast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="bg-dark text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-3">
        <svg
          className="w-5 h-5 text-emerald-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={() => setVisible(false)}
          className="ml-2 text-white/70 hover:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================
// Page Component
// ============================================

export default function AdminMonitoringIndexing() {
  const {
    settings,
    gscConfigured,
    indexingData,
    bingConfigured,
    bingFeedsData,
    bingCrawlData,
    publishedListings,
    blogPosts,
  } = useLoaderData<typeof loader>();

  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as Tab | null;
  const toastMessage = searchParams.get("toast");
  const [activeTab, setActiveTab] = useState<Tab>(tabFromUrl === "configuration" ? "configuration" : "indexing");

  const tabs = [
    { id: "indexing" as Tab, label: "Indexing" },
    { id: "configuration" as Tab, label: "Configuration" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Toast notification */}
      {toastMessage && <Toast message={toastMessage} />}

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-2">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span className="mx-1.5">/</span>
        <span>Monitoring</span>
        <span className="mx-1.5">/</span>
        <span className="text-gray-900">Indexing</span>
      </nav>

      {/* Page title */}
      <h1 className="text-3xl font-bold text-dark mb-6">Indexing</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-primary border border-gray-200 border-b-white -mb-px"
                : "text-gray-500 hover:text-dark hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Indexing tab */}
      {activeTab === "indexing" && (
        <div className="space-y-6">
          {/* Sitemap Submission — prominently at the top */}
          <SitemapSubmission
            gscConfigured={gscConfigured}
            bingConfigured={bingConfigured}
          />

          {/* Google Indexing Status */}
          <GoogleIndexingStatus
            gscConfigured={gscConfigured}
            indexingData={indexingData as SitemapsResult | null}
            publishedListings={publishedListings}
            blogPosts={blogPosts}
          />

          {/* Bing Indexing Status */}
          <BingIndexingStatus
            bingConfigured={bingConfigured}
            bingFeedsData={bingFeedsData as BingFeedsResult | null}
            bingCrawlData={bingCrawlData as BingCrawlStatsResult | null}
          />

          {/* URL Inspection */}
          <UrlInspection gscConfigured={gscConfigured} />
        </div>
      )}

      {/* Configuration tab */}
      {activeTab === "configuration" && (
        <ConfigurationTab
          settings={settings as Record<string, string>}
          gscConfigured={gscConfigured}
        />
      )}
    </div>
  );
}
