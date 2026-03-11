import { Link, useLoaderData } from "react-router";
import { useState, useRef, useCallback } from "react";
import type { Route } from "./+types/admin-batch-repopulate";
import { requireAuth } from "../lib/auth.server";
import sql from "~/lib/db.server";
import {
  getListingsWithGooglePlaceId,
} from "~/lib/queries.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Batch Enrich | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [totalRes, withGoogleRes, enrichedRes, priceRes, phoneRes, websiteRes, amenityRes] =
    await Promise.all([
      sql`SELECT COUNT(*) as count FROM listings`,
      sql`SELECT COUNT(*) as count FROM listings WHERE google_place_id IS NOT NULL AND google_place_id != ''`,
      sql`SELECT COUNT(*) as count FROM listings WHERE google_maps_uri IS NOT NULL`,
      sql`SELECT COUNT(*) as count FROM listings WHERE price_range IS NULL`,
      sql`SELECT COUNT(*) as count FROM listings WHERE phone IS NULL OR phone = ''`,
      sql`SELECT COUNT(*) as count FROM listings WHERE website IS NULL OR website = ''`,
      sql`SELECT COUNT(DISTINCT listing_id) as count FROM listing_amenities`,
    ]);

  const listings = await getListingsWithGooglePlaceId();

  return {
    stats: {
      total: Number(totalRes[0].count),
      withGoogle: Number(withGoogleRes[0].count),
      enriched: Number(enrichedRes[0].count),
      missingPrice: Number(priceRes[0].count),
      missingPhone: Number(phoneRes[0].count),
      missingWebsite: Number(websiteRes[0].count),
      withAmenities: Number(amenityRes[0].count),
    },
    listings,
  };
}

interface LogEntry {
  name: string;
  status: "success" | "error";
  message: string;
}

export default function AdminBatchRepopulate() {
  const { stats, listings } = useLoaderData<typeof loader>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<{ processed: number; succeeded: number; failed: number; amenities: number; prices: number } | null>(null);
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const filteredListings = typeFilter === "all"
    ? listings
    : listings.filter((l: any) => l.type === typeFilter);

  const listingTypes = [...new Set(listings.map((l: any) => l.type))].sort();

  const addLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const startEnrichment = useCallback(async () => {
    setIsRunning(true);
    setProgress(0);
    setLog([]);
    setSummary(null);
    stopRef.current = false;

    let succeeded = 0;
    let failed = 0;
    let totalAmenities = 0;
    let pricesFilled = 0;

    for (let i = 0; i < filteredListings.length; i++) {
      if (stopRef.current) {
        addLog({ name: "System", status: "error", message: `Stopped at ${i} of ${filteredListings.length}` });
        break;
      }

      const listing = filteredListings[i];
      setProgress(i + 1);

      try {
        const formData = new FormData();
        formData.set("intent", "enrich-one");
        formData.set("listingId", listing.id);
        formData.set("googlePlaceId", listing.google_place_id);

        const res = await fetch("/api/batch-enrich", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();

        if (result.success) {
          succeeded++;
          totalAmenities += result.amenitiesLinked || 0;
          if (result.priceRange) pricesFilled++;
          addLog({
            name: result.name || listing.name,
            status: "success",
            message: result.fieldsUpdated?.length
              ? result.fieldsUpdated.join(", ")
              : "no new data",
          });
        } else {
          failed++;
          addLog({
            name: listing.name,
            status: "error",
            message: result.error || "Unknown error",
          });
        }
      } catch (err: any) {
        failed++;
        addLog({ name: listing.name, status: "error", message: err.message });
      }

      // 300ms delay between API calls
      if (i < filteredListings.length - 1 && !stopRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setSummary({ processed: succeeded + failed, succeeded, failed, amenities: totalAmenities, prices: pricesFilled });
    setIsRunning(false);
  }, [filteredListings, addLog]);

  const needsEnrichment = stats.withGoogle - stats.enriched;

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Batch Enrich</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-dark">Batch Enrich Listings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pull fresh data from Google Places API for all listings. Fills gaps only — never overwrites existing data.
          </p>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Listings" value={stats.total} />
        <StatCard label="With Google ID" value={stats.withGoogle} />
        <StatCard label="Already Enriched" value={stats.enriched} color={stats.enriched > 0 ? "green" : "gray"} />
        <StatCard label="Need Enrichment" value={needsEnrichment} color={needsEnrichment > 0 ? "amber" : "green"} />
        <StatCard label="Missing Price" value={stats.missingPrice} color={stats.missingPrice > 0 ? "red" : "green"} />
        <StatCard label="Missing Phone" value={stats.missingPhone} color={stats.missingPhone > 0 ? "amber" : "green"} />
        <StatCard label="Missing Website" value={stats.missingWebsite} color={stats.missingWebsite > 0 ? "amber" : "green"} />
        <StatCard label="With Amenities" value={stats.withAmenities} color={stats.withAmenities > 10 ? "green" : "red"} />
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-dark">Enrichment Controls</h2>
            <p className="text-sm text-gray-500 mt-1">
              Processes listings one at a time. Skips AI content generation to save costs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
            >
              <option value="all">All Types ({listings.length})</option>
              {listingTypes.map((t: string) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({listings.filter((l: any) => l.type === t).length})
                </option>
              ))}
            </select>
            {!isRunning ? (
              <button
                onClick={startEnrichment}
                disabled={filteredListings.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Enrich ({filteredListings.length})
              </button>
            ) : (
              <button
                onClick={() => { stopRef.current = true; }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {(isRunning || progress > 0) && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{progress} of {filteredListings.length} processed</span>
              <span>{Math.round((progress / filteredListings.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${(progress / filteredListings.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-emerald-800 mb-3">Enrichment Complete</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-emerald-600 font-medium">Processed</span>
              <p className="text-2xl font-bold text-emerald-800">{summary.processed}</p>
            </div>
            <div>
              <span className="text-emerald-600 font-medium">Succeeded</span>
              <p className="text-2xl font-bold text-emerald-800">{summary.succeeded}</p>
            </div>
            <div>
              <span className="text-red-600 font-medium">Failed</span>
              <p className="text-2xl font-bold text-red-800">{summary.failed}</p>
            </div>
            <div>
              <span className="text-emerald-600 font-medium">Amenities Linked</span>
              <p className="text-2xl font-bold text-emerald-800">{summary.amenities}</p>
            </div>
            <div>
              <span className="text-emerald-600 font-medium">Prices Found</span>
              <p className="text-2xl font-bold text-emerald-800">{summary.prices}</p>
            </div>
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Processing Log</h3>
            <span className="text-xs text-gray-500">{log.length} entries</span>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {log.map((entry, i) => (
              <div key={i} className="px-6 py-2 flex items-center gap-3 text-sm">
                {entry.status === "success" ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}
                <span className="font-medium text-gray-900 min-w-[200px]">{entry.name}</span>
                <span className={entry.status === "success" ? "text-gray-500" : "text-red-600"}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "gray" }: { label: string; value: number; color?: string }) {
  const colorClasses: Record<string, string> = {
    gray: "bg-white border-gray-200",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  };
  const valueClasses: Record<string, string> = {
    gray: "text-gray-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClasses[color]}`}>{value}</p>
    </div>
  );
}
