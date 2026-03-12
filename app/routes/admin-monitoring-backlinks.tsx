import { Link, useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-monitoring-backlinks";
import { requireAuth } from "../lib/auth.server";
import {
  hasDataForSEOCredentials,
  getDataForSEOCredentials,
  getBacklinksSummary,
  getReferringDomains,
  getBacklinksHistoryFromAPI,
  getAnchorTexts,
  getBacklinksList,
  type BacklinksSummary,
  type ReferringDomain,
  type BacklinksHistoryItem,
  type AnchorTextItem,
  type BacklinkItem,
} from "../lib/dataforseo.server";
import {
  saveBacklinkSnapshot,
  getBacklinkHistory,
  getLatestBacklinkSnapshot,
  type BacklinkHistoryPoint,
} from "../lib/dataforseo-queries.server";
import { siteConfig } from "../lib/site-config";
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
  Cell,
} from "recharts";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Backlinks | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const configured = await hasDataForSEOCredentials();
  if (!configured) {
    return {
      configured: false as const,
      summary: null as BacklinksSummary | null,
      previousSnapshot: null as BacklinkHistoryPoint | null,
      history: [] as BacklinkHistoryPoint[],
      domains: [] as ReferringDomain[],
      domainsTotal: 0,
    };
  }

  const creds = await getDataForSEOCredentials();
  const domain = new URL(siteConfig.siteUrl).hostname;

  let summary: BacklinksSummary | null = null;
  let domains: ReferringDomain[] = [];
  let domainsTotal = 0;

  if (creds) {
    try {
      summary = await getBacklinksSummary(domain, creds);
      const domainsResult = await getReferringDomains(domain, 50, creds);
      domains = domainsResult.items;
      domainsTotal = domainsResult.totalCount;
    } catch { /* API errors handled gracefully */ }
  }

  const history = await getBacklinkHistory(90);
  const previousSnapshot = await getLatestBacklinkSnapshot();

  return { configured: true as const, summary, previousSnapshot, history, domains, domainsTotal };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "refresh") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const summary = await getBacklinksSummary(domain, creds);
      if (summary) {
        const totalDofollow = summary.total_backlinks - summary.backlinks_nofollow;
        await saveBacklinkSnapshot({
          total_backlinks: summary.total_backlinks,
          referring_domains: summary.referring_domains,
          domain_rank: summary.rank,
          broken_backlinks: summary.broken_backlinks,
          referring_ips: summary.referring_ips,
          referring_subnets: summary.referring_subnets,
          dofollow: totalDofollow,
          nofollow: summary.backlinks_nofollow,
        });
      }
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO backlinks error:", message);
      return { error: `Failed to fetch backlinks: ${message}` };
    }
  }

  if (intent === "load-history") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const items = await getBacklinksHistoryFromAPI(domain, creds);
      return { historyItems: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to load history: ${message}` };
    }
  }

  if (intent === "load-anchors") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const data = await getAnchorTexts(domain, 100, creds);
      return { anchorItems: data.items, anchorTotal: data.totalCount };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to load anchors: ${message}` };
    }
  }

  if (intent === "load-backlinks") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    const filter = (formData.get("filter") as "new" | "lost" | "dofollow") || undefined;
    try {
      const data = await getBacklinksList(domain, 100, creds, filter);
      return { backlinkItems: data.items, backlinkTotal: data.totalCount };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to load backlinks: ${message}` };
    }
  }

  return { ok: false };
}

// ============================================
// HELPERS
// ============================================

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  const isUp = diff > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${isUp ? "text-emerald-600" : "text-red-500"}`}>
      <svg className={`w-3 h-3 ${isUp ? "" : "rotate-180"}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
      {formatNumber(Math.abs(diff))}
    </span>
  );
}

function SpamBadge({ score }: { score: number }) {
  const color = score < 30 ? "text-emerald-600" : score < 60 ? "text-amber-600" : "text-red-600";
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{score}</span>;
}

// ============================================
// COMPONENT
// ============================================

type TabType = "overview" | "history" | "anchors" | "all";

export default function AdminMonitoringBacklinks() {
  const { configured, summary, previousSnapshot, history, domains, domainsTotal } = useLoaderData<typeof loader>();
  const refreshFetcher = useFetcher();
  const historyFetcher = useFetcher<{ historyItems?: BacklinksHistoryItem[]; error?: string }>();
  const anchorsFetcher = useFetcher<{ anchorItems?: AnchorTextItem[]; anchorTotal?: number; error?: string }>();
  const backlinksFetcher = useFetcher<{ backlinkItems?: BacklinkItem[]; backlinkTotal?: number; error?: string }>();
  const [tab, setTab] = useState<TabType>("overview");
  const [blFilter, setBlFilter] = useState<string>("all");
  const isRefreshing = refreshFetcher.state !== "idle";

  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Backlinks</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Backlinks</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.282a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">Set up your DataForSEO API credentials to monitor backlinks.</p>
            <Link
              to="/admin/monitoring/indexing?tab=configuration"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Configure Credentials
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const chartData = history.map((h) => ({
    date: formatDateLabel(h.checked_at),
    backlinks: Number(h.total_backlinks),
    domains: h.referring_domains,
  }));

  const dofollow = summary ? summary.total_backlinks - summary.backlinks_nofollow : 0;
  const nofollow = summary?.backlinks_nofollow || 0;
  const linkTypeData = [
    { name: "DoFollow", value: dofollow },
    { name: "NoFollow", value: nofollow },
  ];

  const tabs: { id: TabType; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History" },
    { id: "anchors", label: "Anchors" },
    { id: "all", label: "All Backlinks" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Backlinks</span>
      </div>

      {/* Title + Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Backlinks</h1>
        <refreshFetcher.Form method="post">
          <input type="hidden" name="intent" value="refresh" />
          <button type="submit" disabled={isRefreshing} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50 transition-colors">
            <svg className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh & Save Snapshot"}
          </button>
        </refreshFetcher.Form>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              // Auto-fetch data for lazy-loaded tabs
              if (t.id === "history" && !historyFetcher.data) {
                historyFetcher.submit({ intent: "load-history" }, { method: "post" });
              } else if (t.id === "anchors" && !anchorsFetcher.data) {
                anchorsFetcher.submit({ intent: "load-anchors" }, { method: "post" });
              } else if (t.id === "all" && !backlinksFetcher.data) {
                backlinksFetcher.submit({ intent: "load-backlinks" }, { method: "post" });
              }
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <>
          {/* Summary Cards */}
          {summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Backlinks</p>
                <p className="text-2xl font-bold text-dark tabular-nums">{formatNumber(summary.total_backlinks)}</p>
                <TrendArrow current={summary.total_backlinks} previous={previousSnapshot ? Number(previousSnapshot.total_backlinks) : null} />
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">Referring Domains</p>
                <p className="text-2xl font-bold text-dark tabular-nums">{formatNumber(summary.referring_domains)}</p>
                <TrendArrow current={summary.referring_domains} previous={previousSnapshot?.referring_domains ?? null} />
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">Domain Rank</p>
                <p className="text-2xl font-bold text-dark tabular-nums">{summary.rank}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-sm font-medium text-gray-500 mb-1">Broken Backlinks</p>
                <p className={`text-2xl font-bold tabular-nums ${summary.broken_backlinks > 0 ? "text-red-600" : "text-dark"}`}>
                  {formatNumber(summary.broken_backlinks)}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm mb-8">
              No backlink data available. Click "Refresh & Save Snapshot" to fetch data.
            </div>
          )}

          {/* Trend Chart */}
          {chartData.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-dark mb-4">Backlink Trends (90 days)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={60} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <Area yAxisId="left" type="monotone" dataKey="backlinks" name="Backlinks" fill="#c1440e" fillOpacity={0.1} stroke="#c1440e" strokeWidth={2} />
                  <Area yAxisId="right" type="monotone" dataKey="domains" name="Referring Domains" fill="#6ba3c7" fillOpacity={0.1} stroke="#6ba3c7" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Link Type Breakdown */}
          {summary && (dofollow > 0 || nofollow > 0) && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-dark mb-4">Link Type Breakdown</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={linkTypeData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: "#374151" }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} formatter={(v: number | undefined) => [v ? formatNumber(v) : "--", ""]} />
                  <Bar dataKey="value" fill="#c1440e" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Referring Domains Table */}
          {domains.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dark">Top Referring Domains</h2>
                <span className="text-xs text-gray-400">{domainsTotal.toLocaleString()} total</span>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Backlinks</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Rank</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">DoFollow %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">First Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {domains.map((d, idx) => {
                    const dofollowPct = d.backlinks > 0 ? Math.round(((d.backlinks - d.backlinks_nofollow) / d.backlinks) * 100) : 0;
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">{d.domain}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">{d.backlinks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">{d.rank}</td>
                        <td className="px-4 py-3 text-sm text-right hidden md:table-cell">
                          <span className={`font-medium ${dofollowPct >= 80 ? "text-emerald-600" : dofollowPct >= 50 ? "text-amber-600" : "text-gray-600"}`}>{dofollowPct}%</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 text-right hidden lg:table-cell">
                          {d.first_seen ? new Date(d.first_seen).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "--"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div>
          {historyFetcher.state !== "idle" && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">Loading backlink history...</div>
          )}
          {historyFetcher.data?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{historyFetcher.data.error}</div>
          )}
          {historyFetcher.data?.historyItems && (() => {
            const items = historyFetcher.data.historyItems as BacklinksHistoryItem[];
            const chartItems = items.map((h) => ({
              date: formatMonthLabel(h.date),
              new: h.new_backlinks,
              lost: -h.lost_backlinks,
            }));
            const domainChartItems = items.map((h) => ({
              date: formatMonthLabel(h.date),
              new: h.new_referring_domains,
              lost: -h.lost_referring_domains,
            }));
            return (
              <>
                {/* New/Lost Backlinks Chart */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
                  <h2 className="text-lg font-semibold text-dark mb-4">New vs Lost Backlinks (Monthly)</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartItems} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                      <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={50} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                      <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      <Bar dataKey="new" name="New" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[0, 0, 4, 4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* New/Lost Referring Domains Chart */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
                  <h2 className="text-lg font-semibold text-dark mb-4">New vs Lost Referring Domains (Monthly)</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={domainChartItems} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                      <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={50} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                      <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      <Bar dataKey="new" name="New Domains" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lost" name="Lost Domains" fill="#ef4444" radius={[0, 0, 4, 4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Historical Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-dark">Monthly Backlink History</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                            <span className="text-emerald-600">New</span>
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                            <span className="text-red-500">Lost</span>
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Domains</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Rank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.slice(0, 36).map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-sm text-gray-700">{formatMonthLabel(item.date)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums">{formatNumber(item.backlinks)}</td>
                            <td className="px-4 py-2.5 text-sm text-emerald-600 text-right tabular-nums font-medium">+{formatNumber(item.new_backlinks)}</td>
                            <td className="px-4 py-2.5 text-sm text-red-500 text-right tabular-nums font-medium">-{formatNumber(item.lost_backlinks)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">{formatNumber(item.referring_domains)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums hidden md:table-cell">{item.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Anchors Tab ── */}
      {tab === "anchors" && (
        <div>
          {anchorsFetcher.state !== "idle" && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">Loading anchor text data...</div>
          )}
          {anchorsFetcher.data?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{anchorsFetcher.data.error}</div>
          )}
          {anchorsFetcher.data?.anchorItems && (() => {
            const items = anchorsFetcher.data.anchorItems as AnchorTextItem[];
            const topAnchors = items.slice(0, 10).map((a) => ({
              name: a.anchor.length > 30 ? a.anchor.slice(0, 30) + "..." : a.anchor,
              backlinks: a.backlinks,
            }));
            const barColors = ["#c1440e", "#d97706", "#059669", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#0ea5e9", "#14b8a6", "#f59e0b"];
            return (
              <>
                {/* Top Anchors Chart */}
                {topAnchors.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
                    <h2 className="text-lg font-semibold text-dark mb-4">Top 10 Anchor Texts</h2>
                    <ResponsiveContainer width="100%" height={Math.max(200, topAnchors.length * 35)}>
                      <BarChart data={topAnchors} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} tickLine={false} axisLine={false} width={160} />
                        <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
                        <Bar dataKey="backlinks" name="Backlinks" radius={[0, 4, 4, 0]} barSize={20}>
                          {topAnchors.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Anchors Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dark">Anchor Texts</h2>
                    <span className="text-xs text-gray-400">{(anchorsFetcher.data.anchorTotal ?? items.length).toLocaleString()} total</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Anchor Text</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Backlinks</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden sm:table-cell">Domains</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Spam</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">DoFollow %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-sm text-gray-900 font-medium max-w-[250px] truncate" title={item.anchor}>{item.anchor}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums">{item.backlinks.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">{item.referring_domains.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-center hidden md:table-cell"><SpamBadge score={item.backlinks_spam_score} /></td>
                            <td className="px-4 py-2.5 text-sm text-right hidden md:table-cell">
                              <span className={`font-medium ${item.dofollow_percent >= 80 ? "text-emerald-600" : item.dofollow_percent >= 50 ? "text-amber-600" : "text-gray-600"}`}>
                                {item.dofollow_percent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── All Backlinks Tab ── */}
      {tab === "all" && (
        <div>
          {/* Filter Controls */}
          <div className="flex items-center gap-2 mb-4">
            {["all", "dofollow", "new", "lost"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setBlFilter(f);
                  backlinksFetcher.submit(
                    { intent: "load-backlinks", filter: f === "all" ? "" : f },
                    { method: "post" }
                  );
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  blFilter === f ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {f === "all" ? "All" : f === "dofollow" ? "DoFollow" : f === "new" ? "New" : "Lost"}
              </button>
            ))}
          </div>

          {backlinksFetcher.state !== "idle" && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">Loading backlinks...</div>
          )}
          {backlinksFetcher.data?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{backlinksFetcher.data.error}</div>
          )}
          {backlinksFetcher.data?.backlinkItems && (() => {
            const items = backlinksFetcher.data.backlinkItems as BacklinkItem[];
            return (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-dark">Backlinks</h2>
                  <span className="text-xs text-gray-400">{(backlinksFetcher.data.backlinkTotal ?? items.length).toLocaleString()} total</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Anchor</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden sm:table-cell">DoFollow</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden md:table-cell">Spam</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap hidden sm:table-cell">Rank</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[250px]" title={item.url_from}>{item.domain_from}</p>
                            <p className="text-xs text-gray-400 truncate max-w-[250px]" title={item.url_from}>
                              {(() => { try { return new URL(item.url_from).pathname; } catch { return item.url_from; } })()}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[150px] truncate hidden lg:table-cell" title={item.anchor}>{item.anchor}</td>
                          <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.dofollow ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                              {item.dofollow ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell"><SpamBadge score={item.backlink_spam_score} /></td>
                          <td className="px-3 py-2.5 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">{item.rank}</td>
                          <td className="px-3 py-2.5 text-center">
                            {item.is_new ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">NEW</span>
                            ) : item.is_lost ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">LOST</span>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">LIVE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {items.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">No backlinks found for this filter.</div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
