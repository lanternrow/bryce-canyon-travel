import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/admin-monitoring-competitors";
import { requireAuth } from "../lib/auth.server";
import {
  hasDataForSEOCredentials,
  getDataForSEOCredentials,
  getDomainCompetitors,
  getRankedKeywords,
  type CompetitorDomainItem,
} from "../lib/dataforseo.server";
import {
  getCompetitorDomains,
  addCompetitorDomain,
  removeCompetitorDomain,
  updateCompetitorMetrics,
  normalizeCompetitorDomains,
  type CompetitorDomain,
} from "../lib/dataforseo-queries.server";
import { siteConfig } from "../lib/site-config";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Competitors | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const configured = await hasDataForSEOCredentials();
  await normalizeCompetitorDomains();
  const tracked = await getCompetitorDomains();
  const ourDomain = new URL(siteConfig.siteUrl).hostname;
  // Find our own site row (inserted by load-metrics)
  const ownSiteRow = tracked.find((c) => c.domain === ourDomain);
  const competitors = tracked.filter((c) => c.domain !== ourDomain);
  const hasAnyMetrics = tracked.some((c) => c.organic_keywords !== null);
  return {
    configured,
    trackedCompetitors: competitors,
    ownSite: ownSiteRow ?? null,
    ourDomain,
    hasAnyMetrics,
  };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "discover-competitors") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const items = await getDomainCompetitors(domain, creds);
      return { discoveredCompetitors: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO competitors error:", message);
      return { error: `Failed to discover competitors: ${message}` };
    }
  }

  if (intent === "add-competitor") {
    const domain = (formData.get("domain") as string)?.trim().toLowerCase();
    const notes = (formData.get("notes") as string)?.trim() || undefined;
    if (!domain) return { error: "Domain is required" };
    await addCompetitorDomain(domain, notes);
    return { added: domain };
  }

  if (intent === "refresh-metrics") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const tracked = await getCompetitorDomains();
    const ourDomain = new URL(siteConfig.siteUrl).hostname;

    // Ensure our own site is in the table
    await addCompetitorDomain(ourDomain, "__own_site__");

    // Fetch and persist metrics for our domain + each competitor
    const allDomains = [ourDomain, ...tracked.filter((c) => c.domain !== ourDomain).map((c) => c.domain)];
    for (const d of allDomains) {
      try {
        const result = await getRankedKeywords(d, creds);
        const top10 = result.items.filter((i) => i.position <= 10).length;
        // Use API's pre-computed total etv (covers ALL keywords, not just top 1000)
        const organicMetrics = result.metrics?.organic;
        const totalEtv = organicMetrics?.etv ?? result.items.reduce((s, i) => s + i.etv, 0);
        const totalCount = organicMetrics?.count ?? result.totalCount;
        const top10FromMetrics = organicMetrics
          ? (organicMetrics.pos_1 + organicMetrics.pos_2_3 + organicMetrics.pos_4_10)
          : top10;
        await updateCompetitorMetrics(d, {
          organic_keywords: totalCount,
          top10_count: top10FromMetrics,
          estimated_traffic: Math.round(totalEtv),
        });
      } catch {
        // Leave metrics as-is if fetch fails for this domain
      }
    }

    return { refreshed: true };
  }

  if (intent === "remove-competitor") {
    const id = Number(formData.get("id"));
    if (!id) return { error: "Invalid ID" };
    await removeCompetitorDomain(id);
    return { removed: true };
  }

  return { ok: false };
}

// ============================================
// HELPERS
// ============================================

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================
// COMPONENT
// ============================================

