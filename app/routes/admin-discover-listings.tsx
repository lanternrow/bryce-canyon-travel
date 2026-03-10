import { Link, useLoaderData } from "react-router";
import { useState, useRef, useCallback, useMemo } from "react";
import type { Route } from "./+types/admin-discover-listings";
import { requireAuth } from "../lib/auth.server";
import sql from "~/lib/db.server";
import {
  DISCOVERY_TOWNS,
  DISCOVERY_QUERIES,
  type DiscoveredPlace,
} from "~/lib/google-places.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Discover Listings | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [totalRes, byTypeRes, placeIdCount] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM listings`,
    sql`SELECT type, COUNT(*) as count FROM listings GROUP BY type ORDER BY type`,
    sql`SELECT COUNT(*) as count FROM listings WHERE google_place_id IS NOT NULL AND google_place_id != ''`,
  ]);

  return {
    stats: {
      total: Number(totalRes[0].count),
      byType: (byTypeRes as any[]).reduce((acc: Record<string, number>, r: any) => {
        acc[r.type] = Number(r.count);
        return acc;
      }, {}),
      withGoogleId: Number(placeIdCount[0].count),
    },
    towns: DISCOVERY_TOWNS,
    queries: DISCOVERY_QUERIES,
  };
}

// Actions moved to /api/discover-scan and /api/discover-import

// ============================================
// Sort types
// ============================================
type SortField = "name" | "town" | "type" | "category" | "rating" | "reviewCount";
type SortDir = "asc" | "desc";

// ============================================
// Client Component
// ============================================

interface ScanProgress {
  phase: "idle" | "scanning" | "done";
  currentQuery: string;
  queriesCompleted: number;
  totalQueries: number;
  found: number;
  uniqueTotal: number;
  alreadyInDb: number;
}

