import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/admin-monitoring-audit";
import { requireAuth } from "../lib/auth.server";
import { getSettings, updateSetting } from "../lib/queries.server";
import {
  hasDataForSEOCredentials,
  getDataForSEOCredentials,
  submitSiteAudit,
  getSiteAuditSummary,
  getSiteAuditPages,
  type AuditSummary,
  type AuditPage,
} from "../lib/dataforseo.server";
import { siteConfig } from "../lib/site-config";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Site Audit | Monitoring | Admin | ${siteConfig.siteName}` }];
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
      taskId: null as string | null,
      summary: null as AuditSummary | null,
      pages: [] as AuditPage[],
    };
  }

  const settings = await getSettings();
  const taskId = settings.dataforseo_audit_task_id || null;

  let summary: AuditSummary | null = null;
  let pages: AuditPage[] = [];

  if (taskId) {
    const creds = await getDataForSEOCredentials();
    if (creds) {
      try {
        summary = await getSiteAuditSummary(taskId, creds);
        if (summary?.crawl_progress === "finished") {
          pages = await getSiteAuditPages(taskId, 100, creds);
        }
      } catch { /* task may have expired */ }
    }
  }

  return { configured: true as const, taskId, summary, pages };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "start-audit") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const taskId = await submitSiteAudit(domain, creds);
      await updateSetting("dataforseo_audit_task_id", taskId);
      return { ok: true, taskId };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO audit error:", message);
      return { error: `Failed to start audit: ${message}` };
    }
  }

  if (intent === "refresh-results") {
    // Just reload to re-fetch from API
    return { ok: true };
  }

  return { ok: false };
}

// ============================================
// COMPONENT
// ============================================

function formatSeconds(ms: number): string {
  if (!ms) return "—";
  const s = ms / 1000;
  return s < 1 ? `${Math.round(ms)}ms` : `${s.toFixed(1)}s`;
}

function IssueRow({ label, count, severity }: { label: string; count: number; severity: "critical" | "warning" | "notice" }) {
  if (count === 0) return null;
  const colors = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    notice: "bg-blue-100 text-blue-700",
  };
  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full ${colors[severity]}`}>
          {count}
        </span>
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className={`text-xs font-medium uppercase ${severity === "critical" ? "text-red-500" : severity === "warning" ? "text-amber-500" : "text-blue-500"}`}>
        {severity}
      </span>
    </div>
  );
}

export default function AdminMonitoringAudit() {
  const { configured, taskId, summary, pages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isStarting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "start-audit";
  const isRefreshing = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "refresh-results";

  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Site Audit</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Site Audit</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">Set up your DataForSEO API credentials to run site audits.</p>
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

  const isFinished = summary?.crawl_progress === "finished";
  const isCrawling = summary?.crawl_progress === "in_progress";
  const metrics = summary?.page_metrics;

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Site Audit</span>
      </div>

      {/* Title + Actions */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Site Audit</h1>
        <div className="flex items-center gap-2">
          {taskId && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="refresh-results" />
              <button
                type="submit"
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50 transition-colors"
              >
                <svg className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? "Refreshing..." : "Refresh Results"}
              </button>
            </fetcher.Form>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="start-audit" />
            <button
              type="submit"
              disabled={isStarting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isStarting ? "Starting..." : "Start New Audit"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {/* Status banner */}
      {!taskId && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm mb-8">
          No audit has been run yet. Click "Start New Audit" to crawl your site.
        </div>
      )}

      {isCrawling && summary?.crawl_status && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <div className="flex items-center gap-2 text-amber-700">
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm font-medium">
              Crawling in progress... {summary.crawl_status.pages_crawled} of {summary.crawl_status.max_crawl_pages} pages crawled.
            </span>
          </div>
          <p className="text-xs text-amber-600 mt-1">Click "Refresh Results" to check progress.</p>
        </div>
      )}

      {/* Summary Cards */}
      {isFinished && metrics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Pages Crawled</p>
              <p className="text-2xl font-bold text-dark tabular-nums">{summary.crawl_status.pages_crawled}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">On-Page Score</p>
              <p className={`text-2xl font-bold tabular-nums ${metrics.onpage_score >= 80 ? "text-emerald-600" : metrics.onpage_score >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {metrics.onpage_score.toFixed(1)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Internal Links</p>
              <p className="text-2xl font-bold text-dark tabular-nums">{metrics.links_internal.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">External Links</p>
              <p className="text-2xl font-bold text-dark tabular-nums">{metrics.links_external.toLocaleString()}</p>
            </div>
          </div>

          {/* Issues Summary */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-dark">Issues Found</h2>
            </div>
            <div>
              <IssueRow label="Broken links" count={metrics.broken_links} severity="critical" />
              <IssueRow label="Broken resources" count={metrics.broken_resources} severity="critical" />
              <IssueRow label="Duplicate titles" count={metrics.duplicate_title} severity="warning" />
              <IssueRow label="Duplicate descriptions" count={metrics.duplicate_description} severity="warning" />
              <IssueRow label="Duplicate content" count={metrics.duplicate_content} severity="warning" />
              <IssueRow label="Redirect chains" count={metrics.redirect_chains} severity="warning" />
              <IssueRow label="Non-HTTPS pages" count={metrics.is_http} severity="notice" />
              {metrics.broken_links === 0 && metrics.broken_resources === 0 && metrics.duplicate_title === 0 && metrics.duplicate_description === 0 && metrics.duplicate_content === 0 && metrics.redirect_chains === 0 && metrics.is_http === 0 && (
                <div className="py-6 text-center text-emerald-600 text-sm font-medium">
                  No issues found — your site looks great!
                </div>
              )}
            </div>
          </div>

          {/* Pages Table */}
          {pages.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-dark">Pages (sorted by score, lowest first)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">URL</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Load Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Title</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pages.slice(0, 50).map((page, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-primary max-w-[250px] truncate font-mono">
                          {page.url.replace(/^https?:\/\/[^/]+/, "")}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                          <span className={`font-medium ${page.status_code === 200 ? "text-emerald-600" : page.status_code >= 400 ? "text-red-600" : "text-amber-600"}`}>
                            {page.status_code}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                          <span className={`font-medium ${page.onpage_score >= 80 ? "text-emerald-600" : page.onpage_score >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            {page.onpage_score?.toFixed(0) || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-right hidden md:table-cell tabular-nums">
                          {formatSeconds(page.page_timing?.duration_time || 0)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate hidden lg:table-cell">
                          {page.meta?.title || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
