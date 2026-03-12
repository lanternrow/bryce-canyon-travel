import { Link, useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-monitoring-ranks";
import { requireAuth } from "../lib/auth.server";
import { hasDataForSEOCredentials } from "../lib/dataforseo.server";
import {
  getTrackedKeywords,
  addTrackedKeyword,
  removeTrackedKeyword,
  saveRankCheck,
  getRankHistory,
  updateKeywordVolume,
  type TrackedKeyword,
  type RankHistoryPoint,
} from "../lib/dataforseo-queries.server";
import {
  checkSerpRankings,
  getSearchVolume,
  getDataForSEOCredentials,
} from "../lib/dataforseo.server";
import { siteConfig } from "../lib/site-config";
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
  return [{ title: `Rank Tracker | Monitoring | Admin | ${siteConfig.siteName}` }];
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
      keywords: [] as TrackedKeyword[],
      historyData: [] as Array<{ date: string; [keyword: string]: string | number | null }>,
    };
  }

  const keywords = await getTrackedKeywords();

  // Build chart data: last 30 days of all keyword rank histories
  const allHistory = await Promise.all(
    keywords.slice(0, 10).map(async (kw) => ({
      keyword: kw.keyword,
      history: await getRankHistory(kw.id, 30),
    }))
  );

  // Group by date for chart
  const dateMap = new Map<string, Record<string, number | null>>();
  for (const { keyword, history } of allHistory) {
    for (const point of history) {
      const date = new Date(point.checked_at).toISOString().slice(0, 10);
      if (!dateMap.has(date)) dateMap.set(date, {});
      dateMap.get(date)![keyword] = point.rank_group;
    }
  }

  const historyData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ranks]) => ({ date: formatDateLabel(date), ...ranks }));

  return { configured: true as const, keywords, historyData };
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add-keyword") {
    const keyword = (formData.get("keyword") as string)?.trim().toLowerCase();
    if (!keyword) return { error: "Keyword is required" };
    const creds = await getDataForSEOCredentials();
    let volumeData: { search_volume?: number; competition?: number; competition_level?: string; cpc?: number } = {};
    if (creds) {
      try {
        const volumes = await getSearchVolume([keyword], creds);
        const v = volumes[0];
        if (v) {
          volumeData = {
            search_volume: v.search_volume,
            competition: v.competition,
            competition_level: v.competition_level,
            cpc: v.cpc,
          };
        }
      } catch { /* volume lookup is optional */ }
    }
    await addTrackedKeyword(keyword, volumeData);
    return { ok: true };
  }

  if (intent === "remove-keyword") {
    const id = Number(formData.get("id"));
    if (id) await removeTrackedKeyword(id);
    return { ok: true };
  }

  if (intent === "check-ranks") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const keywords = await getTrackedKeywords();
    if (keywords.length === 0) return { error: "No keywords to check" };

    const domain = new URL(siteConfig.siteUrl).hostname;
    const keywordTexts = keywords.map((kw) => kw.keyword);

    try {
      const rankings = await checkSerpRankings(keywordTexts, domain, creds);

      // Save results
      for (const kw of keywords) {
        const result = rankings.get(kw.keyword);
        await saveRankCheck(kw.id, {
          rank_group: result?.rank?.rank_group ?? null,
          rank_absolute: result?.rank?.rank_absolute ?? null,
          url: result?.rank?.url ?? null,
          title: result?.rank?.title ?? null,
          snippet: result?.rank?.description ?? null,
          is_featured_snippet: result?.rank?.is_featured_snippet ?? false,
        });
      }

      // Update volume data for all keywords
      try {
        const volumes = await getSearchVolume(keywordTexts, creds);
        for (const v of volumes) {
          const kw = keywords.find((k) => k.keyword === v.keyword);
          if (kw) {
            await updateKeywordVolume(kw.id, {
              search_volume: v.search_volume,
              competition: v.competition,
              competition_level: v.competition_level,
              cpc: v.cpc,
            });
          }
        }
      } catch { /* volume update is optional */ }

      return { ok: true, checked: keywords.length };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO rank check error:", message);
      return { error: `Failed to check rankings: ${message}` };
    }
  }

  return { ok: false };
}

