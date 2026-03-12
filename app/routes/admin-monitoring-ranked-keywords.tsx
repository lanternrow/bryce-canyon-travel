import { Link, useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-monitoring-ranked-keywords";
import { requireAuth } from "../lib/auth.server";
import {
  hasDataForSEOCredentials,
  getDataForSEOCredentials,
  getRankedKeywords,
  clearDataForSEOCache,
  type RankedKeywordItem,
} from "../lib/dataforseo.server";
import { addTrackedKeyword } from "../lib/dataforseo-queries.server";
import { siteConfig } from "../lib/site-config";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Ranked Keywords | Monitoring | Admin | ${siteConfig.siteName}` }];
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
      items: [] as RankedKeywordItem[],
      totalCount: 0,
      positionBuckets: [] as Array<{ range: string; count: number }>,
      totalEtv: 0,
    };
  }

  const creds = await getDataForSEOCredentials();
  if (!creds) {
    return { configured: true as const, items: [] as RankedKeywordItem[], totalCount: 0, positionBuckets: [] as Array<{ range: string; count: number }>, totalEtv: 0 };
  }

  try {
    const data = await getRankedKeywords(new URL(siteConfig.siteUrl).hostname, creds);

    // Calculate position buckets
    const buckets = { "1-3": 0, "4-10": 0, "11-20": 0, "21-50": 0, "51-100": 0 };
    for (const item of data.items) {
      if (item.position <= 3) buckets["1-3"]++;
      else if (item.position <= 10) buckets["4-10"]++;
      else if (item.position <= 20) buckets["11-20"]++;
      else if (item.position <= 50) buckets["21-50"]++;
      else buckets["51-100"]++;
    }
    const positionBuckets = Object.entries(buckets).map(([range, count]) => ({ range, count }));
    // Use API's pre-computed total etv (covers ALL keywords, not just top 1000)
    const organicMetrics = data.metrics?.organic;
    const totalEtv = organicMetrics?.etv ?? data.items.reduce((sum, item) => sum + item.etv, 0);

    return { configured: true as const, items: data.items, totalCount: data.totalCount, positionBuckets, totalEtv };
  } catch {
    return { configured: true as const, items: [] as RankedKeywordItem[], totalCount: 0, positionBuckets: [] as Array<{ range: string; count: number }>, totalEtv: 0 };
  }
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "refresh") {
    clearDataForSEOCache();
    return { ok: true };
  }

  if (intent === "track-keyword") {
    const keyword = (formData.get("keyword") as string)?.trim().toLowerCase();
    const volume = Number(formData.get("volume")) || undefined;
    const competition = Number(formData.get("competition")) || undefined;
    const cpc = Number(formData.get("cpc")) || undefined;
    if (!keyword) return { error: "Keyword is required" };
    await addTrackedKeyword(keyword, { search_volume: volume, competition, cpc });
    return { tracked: keyword };
  }

  return { ok: false };
}

// ============================================
// HELPERS
// ============================================

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-xs text-gray-400">--</span>;
  const colors: Record<string, string> = {
    informational: "bg-blue-100 text-blue-700",
    commercial: "bg-amber-100 text-amber-700",
    transactional: "bg-emerald-100 text-emerald-700",
    navigational: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${colors[intent] || "bg-gray-100 text-gray-600"}`}>
      {intent.slice(0, 3)}
    </span>
  );
}

function DifficultyBar({ value }: { value: number }) {
  const color = value < 30 ? "bg-emerald-500" : value < 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value, 2)}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{value}</span>
    </div>
  );
}