export default function AdminMonitoringCompetitors() {
  const { configured, trackedCompetitors, ownSite, ourDomain, hasAnyMetrics } = useLoaderData<typeof loader>();
  const discoverFetcher = useFetcher<{
    discoveredCompetitors?: CompetitorDomainItem[];
    error?: string;
  }>();
  const refreshFetcher = useFetcher<{ refreshed?: boolean; error?: string }>();
  const addFetcher = useFetcher();
  const removeFetcher = useFetcher();
  const isDiscovering = discoverFetcher.state !== "idle";
  const isRefreshing = refreshFetcher.state !== "idle";

  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Competitors</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Competitors</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">Set up your DataForSEO API credentials to analyze competitors.</p>
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

  const discovered = discoverFetcher.data?.discoveredCompetitors;
  const trackedDomains = new Set((trackedCompetitors as CompetitorDomain[]).map((c) => c.domain));

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Competitors</span>
      </div>
      <h1 className="text-3xl font-bold text-dark mb-6">Competitors</h1>

      {/* Discover Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Discover competitors for{" "}
              <span className="text-primary font-semibold">{ourDomain}</span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Finds domains that compete for the same organic keywords.
            </p>
          </div>
          <discoverFetcher.Form method="post">
            <input type="hidden" name="intent" value="discover-competitors" />
            <button
              type="submit"
              disabled={isDiscovering}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${isDiscovering ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isDiscovering ? "Discovering..." : "Discover Competitors"}
            </button>
          </discoverFetcher.Form>
        </div>
      </div>

      {discoverFetcher.data?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          {discoverFetcher.data.error}
        </div>
      )}

      {/* Discovered Competitors Table */}
      {discovered && discovered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-dark">Discovered Competitors</h2>
            <p className="text-xs text-gray-400 mt-0.5">{discovered.length} competing domains found</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Shared Keywords</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Avg Position</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Organic Keywords</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Est. Traffic/mo</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {discovered.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{item.domain}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums">{item.intersections.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden sm:table-cell">{item.avg_position.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden md:table-cell">{formatNumber(item.organic_count)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden md:table-cell">{formatNumber(Math.round(item.etv))}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {trackedDomains.has(item.domain) ? (
                        <span className="text-xs text-emerald-600 font-medium">Tracked</span>
                      ) : (
                        <addFetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="add-competitor" />
                          <input type="hidden" name="domain" value={item.domain} />
                          <button type="submit" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                            Track
                          </button>
                        </addFetcher.Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tracked Competitors */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-dark">Tracked Competitors</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Domains you're monitoring as competitors
              {ownSite?.metrics_updated_at && (
                <span className="ml-2 text-gray-300">
                  &middot; Last refreshed {timeAgo(ownSite.metrics_updated_at)}
                </span>
              )}
            </p>
          </div>
          <refreshFetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-metrics" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Refreshing..." : hasAnyMetrics ? "Refresh Metrics" : "Load Metrics"}
            </button>
          </refreshFetcher.Form>
        </div>

        {/* Add Manual Competitor */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50">
          <addFetcher.Form method="post" className="flex items-center gap-3">
            <input type="hidden" name="intent" value="add-competitor" />
            <input
              type="text"
              name="domain"
              placeholder="competitor.com"
              className="flex-1 max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              name="notes"
              placeholder="Notes (optional)"
              className="flex-1 max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary hidden sm:block"
            />
            <button type="submit" className="px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
              Add
            </button>
          </addFetcher.Form>
        </div>

        {refreshFetcher.data?.error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
            {refreshFetcher.data.error}
          </div>
        )}

        {(trackedCompetitors as CompetitorDomain[]).length > 0 || ownSite ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Organic Keywords</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden md:table-cell">Top 10</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">Est. Traffic/mo</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Your site row */}
                {ownSite && (
                  <tr className="bg-primary/5">
                    <td className="px-6 py-3 text-sm font-semibold text-primary">
                      {ownSite.domain}
                      <span className="ml-1.5 text-xs font-normal text-gray-400">(your site)</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">--</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right tabular-nums hidden md:table-cell">
                      {ownSite.organic_keywords != null ? formatNumber(ownSite.organic_keywords) : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right tabular-nums hidden md:table-cell">
                      {ownSite.top10_count != null ? formatNumber(ownSite.top10_count) : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right tabular-nums hidden lg:table-cell">
                      {ownSite.estimated_traffic != null ? formatNumber(ownSite.estimated_traffic) : "--"}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">--</td>
                  </tr>
                )}
                {/* Competitor rows */}
                {(trackedCompetitors as CompetitorDomain[]).map((comp) => (
                  <tr key={comp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{comp.domain}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{comp.notes || "--"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden md:table-cell">
                      {comp.organic_keywords != null ? formatNumber(comp.organic_keywords) : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden md:table-cell">
                      {comp.top10_count != null ? formatNumber(comp.top10_count) : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums hidden lg:table-cell">
                      {comp.estimated_traffic != null ? formatNumber(comp.estimated_traffic) : "--"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <removeFetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="remove-competitor" />
                        <input type="hidden" name="id" value={comp.id} />
                        <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors">
                          Remove
                        </button>
                      </removeFetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No competitors tracked yet. Discover competitors above or add one manually.
          </div>
        )}
      </div>
    </div>
  );
}
