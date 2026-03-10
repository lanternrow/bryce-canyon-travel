import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/admin-monitoring-analytics";
import { requireAuth } from "../lib/auth.server";
import { getSettings } from "../lib/queries.server";
import { hasGoogleCredentials } from "../lib/google-auth.server";
import {
  runGA4Report,
  clearGA4Cache,
  type GA4ReportResult,
} from "../lib/ga4-analytics.server";
import { refreshBlogPopularityFromGA4 } from "../lib/blog-popularity.server";
import { refreshListingPopularityFromGA4 } from "../lib/listing-popularity.server";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { siteConfig } from "../lib/site-config";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Site Analytics | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// DATE HELPERS
// ============================================

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Convert GA4 "YYYYMMDD" string to "Mar 01" display format */
function formatGA4Date(raw: string): string {
  const y = parseInt(raw.substring(0, 4), 10);
  const m = parseInt(raw.substring(4, 6), 10) - 1;
  const d = parseInt(raw.substring(6, 8), 10);
  return `${MONTH_NAMES[m]} ${String(d).padStart(2, "0")}`;
}

// ============================================
// LOADER
// ============================================

type ValidRange = "7d" | "28d" | "90d";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const settings = await getSettings();
  const ga4PropertyId = (settings as Record<string, string>).ga4_property_id;
  const hasCreds = hasGoogleCredentials();

  if (!ga4PropertyId || !hasCreds) {
    return {
      configured: false,
      hasPropertyId: !!ga4PropertyId,
      hasCredentials: hasCreds,
      range: "28d" as ValidRange,
      dateData: null as GA4ReportResult | null,
      sourceData: null as GA4ReportResult | null,
      pageData: null as GA4ReportResult | null,
    };
  }

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const range: ValidRange =
    rangeParam === "7d" || rangeParam === "90d"
      ? rangeParam
      : "28d";

  const daysAgo = range.replace("d", "daysAgo");

  const [dateData, sourceData, pageData] = await Promise.all([
    runGA4Report(ga4PropertyId, {
      startDate: daysAgo,
      endDate: "today",
      dimensions: ["date"],
      metrics: ["sessions", "activeUsers", "screenPageViews"],
    }),
    runGA4Report(ga4PropertyId, {
      startDate: daysAgo,
      endDate: "today",
      dimensions: ["sessionSource"],
      metrics: ["sessions"],
      limit: 10,
      orderBy: { metric: "sessions", desc: true },
    }),
    runGA4Report(ga4PropertyId, {
      startDate: daysAgo,
      endDate: "today",
      dimensions: ["pagePath"],
      metrics: ["screenPageViews", "activeUsers"],
      limit: 15,
      orderBy: { metric: "screenPageViews", desc: true },
    }),
  ]);

  return {
    configured: true,
    hasPropertyId: true,
    hasCredentials: true,
    range,
    dateData,
    sourceData,
    pageData,
  };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "refresh-analytics") {
    clearGA4Cache();
    return { ok: true };
  }

  if (intent === "refresh-popularity") {
    const [listingPopularity, postPopularity] = await Promise.all([
      refreshListingPopularityFromGA4(),
      refreshBlogPopularityFromGA4(),
    ]);
    const ok = listingPopularity.success && postPopularity.success;
    return {
      ok,
      listingPopularity,
      postPopularity,
      error: ok
        ? undefined
        : listingPopularity.error || postPopularity.error || "Popularity refresh failed",
    };
  }

  return { ok: true };
}

// ============================================
// COMPONENT
// ============================================