export default function AdminDiscoverListings() {
  const { stats, towns, queries } = useLoaderData<typeof loader>();
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    phase: "idle", currentQuery: "", queriesCompleted: 0, totalQueries: 0, found: 0, uniqueTotal: 0, alreadyInDb: 0,
  });
  const [discovered, setDiscovered] = useState<DiscoveredPlace[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importLog, setImportLog] = useState<Array<{ name: string; status: "success" | "error"; message: string }>>([]);
  const [filter, setFilter] = useState<"all" | "include" | "review" | "exclude">("include");
  const [queryTypeFilter, setQueryTypeFilter] = useState<string>("all");
  const [townFilter, setTownFilter] = useState<string>("all");
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [resultTypeFilter, setResultTypeFilter] = useState<string>("all");
  const stopRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const filteredQueries = queryTypeFilter === "all"
    ? queries
    : queries.filter((q: any) => q.suggestedType === queryTypeFilter);

  const filteredTowns = townFilter === "all"
    ? towns
    : towns.filter((t: any) => t.name === townFilter);

  const queryTypes = [...new Set(queries.map((q: any) => q.suggestedType))].sort();

  const startScan = useCallback(async () => {
    stopRef.current = false;
    setDiscovered([]);
    setSelected(new Set());
    setImportLog([]);
    setDebugMessages([]);

    const totalQueries = filteredTowns.length * filteredQueries.length;
    setScanProgress({ phase: "scanning", currentQuery: "", queriesCompleted: 0, totalQueries, found: 0, uniqueTotal: 0, alreadyInDb: 0 });

    const allPlaces: DiscoveredPlace[] = [];
    const seenNewIds = new Set<string>();
    const seenExistingIds = new Set<string>();
    let queriesCompleted = 0;

    for (const town of filteredTowns) {
      for (const q of filteredQueries) {
        if (stopRef.current) break;

        const textQuery = q.template.replace("{town}", town.name).replace("{state}", siteConfig.stateFull);
        setScanProgress((prev) => ({ ...prev, currentQuery: textQuery }));

        let pageToken: string | undefined;
        let pages = 0;

        // Paginate up to 3 pages per query
        do {
          if (stopRef.current) break;

          const fd = new FormData();
          fd.set("intent", "scan");
          fd.set("textQuery", textQuery);
          fd.set("lat", String(town.lat));
          fd.set("lng", String(town.lng));
          fd.set("radius", String(town.radius));
          fd.set("town", town.name);
          if ("includedType" in q && (q as any).includedType) fd.set("includedType", (q as any).includedType);
          if (pageToken) fd.set("pageToken", pageToken);

          try {
            const res = await fetch("/api/discover-scan", { method: "POST", body: fd });
            const data = await res.json();

            // Deduplicate new places
            if (data.places?.length) {
              for (const p of data.places) {
                if (!seenNewIds.has(p.placeId)) {
                  seenNewIds.add(p.placeId);
                  allPlaces.push(p);
                }
              }
              setDiscovered([...allPlaces]);
            }
            // Deduplicate existing place IDs
            if (data.existingPlaceIds?.length) {
              for (const id of data.existingPlaceIds) {
                seenExistingIds.add(id);
              }
            }
            setScanProgress((prev) => ({
              ...prev,
              found: seenNewIds.size,
              alreadyInDb: seenExistingIds.size,
              uniqueTotal: seenNewIds.size + seenExistingIds.size,
            }));
            if (data.debug != null) {
              setDebugMessages((prev) => [...prev, `${textQuery}: ${data.debug}`]);
            }

            pageToken = data.nextPageToken || undefined;
          } catch {
            pageToken = undefined;
          }

          pages++;
          // Small delay between pages
          await new Promise((r) => setTimeout(r, 250));
        } while (pageToken && pages < 3 && !stopRef.current);

        queriesCompleted++;
        setScanProgress((prev) => ({ ...prev, queriesCompleted }));

        // Delay between queries
        await new Promise((r) => setTimeout(r, 300));
      }
      if (stopRef.current) break;
    }

    setScanProgress((prev) => ({ ...prev, phase: "done" }));
  }, [filteredTowns, filteredQueries]);

  const toggleSelect = (placeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const selectAllRelevant = () => {
    const ids = discovered.filter((p) => p.relevance === "include" && p.suggestedListingType).map((p) => p.placeId);
    setSelected(new Set(ids));
  };

  const importSelected = useCallback(async () => {
    const toImport = discovered.filter((p) => selected.has(p.placeId) && p.suggestedListingType);
    if (toImport.length === 0) return;

    setImporting(true);
    setImportProgress({ done: 0, total: toImport.length });
    setImportLog([]);
    stopRef.current = false;

    for (let i = 0; i < toImport.length; i++) {
      if (stopRef.current) break;

      const p = toImport[i];
      setImportProgress({ done: i + 1, total: toImport.length });

      try {
        const fd = new FormData();
        fd.set("intent", "import-one");
        fd.set("placeId", p.placeId);
        fd.set("listingType", p.suggestedListingType!);
        if (p.suggestedCategorySlug) fd.set("categorySlug", p.suggestedCategorySlug);

        const res = await fetch("/api/discover-import", { method: "POST", body: fd });
        const result = await res.json();

        if (result.success) {
          setImportLog((prev) => [...prev, {
            name: result.name || p.name,
            status: "success",
            message: `Imported${result.amenitiesLinked ? ` + ${result.amenitiesLinked} amenities` : ""}`,
          }]);
        } else {
          setImportLog((prev) => [...prev, {
            name: p.name,
            status: "error",
            message: result.error || "Failed",
          }]);
        }
      } catch (err: any) {
        setImportLog((prev) => [...prev, { name: p.name, status: "error", message: err.message }]);
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    setImporting(false);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [discovered, selected]);

  // Relevance filter
  const relevanceFiltered = discovered.filter((p) => filter === "all" || p.relevance === filter);

  // Type filter on results
  const typeFiltered = resultTypeFilter === "all"
    ? relevanceFiltered
    : relevanceFiltered.filter((p) => (p.suggestedListingType || "unknown") === resultTypeFilter);

  // Sort
  const sortedResults = useMemo(() => {
    const arr = [...typeFiltered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "town":
          cmp = (a.town || "").localeCompare(b.town || "");
          break;
        case "type":
          cmp = (a.suggestedListingType || "zzz").localeCompare(b.suggestedListingType || "zzz");
          break;
        case "category":
          cmp = (a.suggestedCategorySlug || "zzz").localeCompare(b.suggestedCategorySlug || "zzz");
          break;
        case "rating":
          cmp = (a.rating || 0) - (b.rating || 0);
          break;
        case "reviewCount":
          cmp = (a.reviewCount || 0) - (b.reviewCount || 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [typeFiltered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "rating" || field === "reviewCount" ? "desc" : "asc");
    }
  };

  const includedCount = discovered.filter((p) => p.relevance === "include").length;
  const excludedCount = discovered.filter((p) => p.relevance === "exclude").length;
  const reviewCount = discovered.filter((p) => p.relevance === "review").length;

  // Unique types found in results for the type filter dropdown
  const resultTypes = useMemo(() => {
    const types = new Set<string>();
    relevanceFiltered.forEach((p) => types.add(p.suggestedListingType || "unknown"));
    return [...types].sort();
  }, [relevanceFiltered]);

  // Type counts for the filter dropdown
  const resultTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    relevanceFiltered.forEach((p) => {
      const t = p.suggestedListingType || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [relevanceFiltered]);

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Discover Listings</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-dark">Discover New Listings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scan Google Places to find tourism businesses not yet in your directory.
          </p>
        </div>
      </div>

      {/* Current inventory stats */}
      <div className="grid grid-cols-2 md:grid-cols-9 gap-3 mb-8">
        <StatCard label="Total Listings" value={stats.total} />
        <StatCard label="Dining" value={stats.byType.dining || 0} />
        <StatCard label="Lodging" value={stats.byType.lodging || 0} />
        <StatCard label="Experiences" value={stats.byType.experiences || 0} />
        <StatCard label="Transportation" value={stats.byType.transportation || 0} />
        <StatCard label="Hiking" value={stats.byType.hiking || 0} />
        <StatCard label="Parks" value={stats.byType.parks || 0} />
        <StatCard label="Golf" value={stats.byType.golf || 0} />
        <StatCard label="With Google ID" value={stats.withGoogleId} />
      </div>

      {/* Scan controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-dark">Discovery Scan</h2>
            <p className="text-sm text-gray-500 mt-1">
              Searches {filteredTowns.length} town{filteredTowns.length !== 1 ? "s" : ""} &times; {filteredQueries.length} quer{filteredQueries.length !== 1 ? "ies" : "y"} = {filteredTowns.length * filteredQueries.length} searches.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={townFilter}
              onChange={(e) => setTownFilter(e.target.value)}
              disabled={scanProgress.phase === "scanning" || importing}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
            >
              <option value="all">All Towns ({towns.length})</option>
              {[...towns].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((t: any) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            <select
              value={queryTypeFilter}
              onChange={(e) => setQueryTypeFilter(e.target.value)}
              disabled={scanProgress.phase === "scanning" || importing}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
            >
              <option value="all">All Types ({queries.length} queries)</option>
              {queryTypes.map((t: string) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({queries.filter((q: any) => q.suggestedType === t).length})
                </option>
              ))}
            </select>
            {scanProgress.phase !== "scanning" && !importing ? (
              <button
                onClick={startScan}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Scan ({filteredTowns.length * filteredQueries.length})
              </button>
            ) : scanProgress.phase === "scanning" ? (
              <button
                onClick={() => { stopRef.current = true; }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Stop
              </button>
            ) : null}
          </div>
        </div>

        {/* Scan progress */}
        {scanProgress.phase !== "idle" && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>
                {scanProgress.phase === "scanning"
                  ? scanProgress.currentQuery
                  : "Scan complete"}
              </span>
              <span>
                {scanProgress.queriesCompleted} / {scanProgress.totalQueries} queries &middot;{" "}
                {scanProgress.uniqueTotal} unique found &middot;{" "}
                {scanProgress.alreadyInDb} already in DB &middot;{" "}
                <strong>{scanProgress.found} new</strong>
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(scanProgress.queriesCompleted / Math.max(scanProgress.totalQueries, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Debug log */}
        {debugMessages.length > 0 && (
          <div className="mt-4 bg-gray-900 text-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-xs">
            {debugMessages.map((msg, i) => (
              <div key={i} className={msg.includes("HTTP 4") || msg.includes("exception") ? "text-red-400" : msg.includes("OK: 0") ? "text-amber-400" : "text-green-400"}>
                {msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {discovered.length > 0 && (
        <>
          {/* Filter tabs + import controls */}
          <div className="bg-white border border-gray-200 rounded-lg mb-6">
            <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <FilterTab active={filter === "include"} onClick={() => setFilter("include")} color="emerald">
                  Tourism ({includedCount})
                </FilterTab>
                <FilterTab active={filter === "review"} onClick={() => setFilter("review")} color="amber">
                  Review ({reviewCount})
                </FilterTab>
                <FilterTab active={filter === "exclude"} onClick={() => setFilter("exclude")} color="red">
                  Non-Tourism ({excludedCount})
                </FilterTab>
                <FilterTab active={filter === "all"} onClick={() => setFilter("all")} color="gray">
                  All ({discovered.length})
                </FilterTab>

                {/* Result type filter dropdown */}
                {resultTypes.length > 1 && (
                  <>
                    <span className="text-gray-300 mx-1">|</span>
                    <select
                      value={resultTypeFilter}
                      onChange={(e) => setResultTypeFilter(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                    >
                      <option value="all">All Types ({relevanceFiltered.length})</option>
                      {resultTypes.map((t) => (
                        <option key={t} value={t}>
                          {t === "unknown" ? "Unknown" : t.charAt(0).toUpperCase() + t.slice(1)} ({resultTypeCounts[t] || 0})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {sortedResults.length} result{sortedResults.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={selectAllRelevant}
                  className="text-sm text-primary hover:underline"
                >
                  Select all tourism-relevant
                </button>
                {selected.size > 0 && !importing && (
                  <button
                    onClick={importSelected}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Import Selected ({selected.size})
                  </button>
                )}
                {importing && (
                  <button
                    onClick={() => { stopRef.current = true; }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Stop Import
                  </button>
                )}
              </div>
            </div>

            {/* Import progress bar */}
            {importing && (
              <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200">
                <div className="flex justify-between text-sm text-emerald-700 mb-1">
                  <span>Importing...</span>
                  <span>{importProgress.done} / {importProgress.total}</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.done / Math.max(importProgress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Results table */}
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={sortedResults.length > 0 && sortedResults.every((p) => selected.has(p.placeId))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              sortedResults.forEach((p) => next.add(p.placeId));
                              return next;
                            });
                          } else {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              sortedResults.forEach((p) => next.delete(p.placeId));
                              return next;
                            });
                          }
                        }}
                        className="rounded"
                      />
                    </th>
                    <SortableHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Address</th>
                    <SortableHeader field="type" label="Type" current={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader field="category" label="Category" current={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader field="rating" label="Rating" current={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader field="town" label="Town" current={sortField} dir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedResults.map((p) => (
                    <tr
                      key={p.placeId}
                      className={`hover:bg-gray-50 ${selected.has(p.placeId) ? "bg-emerald-50" : ""}`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.placeId)}
                          onChange={() => toggleSelect(p.placeId)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        {p.website && (
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 max-w-[200px] truncate">{p.address}</td>
                      <td className="px-4 py-2">
                        <TypeBadge type={p.suggestedListingType} />
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {p.suggestedCategorySlug?.replace(/-/g, " ") || (
                          <span className="text-amber-500 italic">uncategorized</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {p.rating > 0 ? (
                          <span>{p.rating.toFixed(1)} <span className="text-xs text-gray-400">({p.reviewCount})</span></span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{p.town}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedResults.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">
                  No results for this filter.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Import log */}
      {importLog.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Import Log</h3>
            <span className="text-xs text-gray-500">
              {importLog.filter((l) => l.status === "success").length} imported,{" "}
              {importLog.filter((l) => l.status === "error").length} failed
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {importLog.map((entry, i) => (
              <div key={i} className="px-6 py-2 flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="font-medium text-gray-900 min-w-[200px]">{entry.name}</span>
                <span className={entry.status === "success" ? "text-gray-500" : "text-red-600"}>{entry.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function FilterTab({
  active, onClick, color, children,
}: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  const base = "px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer";
  const colors: Record<string, { active: string; inactive: string }> = {
    emerald: { active: "bg-emerald-100 text-emerald-800", inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200" },
    amber: { active: "bg-amber-100 text-amber-800", inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200" },
    red: { active: "bg-red-100 text-red-800", inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200" },
    gray: { active: "bg-gray-200 text-gray-800", inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200" },
  };
  return (
    <button onClick={onClick} className={`${base} ${active ? colors[color].active : colors[color].inactive}`}>
      {children}
    </button>
  );
}

function SortableHeader({
  field, label, current, dir, onSort,
}: {
  field: SortField; label: string; current: SortField; dir: SortDir; onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-800 transition-colors group"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {dir === "asc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            )}
          </svg>
        ) : (
          <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </span>
    </th>
  );
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-gray-300 italic">unknown</span>;
  const colors: Record<string, string> = {
    dining: "bg-orange-100 text-orange-700",
    lodging: "bg-blue-100 text-blue-700",
    experiences: "bg-purple-100 text-purple-700",
    transportation: "bg-teal-100 text-teal-700",
    hiking: "bg-green-100 text-green-700",
    parks: "bg-emerald-100 text-emerald-700",
    golf: "bg-lime-100 text-lime-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
}