// ============================================
// COMPONENT
// ============================================

const CHART_COLORS = [
  "#c1440e", "#6ba3c7", "#7a8b6f", "#d4a574", "#8b7d6b",
  "#e07b4f", "#4a90d9", "#5c7a52", "#c49a6c", "#6b5f53",
];

export default function AdminMonitoringRanks() {
  const { configured, keywords, historyData } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const addFetcher = useFetcher();
  const [newKeyword, setNewKeyword] = useState("");

  const isChecking = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "check-ranks";
  const isAdding = addFetcher.state !== "idle";

  // Not configured
  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Rank Tracker</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Rank Tracker</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">
              Set up your DataForSEO API credentials to start tracking keyword rankings.
            </p>
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

  const uniqueKeywords = [...new Set(keywords.map((kw) => kw.keyword))].slice(0, 10);

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Rank Tracker</span>
      </div>

      {/* Title + Actions */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Rank Tracker</h1>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="check-ranks" />
          <button
            type="submit"
            disabled={isChecking || keywords.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isChecking ? "Checking..." : "Check All Rankings"}
          </button>
        </fetcher.Form>
      </div>

      {/* Add keyword */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <addFetcher.Form
          method="post"
          onSubmit={() => setNewKeyword("")}
          className="flex gap-3"
        >
          <input type="hidden" name="intent" value="add-keyword" />
          <input
            type="text"
            name="keyword"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Enter keyword to track (e.g., bryce canyon national park lodging)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm"
          />
          <button
            type="submit"
            disabled={isAdding || !newKeyword.trim()}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isAdding ? "Adding..." : "Track"}
          </button>
        </addFetcher.Form>
      </div>

      {/* Keywords table */}
      {keywords.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Keyword</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Position</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Change</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">URL</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Volume</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Last Checked</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keywords.map((kw) => {
                const change = kw.previous_rank && kw.latest_rank
                  ? kw.previous_rank - kw.latest_rank
                  : null;

                return (
                  <tr key={kw.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{kw.keyword}</td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {kw.latest_rank ? (
                        <span className={`font-semibold ${kw.latest_rank <= 3 ? "text-emerald-600" : kw.latest_rank <= 10 ? "text-blue-600" : kw.latest_rank <= 20 ? "text-amber-600" : "text-gray-600"}`}>
                          {kw.latest_rank}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {change !== null && change !== 0 ? (
                        <span className={`inline-flex items-center gap-0.5 ${change > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          <svg className={`w-3 h-3 ${change > 0 ? "" : "rotate-180"}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          {Math.abs(change)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate hidden lg:table-cell">
                      {kw.latest_url || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">
                      {kw.search_volume?.toLocaleString() || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 text-right hidden md:table-cell">
                      {kw.latest_checked_at
                        ? new Date(kw.latest_checked_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="remove-keyword" />
                        <input type="hidden" name="id" value={kw.id} />
                        <button
                          type="submit"
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove keyword"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400 text-sm mb-8">
          No keywords tracked yet. Add a keyword above to start monitoring your rankings.
        </div>
      )}

      {/* Rank History Chart */}
      {historyData.length > 0 && uniqueKeywords.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-dark mb-4">Rank History (30 days)</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={historyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                reversed
                domain={[1, "auto"]}
                tick={{ fontSize: 12, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={40}
                label={{ value: "Position", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#9ca3af" } }}
              />
              <Tooltip
                contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }}
                formatter={(value: number | undefined) => [value ? `#${value}` : "Not ranking", ""]}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              {uniqueKeywords.map((kw, i) => (
                <Line
                  key={kw}
                  type="monotone"
                  dataKey={kw}
                  name={kw}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