export default function AdminMonitoringAnalytics() {
  const {
    configured,
    hasPropertyId,
    hasCredentials,
    range,
    dateData,
    sourceData,
    pageData,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const popularityFetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";
  const isRefreshingPopularity = popularityFetcher.state !== "idle";

  // ---- Not configured state ----
  if (!configured) {
    return (
      <div className="px-6 py-8">
        <Breadcrumb />
        <h1 className="text-3xl font-bold text-dark mb-6">
          Site Analytics
        </h1>
        <div className="max-w-lg mx-auto mt-12">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">
              GA4 Data API is not configured.
            </h2>
            <div className="text-sm text-gray-500 space-y-2 mb-6">
              {!hasPropertyId && (
                <p>
                  Add your GA4 Property ID in{" "}
                  <strong>Settings &rarr; Tracking</strong>.
                </p>
              )}
              {!hasCredentials && (
                <p>Set up Google service account credentials.</p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                The service account email must be added as a Viewer in your GA4
                property.
              </p>
            </div>
            <Link
              to="/admin/monitoring/indexing?tab=configuration"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Tracking Settings
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- Transform date data for chart ----
  const chartData = (dateData?.rows || [])
    .map((row) => ({
      date: formatGA4Date(row.dimensionValues[0]),
      sortKey: row.dimensionValues[0],
      sessions: row.metricValues[0],
      users: row.metricValues[1],
      pageviews: row.metricValues[2],
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // ---- Summary totals ----
  const totalSessions = dateData?.totals?.[0] ?? 0;
  const totalUsers = dateData?.totals?.[1] ?? 0;
  const totalPageviews = dateData?.totals?.[2] ?? 0;

  // ---- Transform source data for bar chart ----
  const sourceChartData = (sourceData?.rows || []).map((row) => ({
    source: row.dimensionValues[0] || "(direct)",
    sessions: row.metricValues[0],
  }));

  // ---- Transform page data for table ----
  const pageTableData = (pageData?.rows || []).map((row) => ({
    path: row.dimensionValues[0],
    pageviews: row.metricValues[0],
    users: row.metricValues[1],
  }));

  // ---- Check for errors ----
  const hasError =
    dateData && !dateData.success;

  return (
    <div className="px-6 py-8">
      <Breadcrumb />

      {/* Header with refresh */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Site Analytics</h1>
        <div className="flex items-center gap-3">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-analytics" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
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
              {isRefreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </fetcher.Form>

          <popularityFetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-popularity" />
            <button
              type="submit"
              disabled={isRefreshingPopularity}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isRefreshingPopularity ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321 1.01l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.386a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0l-4.725 2.886a.562.562 0 01-.84-.611l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-1.01l5.518-.442a.563.563 0 00.475-.345l2.125-5.11z" />
              </svg>
              {isRefreshingPopularity ? "Refreshing Popular..." : "Refresh Popular Badges (Listings + News Articles)"}
            </button>
          </popularityFetcher.Form>
        </div>
      </div>

      {popularityFetcher.data && (
        <div
          className={`mb-6 p-3 rounded-lg text-sm border ${
            (popularityFetcher.data as any).ok
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {(popularityFetcher.data as any).ok ? (
            <span>
              Popular badges refreshed. {(popularityFetcher.data as any).listingPopularity?.popularCount ?? 0} of{" "}
              {(popularityFetcher.data as any).listingPopularity?.totalListings ?? 0} published listings and{" "}
              {(popularityFetcher.data as any).postPopularity?.popularCount ?? 0} of{" "}
              {(popularityFetcher.data as any).postPopularity?.totalPosts ?? 0} published news articles are currently marked popular.
            </span>
          ) : (
            <span>{(popularityFetcher.data as any).error || "Popularity refresh failed."}</span>
          )}
        </div>
      )}

      {/* Date range selector */}
      <div className="flex items-center gap-2 mb-6">
        {(["7d", "28d", "90d"] as const).map((r) => (
          <Link
            key={r}
            to={`/admin/monitoring/analytics?range=${r}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              range === r
                ? "bg-primary text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {r === "7d" ? "7 Days" : r === "28d" ? "28 Days" : "90 Days"}
          </Link>
        ))}
      </div>

      {/* Error state */}
      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700">
            Failed to fetch analytics data: {dateData?.error || "Unknown error"}
          </p>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500">Sessions</p>
          <p className="text-2xl font-bold text-dark tabular-nums mt-1">
            {totalSessions.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500">Users</p>
          <p className="text-2xl font-bold text-dark tabular-nums mt-1">
            {totalUsers.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500">Pageviews</p>
          <p className="text-2xl font-bold text-dark tabular-nums mt-1">
            {totalPageviews.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Area chart: Sessions + Pageviews over time */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-dark mb-4">
            Traffic Over Time
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="sessions"
                name="Sessions"
                fill="#c1440e"
                fillOpacity={0.1}
                stroke="#c1440e"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="pageviews"
                name="Pageviews"
                fill="#6ba3c7"
                fillOpacity={0.1}
                stroke="#6ba3c7"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Traffic Sources + Top Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources - horizontal bar chart */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-dark">
              Traffic Sources
            </h2>
          </div>
          <div className="p-6">
            {sourceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, sourceChartData.length * 40)}>
                <BarChart
                  layout="vertical"
                  data={sourceChartData}
                  margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="source"
                    tick={{ fontSize: 12, fill: "#374151" }}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Bar
                    dataKey="sessions"
                    name="Sessions"
                    fill="#c1440e"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                No source data available for this period.
              </p>
            )}
          </div>
        </div>

        {/* Top Pages - table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-dark">Top Pages</h2>
          </div>
          {pageTableData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Page Path
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Pageviews
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Users
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageTableData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm text-gray-900 font-mono text-xs truncate max-w-[250px]">
                        {row.path}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                        {row.pageviews.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                        {row.users.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              No page data available for this period.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// BREADCRUMB
// ============================================

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
      <Link to="/admin/dashboard" className="hover:text-primary">
        Admin
      </Link>
      <span>/</span>
      <span>Monitoring</span>
      <span>/</span>
      <span className="text-gray-900 font-medium">Site Analytics</span>
    </nav>
  );
}
