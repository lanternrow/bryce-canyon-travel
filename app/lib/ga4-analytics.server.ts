// Google Analytics 4 — Data API (v1beta)
// Fetches traffic data: sessions, users, pageviews, sources, top pages

import { getGoogleAccessToken } from "./google-auth.server";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

// ============================================
// TYPES
// ============================================

export interface GA4ReportRow {
  dimensionValues: string[];
  metricValues: number[];
}

export interface GA4ReportResult {
  success: boolean;
  rows?: GA4ReportRow[];
  totals?: number[];
  error?: string;
  cachedAt?: number;
}

// ============================================
// CACHE (in-memory, 1-hour TTL)
// ============================================

const ga4Cache = new Map<
  string,
  { data: GA4ReportResult; expiresAt: number }
>();
const GA4_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function clearGA4Cache(): void {
  ga4Cache.clear();
}

// ============================================
// GA4 DATA API
// ============================================

/**
 * Run a GA4 Data API report.
 *
 * Prerequisites:
 * - `ga4_property_id` setting must be configured (numeric property ID)
 * - Service account email must be added as a Viewer in GA4 property
 */
export async function runGA4Report(
  propertyId: string,
  options: {
    startDate: string; // YYYY-MM-DD or relative: "7daysAgo", "28daysAgo"
    endDate: string; // YYYY-MM-DD or "yesterday", "today"
    dimensions: string[]; // e.g., ["date"], ["sessionSource"], ["pagePath"]
    metrics: string[]; // e.g., ["sessions", "activeUsers", "screenPageViews"]
    orderBy?: { metric: string; desc: boolean };
    limit?: number;
    dimensionFilter?: Record<string, unknown>;
  },
  forceRefresh = false
): Promise<GA4ReportResult> {
  const orderByKey = options.orderBy
    ? `${options.orderBy.metric}:${options.orderBy.desc ? "desc" : "asc"}`
    : "";
  const dimensionFilterKey = options.dimensionFilter
    ? JSON.stringify(options.dimensionFilter)
    : "";
  const cacheKey = [
    propertyId,
    options.startDate,
    options.endDate,
    options.dimensions.join(","),
    options.metrics.join(","),
    String(options.limit || ""),
    orderByKey,
    dimensionFilterKey,
  ].join("|");

  if (!forceRefresh) {
    const cached = ga4Cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const token = await getGoogleAccessToken(GA4_SCOPE);
  if (!token) {
    return { success: false, error: "No Google credentials configured" };
  }

  try {
    const body: any = {
      dateRanges: [
        { startDate: options.startDate, endDate: options.endDate },
      ],
      dimensions: options.dimensions.map((d) => ({ name: d })),
      metrics: options.metrics.map((m) => ({ name: m })),
      limit: options.limit || 25,
    };
    if (options.dimensionFilter) {
      body.dimensionFilter = options.dimensionFilter;
    }

    if (options.orderBy) {
      body.orderBys = [
        {
          metric: { metricName: options.orderBy.metric },
          desc: options.orderBy.desc,
        },
      ];
    }

    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      const stale = ga4Cache.get(cacheKey);
      if (stale) return stale.data;
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json();

    const rows: GA4ReportRow[] = (data.rows || []).map((r: any) => ({
      dimensionValues: (r.dimensionValues || []).map((d: any) => d.value),
      metricValues: (r.metricValues || []).map((m: any) =>
        parseFloat(m.value) || 0
      ),
    }));

    const totals =
      data.totals?.[0]?.metricValues?.map(
        (m: any) => parseFloat(m.value) || 0
      ) || [];

    const result: GA4ReportResult = {
      success: true,
      rows,
      totals,
      cachedAt: Date.now(),
    };

    ga4Cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + GA4_CACHE_TTL,
    });
    return result;
  } catch (error) {
    const stale = ga4Cache.get(cacheKey);
    if (stale) return stale.data;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
