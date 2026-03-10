import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/admin-monitoring-speed";
import { requireAuth } from "../lib/auth.server";
import { getSettings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";
import {
  getPageSpeedScore,
  clearPageSpeedCache,
} from "../lib/pagespeed.server";

// ============================================
// CLIENT-SAFE TYPES & HELPERS
// (duplicated from pagespeed.server to avoid .server import in client code)
// ============================================

type VitalRating = "good" | "needs-improvement" | "poor";

interface CoreWebVitals {
  lcp: number;
  cls: number;
  inp: number;
}

interface SpeedResult {
  success: boolean;
  strategy: "mobile" | "desktop";
  performanceScore?: number;
  webVitals?: CoreWebVitals;
  error?: string;
  cachedAt?: number;
}

function rateLCP(seconds: number): VitalRating {
  if (seconds < 2.5) return "good";
  if (seconds < 4.0) return "needs-improvement";
  return "poor";
}

function rateCLS(score: number): VitalRating {
  if (score < 0.1) return "good";
  if (score < 0.25) return "needs-improvement";
  return "poor";
}

function rateINP(ms: number): VitalRating {
  if (ms < 200) return "good";
  if (ms < 500) return "needs-improvement";
  return "poor";
}

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Site Speed | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const settings = await getSettings();
  const apiKey = (settings as Record<string, string>).google_places_api_key;
  const siteUrl =
    (settings as Record<string, string>).gsc_site_url ||
    siteConfig.siteUrl;

  if (!apiKey) {
    return { configured: false, mobile: null, desktop: null };
  }

  const [mobile, desktop] = await Promise.all([
    getPageSpeedScore(siteUrl, "mobile"),
    getPageSpeedScore(siteUrl, "desktop"),
  ]);

  return { configured: true, mobile, desktop };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "refresh-speed") {
    clearPageSpeedCache();
    return { ok: true };
  }

  return { ok: false };
}

// ============================================
// COMPONENTS
// ============================================

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color =
    score >= 90 ? "#16a34a" : score >= 50 ? "#f59e0b" : "#dc2626";

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {/* Background circle */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        {/* Progress arc */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          transform="rotate(-90 80 80)"
        />
        {/* Score text */}
        <text
          x="80"
          y="80"
          textAnchor="middle"
          dominantBaseline="central"
          className="text-3xl font-bold"
          fill={color}
        >
          {score}
        </text>
      </svg>
      <span className="text-sm font-medium text-gray-600 mt-1">{label}</span>
    </div>
  );
}

function RatingDot({ rating }: { rating: VitalRating }) {
  const colors: Record<VitalRating, string> = {
    good: "bg-green-500",
    "needs-improvement": "bg-amber-500",
    poor: "bg-red-500",
  };
  const labels: Record<VitalRating, string> = {
    good: "Good",
    "needs-improvement": "Needs Improvement",
    poor: "Poor",
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${colors[rating]}`} />
      <span className="text-xs text-gray-500">{labels[rating]}</span>
    </span>
  );
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

function SpeedCard({ result }: { result: SpeedResult }) {
  const label = result.strategy === "mobile" ? "Mobile" : "Desktop";

  if (!result.success) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-dark mb-3">{label}</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            Failed to load {label.toLowerCase()} results.
          </p>
          {result.error && (
            <p className="text-xs text-red-500 mt-1">{result.error}</p>
          )}
        </div>
      </div>
    );
  }

  const score = result.performanceScore ?? 0;
  const vitals = result.webVitals;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Gauge */}
      <div className="flex justify-center mb-6">
        <ScoreGauge score={score} label={label} />
      </div>

      {/* Core Web Vitals */}
      {vitals && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Core Web Vitals
          </h4>
          <div className="space-y-3">
            {/* LCP */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">LCP</p>
                <p className="text-xs text-gray-400">
                  Largest Contentful Paint
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {vitals.lcp.toFixed(1)}s
                </span>
                <RatingDot rating={rateLCP(vitals.lcp)} />
              </div>
            </div>

            {/* CLS */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">CLS</p>
                <p className="text-xs text-gray-400">
                  Cumulative Layout Shift
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {vitals.cls.toFixed(3)}
                </span>
                <RatingDot rating={rateCLS(vitals.cls)} />
              </div>
            </div>

            {/* INP */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">INP</p>
                <p className="text-xs text-gray-400">
                  Interaction to Next Paint
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {Math.round(vitals.inp)}ms
                </span>
                <RatingDot rating={rateINP(vitals.inp)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cached timestamp */}
      {result.cachedAt && (
        <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
          Checked {timeAgoShort(result.cachedAt)}
        </p>
      )}
    </div>
  );
}

// ============================================
// PAGE
// ============================================

export default function AdminMonitoringSpeed() {
  const { configured, mobile, desktop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isRefreshing = fetcher.state !== "idle";

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <span>Monitoring</span>
        <span>/</span>
        <span className="text-gray-900 font-medium">Site Speed</span>
      </nav>

      {/* Title + Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Site Speed</h1>
        {configured && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="refresh-speed" />
            <button
              type="submit"
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
        )}
      </div>

      {/* Not configured */}
      {!configured && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-md mx-auto">
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Google API key is not configured.
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            A Google API key is required to fetch PageSpeed Insights data.
          </p>
          <Link
            to="/admin/settings?tab=api"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Go to Settings &rarr; API
          </Link>
        </div>
      )}

      {/* Speed cards */}
      {configured && mobile && desktop && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SpeedCard result={mobile as SpeedResult} />
            <SpeedCard result={desktop as SpeedResult} />
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            PageSpeed results are cached for 6 hours.
          </p>
        </>
      )}
    </div>
  );
}