function PositionBadge({ position }: { position: number }) {
  const color = position <= 3 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : position <= 10 ? "text-blue-700 bg-blue-50 border-blue-200"
    : position <= 20 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-gray-600 bg-gray-50 border-gray-200";
  return (
    <span className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded border text-xs font-bold tabular-nums ${color}`}>
      {position}
    </span>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// ============================================
// COMPONENT
// ============================================

export default function AdminMonitoringRankedKeywords() {
  const { configured, items, totalCount, positionBuckets, totalEtv } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const trackFetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";

  const [sortBy, setSortBy] = useState<"position" | "volume" | "difficulty" | "etv">("position");
  const [filterIntent, setFilterIntent] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [minVolume, setMinVolume] = useState(0);

  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Ranked Keywords</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Ranked Keywords</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">Set up your DataForSEO API credentials to see ranked keywords.</p>
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

  // Filter and sort
  let filtered = items.filter((item) => item.search_volume >= minVolume);
  if (filterIntent !== "all") filtered = filtered.filter((item) => item.intent === filterIntent);
  if (filterPosition !== "all") {
    const [min, max] = filterPosition.split("-").map(Number);
    filtered = filtered.filter((item) => item.position >= min && item.position <= max);
  }
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "position") return a.position - b.position;
    if (sortBy === "volume") return b.search_volume - a.search_volume;
    if (sortBy === "difficulty") return b.keyword_difficulty - a.keyword_difficulty;
    return b.etv - a.etv;
  });

  const top3 = items.filter((i) => i.position <= 3).length;
  const top10 = items.filter((i) => i.position <= 10).length;

  const barColors = ["#059669", "#3b82f6", "#f59e0b", "#9ca3af", "#d1d5db"];

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Ranked Keywords</span>
      </div>

      {/* Title + Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Ranked Keywords</h1>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="refresh" />
          <button
            type="submit"
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </fetcher.Form>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Total Ranked Keywords</p>
          <p className="text-2xl font-bold text-dark tabular-nums">{formatNumber(totalCount)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Top 3 Positions</p>
          <p className="text-2xl font-bold text-emerald-600 tabular-nums">{top3}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Top 10 Positions</p>
          <p className="text-2xl font-bold text-blue-600 tabular-nums">{top10}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Est. Traffic/mo</p>
          <p className="text-2xl font-bold text-dark tabular-nums">{formatNumber(Math.round(totalEtv))}</p>
        </div>
      </div>

      {/* Position Distribution Chart */}
      {positionBuckets.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-dark mb-4">Position Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={positionBuckets} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
              <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
              <Bar dataKey="count" name="Keywords" radius={[4, 4, 0, 0]} barSize={40}>
                {positionBuckets.map((_entry, index) => (
                  <rect key={`bar-${index}`} fill={barColors[index] || "#9ca3af"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Filters Row */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Sort:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="text-xs border border-gray-300 rounded px-2 py-1">
              <option value="position">Position</option>
              <option value="volume">Volume</option>
              <option value="difficulty">Difficulty</option>
              <option value="etv">Traffic</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Position:</label>
            <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
              <option value="all">All</option>
              <option value="1-3">1-3</option>
              <option value="1-10">1-10</option>
              <option value="11-20">11-20</option>
              <option value="21-50">21-50</option>
              <option value="51-100">51-100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Intent:</label>
            <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
              <option value="all">All</option>
              <option value="informational">Informational</option>
              <option value="commercial">Commercial</option>
              <option value="transactional">Transactional</option>
              <option value="navigational">Navigational</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Min vol:</label>
            <input type="number" value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value) || 0)} className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
          </div>
          <span className="text-xs text-gray-400 ml-auto">{sorted.length} keywords</span>
        </div>

        {/* Table */}
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Keyword</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Pos</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">URL</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Vol</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Intent</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Difficulty</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">CPC</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.slice(0, 200).map((item, idx) => {
                  const shortUrl = (() => {
                    try { return new URL(item.url).pathname; } catch { return item.url; }
                  })();
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-sm text-gray-900 font-medium max-w-[200px] truncate">{item.keyword}</td>
                      <td className="px-3 py-2.5 text-center"><PositionBadge position={item.position} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[180px] truncate hidden lg:table-cell" title={item.url}>
                        {shortUrl}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap">{item.search_volume?.toLocaleString() || "--"}</td>
                      <td className="px-3 py-2.5 text-center hidden sm:table-cell"><IntentBadge intent={item.intent} /></td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex justify-center"><DifficultyBar value={item.keyword_difficulty} /></div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{item.cpc ? `$${item.cpc.toFixed(2)}` : "--"}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <trackFetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="track-keyword" />
                          <input type="hidden" name="keyword" value={item.keyword} />
                          <input type="hidden" name="volume" value={item.search_volume} />
                          <input type="hidden" name="competition" value={item.competition} />
                          <input type="hidden" name="cpc" value={item.cpc} />
                          <button type="submit" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">Track</button>
                        </trackFetcher.Form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            {items.length === 0
              ? "No ranked keywords found. Your domain may not have enough organic rankings yet."
              : "No keywords match the current filters."}
          </div>
        )}
      </div>
    </div>
  );
}
