import { Link, useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-monitoring-search";
import { requireAuth } from "../lib/auth.server";
import { getSettings } from "../lib/queries.server";
import { hasGoogleCredentials } from "../lib/google-auth.server";
import { siteConfig } from "../lib/site-config";
import {
  getSearchAnalytics,
  clearSearchAnalyticsCache,
  type SearchAnalyticsResult,
} from "../lib/search-analytics.server";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Search Performance | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// LOADER
// ============================================

type DateRange = "7d" | "28d" | "90d";

function isValidRange(v: string | null): v is DateRange {
  return v === "7d" || v === "28d" || v === "90d";
}

function daysAgoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const configured = hasGoogleCredentials();
  if (!configured) {
    return {
      configured: false as const,
      range: "28d" as DateRange,
      chartData: [] as { date: string; clicks: number; impressions: number }[],
      queriesData: [] as {
        query: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }[],
      chartTotals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      queriesTotals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
    };
  }

  const settings = await getSettings();
  const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const range: DateRange = isValidRange(rangeParam) ? rangeParam : "28d";

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 28;
  const startDate = daysAgoDate(days);
  const endDate = new Date().toISOString().slice(0, 10);

  const [chartResult, queriesResult] = await Promise.all([
    getSearchAnalytics(siteUrl, {
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 90,
    }),
    getSearchAnalytics(siteUrl, {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 25,
    }),
  ]);

  // Transform chart data: sort by date, format labels
  const chartData = (chartResult.rows || [])
    .map((row) => ({
      date: formatDateLabel(row.keys[0]),
      sortKey: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _, ...rest }) => rest);

  // Transform queries data
  const queriesData = (queriesResult.rows || [])
    .map((row) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const emptyTotals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  return {
    configured: true as const,
    range,
    chartData,
    queriesData,
    chartTotals: chartResult.totals || emptyTotals,
    queriesTotals: queriesResult.totals || emptyTotals,
  };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "refresh-search") {
    clearSearchAnalyticsCache();
    return { ok: true };
  }

  return { ok: false };
}

// ============================================
// HELPERS
// ============================================

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCtr(ctr: number): string {
  return (ctr * 100).toFixed(2) + "%";
}

function formatPosition(pos: number): string {
  return pos.toFixed(1);
}

// ============================================
// COMPONENT
// ============================================

export default function AdminMonitoringSearch() {
  const { configured, range, chartData, queriesData, chartTotals, queriesTotals } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";

  // Not configured state
  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">
            Admin
          </Link>
          <span>/</span>
          <span>Monitoring</span>
          <span>/</span>
          <span>Search Performance</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">
          Search Performance
        </h1>
        <div className="max-w-lg mx-auto mt-16">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">
              Google Search Console is not configured.
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Set up your Google service account credentials and site URL to view
              search performance data.
            </p>
            <Link
              to="/admin/monitoring/indexing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Configure Credentials
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
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const ranges: { label: string; value: DateRange }[] = [
    { label: "7d", value: "7d" },
    { label: "28d", value: "28d" },
    { label: "90d", value: "90d" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <span>Monitoring</span>
        <span>/</span>
        <span>Search Performance</span>
      </div>

      {/* Title + Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">
          Search Performance
        </h1>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="refresh-search" />
          <button
            type="submit"
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50 transition-colors"
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
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </fetcher.Form>
      </div>

      {/* Date Range Selector */}
      <div className="flex items-center gap-1 mb-6">
        {ranges.map((r) => (
          <Link
            key={r.value}
            to={`/admin/monitoring/search?range=${r.value}`}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              range === r.value
                ? "bg-primary text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">
            Total Clicks
          </p>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {formatNumber(chartTotals.clicks)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">
            Total Impressions
          </p>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {formatNumber(chartTotals.impressions)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Avg CTR</p>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {formatCtr(chartTotals.ctr)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">
            Avg Position
          </p>
          <p className="text-2xl font-bold text-dark tabular-nums">
            {formatPosition(chartTotals.position)}
          </p>
        </div>
      </div>

      {/* Line Chart: Clicks + Impressions over time */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-dark mb-4">
          Clicks &amp; Impressions
        </h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                yAxisId="clicks"
                orientation="left"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <YAxis
                yAxisId="impressions"
                orientation="right"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "13px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "13px", paddingTop: "8px" }}
              />
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="clicks"
                name="Clicks"
                stroke="#c1440e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#c1440e" }}
              />
              <Line
                yAxisId="impressions"
                type="monotone"
                dataKey="impressions"
                name="Impressions"
                stroke="#6ba3c7"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#6ba3c7" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[350px] text-gray-400 text-sm">
            No data available for this date range.
          </div>
        )}
      </div>

      {/* Top Queries Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-dark">
            Top Queries
          </h2>
        </div>
        {queriesData.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Clicks
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Impressions
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  CTR
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Avg Position
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queriesData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">
                    {row.query}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                    {formatNumber(row.clicks)}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                    {formatNumber(row.impressions)}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                    {formatCtr(row.ctr)}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 text-right tabular-nums">
                    {formatPosition(row.position)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-6 py-3 text-sm font-bold text-gray-900">
                  Total
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
                  {formatNumber(queriesTotals.clicks)}
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
                  {formatNumber(queriesTotals.impressions)}
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
                  {formatCtr(queriesTotals.ctr)}
                </td>
                <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
                  {formatPosition(queriesTotals.position)}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            No query data available for this date range.
          </div>
        )}
      </div>
    </div>
  );
}
