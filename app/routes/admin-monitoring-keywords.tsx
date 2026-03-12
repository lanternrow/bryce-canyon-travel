import { Link, useLoaderData, useFetcher } from "react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { Route } from "./+types/admin-monitoring-keywords";
import { requireAuth } from "../lib/auth.server";
import {
  hasDataForSEOCredentials,
  getDataForSEOCredentials,
  getKeywordsForSite,
  getSearchVolume,
  getKeywordSuggestions,
  getKeywordIdeas,
  getRelatedKeywords,
  type SearchVolumeItem,
  type LabsKeywordItem,
} from "../lib/dataforseo.server";
import { addTrackedKeyword, upsertScanCache, getLatestScanCaches, type KeywordScanCache } from "../lib/dataforseo-queries.server";
import { getRagDocuments, getRagDocumentById, createRagDocument, updateRagDocument } from "../lib/queries.server";
import { analyzeKeywordOpportunities, type KeywordRecommendation } from "../lib/claude-ai.server";
import { siteConfig } from "../lib/site-config";

// ============================================
// META
// ============================================

export function meta() {
  return [{ title: `Keyword Research | Monitoring | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const configured = await hasDataForSEOCredentials();
  const ragDocuments = await getRagDocuments();
  let scanCaches: KeywordScanCache[] = [];
  if (configured) {
    try { scanCaches = await getLatestScanCaches(); } catch { /* table may not exist yet */ }
  }
  return {
    configured,
    ragDocuments: ragDocuments as unknown as Array<{ id: number; title: string; content: string; is_active: boolean }>,
    scanCaches,
  };
}

// ============================================
// ACTION
// ============================================

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "discover-keywords") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const domain = new URL(siteConfig.siteUrl).hostname;
    try {
      const items = await getKeywordsForSite(domain, creds);
      await upsertScanCache("discover", domain, items);
      return { discoverResults: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO discover error:", message);
      return { error: `Failed to discover keywords: ${message}` };
    }
  }

  if (intent === "lookup-volume") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const raw = (formData.get("keywords") as string) || "";
    const keywords = raw.split("\n").map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 100);
    if (keywords.length === 0) return { error: "Enter at least one keyword" };
    try {
      const items = await getSearchVolume(keywords, creds);
      await upsertScanCache("lookup", keywords.sort().join("\n"), items);
      return { lookupResults: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("DataForSEO volume lookup error:", message);
      return { error: `Failed to lookup volume: ${message}` };
    }
  }

  if (intent === "keyword-suggestions") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const keyword = (formData.get("keyword") as string)?.trim().toLowerCase();
    if (!keyword) return { error: "Enter a seed keyword" };
    try {
      const items = await getKeywordSuggestions(keyword, creds);
      await upsertScanCache("suggestions", keyword, items);
      return { suggestionsResults: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to get suggestions: ${message}` };
    }
  }

  if (intent === "keyword-ideas") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const raw = (formData.get("keywords") as string) || "";
    const keywords = raw.split("\n").map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (keywords.length === 0) return { error: "Enter at least one seed keyword" };
    try {
      const items = await getKeywordIdeas(keywords, creds);
      await upsertScanCache("ideas", keywords.sort().join("\n"), items);
      return { ideasResults: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to get ideas: ${message}` };
    }
  }

  if (intent === "related-keywords") {
    const creds = await getDataForSEOCredentials();
    if (!creds) return { error: "DataForSEO not configured" };
    const keyword = (formData.get("keyword") as string)?.trim().toLowerCase();
    if (!keyword) return { error: "Enter a keyword" };
    try {
      const items = await getRelatedKeywords(keyword, creds);
      await upsertScanCache("related", keyword, items);
      return { relatedResults: items };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to get related keywords: ${message}` };
    }
  }

  if (intent === "track-keyword") {
    const keyword = (formData.get("keyword") as string)?.trim().toLowerCase();
    const volume = Number(formData.get("volume")) || undefined;
    const competition = Number(formData.get("competition")) || undefined;
    const competitionLevel = (formData.get("competition_level") as string) || undefined;
    const cpc = Number(formData.get("cpc")) || undefined;
    if (!keyword) return { error: "Keyword is required" };
    await addTrackedKeyword(keyword, {
      search_volume: volume,
      competition,
      competition_level: competitionLevel,
      cpc,
    });
    return { tracked: keyword };
  }

  if (intent === "analyze-keywords") {
    const raw = formData.get("keywords_json") as string;
    if (!raw) return { error: "No keywords to analyze" };
    try {
      const keywords = JSON.parse(raw);
      const recommendations = await analyzeKeywordOpportunities(keywords);
      return { aiRecommendations: recommendations, aiAnalyzed: true, aiCount: recommendations.length };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("AI analysis error:", message);
      return { error: `AI analysis failed: ${message}` };
    }
  }

  if (intent === "add-to-seo") {
    const keyword = (formData.get("keyword") as string)?.trim();
    const docId = formData.get("doc_id") as string;
    const newDocTitle = (formData.get("new_doc_title") as string)?.trim();
    if (!keyword) return { error: "Keyword is required" };

    try {
      if (docId === "__new__") {
        const title = newDocTitle || "Keywords";
        await createRagDocument({ title, content: keyword, created_by: "keyword-research" });
        return { addedToSeo: keyword, docTitle: title };
      } else {
        const doc = await getRagDocumentById(docId);
        if (!doc) return { error: "Document not found" };
        const existing = (doc as any).content || "";
        const newContent = existing ? `${existing}\n${keyword}` : keyword;
        await updateRagDocument(docId, { content: newContent });
        return { addedToSeo: keyword, docTitle: (doc as any).title };
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { error: `Failed to add keyword: ${message}` };
    }
  }

  return { ok: false };
}

// ============================================
// SHARED COMPONENTS
// ============================================

function CompetitionBar({ value, level }: { value: number; level?: string }) {
  const pct = Number.isFinite(value) ? Math.round(value * 100) : 0;
  const color = pct < 33 ? "bg-emerald-500" : pct < 66 ? "bg-amber-500" : "bg-red-500";
  const label = level && level !== "UNKNOWN" ? level : `${pct}%`;
  const labelColor = level === "LOW" ? "text-emerald-600" : level === "MEDIUM" ? "text-amber-600" : level === "HIGH" ? "text-red-600" : "text-gray-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${labelColor}`}>{label}</span>
    </div>
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

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return null;
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

function StarRating({ score, reason }: { score: number; reason: string }) {
  return (
    <div className="relative group inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= score ? "text-amber-400" : "text-gray-200"}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 w-48 px-2.5 py-1.5 text-xs text-white bg-gray-800 rounded-md shadow-lg">
        {reason}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    </div>
  );
}

function AddToSeoDropdown({
  keyword,
  ragDocuments,
  seoFetcher,
}: {
  keyword: string;
  ragDocuments: Array<{ id: number; title: string }>;
  seoFetcher: ReturnType<typeof useFetcher>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
      >
        +SEO
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
          {ragDocuments.map((doc) => (
            <seoFetcher.Form key={doc.id} method="post" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="intent" value="add-to-seo" />
              <input type="hidden" name="keyword" value={keyword} />
              <input type="hidden" name="doc_id" value={doc.id} />
              <button type="submit" className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-purple-700 truncate">
                {doc.title}
              </button>
            </seoFetcher.Form>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <seoFetcher.Form method="post" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="intent" value="add-to-seo" />
              <input type="hidden" name="keyword" value={keyword} />
              <input type="hidden" name="doc_id" value="__new__" />
              <button type="submit" className="w-full text-left px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 font-medium">
                + New Document
              </button>
            </seoFetcher.Form>
          </div>
        </div>
      )}
    </div>
  );
}

// Sortable column header
function SortHeader({ label, field, sortBy, sortDir, onSort, className }: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 transition-colors ${active ? "text-gray-800" : "text-gray-500"} ${className || ""}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sortDir === "desc"
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />}
          </svg>
        ) : (
          <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </span>
    </th>
  );
}

// Original table for Discover/Lookup (SearchVolumeItem)
function KeywordResultsTable({
  items,
  fetcher,
  aiRecommendations,
  ragDocuments,
  seoFetcher,
}: {
  items: SearchVolumeItem[];
  fetcher: ReturnType<typeof useFetcher>;
  aiRecommendations?: KeywordRecommendation[];
  ragDocuments: Array<{ id: number; title: string }>;
  seoFetcher: ReturnType<typeof useFetcher>;
}) {
  const [sortBy, setSortBy] = useState("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minVolume, setMinVolume] = useState(0);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  const filtered = items.filter((item) => item.search_volume >= minVolume);
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "desc" ? 1 : -1;
    if (sortBy === "keyword") return dir * b.keyword.localeCompare(a.keyword);
    if (sortBy === "volume") return dir * (b.search_volume - a.search_volume);
    if (sortBy === "competition") return dir * (b.competition - a.competition);
    if (sortBy === "cpc") return dir * (b.cpc - a.cpc);
    if (sortBy === "ai" && aiRecommendations) {
      const aScore = aiRecommendations.find((r) => r.keyword === a.keyword.toLowerCase())?.score ?? 0;
      const bScore = aiRecommendations.find((r) => r.keyword === b.keyword.toLowerCase())?.score ?? 0;
      return dir * (bScore - aScore);
    }
    return 0;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Min volume:</label>
          <input type="number" value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value) || 0)} className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
        </div>
        <span className="text-xs text-gray-400">{sorted.length} keywords</span>
      </div>
      {sorted.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortHeader label="Keyword" field="keyword" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-left" />
                {aiRecommendations && aiRecommendations.length > 0 && (
                  <SortHeader label="AI" field="ai" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-center !text-purple-500" />
                )}
                <SortHeader label="Volume" field="volume" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortHeader label="Competition" field="competition" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-center hidden sm:table-cell" />
                <SortHeader label="CPC" field="cpc" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right hidden md:table-cell" />
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.slice(0, 100).map((item, idx) => {
                const rec = aiRecommendations?.find((r) => r.keyword === item.keyword.toLowerCase());
                return (
                  <tr key={idx} className={`hover:bg-gray-50 ${rec ? "bg-purple-50/30" : ""}`}>
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium">{item.keyword}</td>
                    {aiRecommendations && aiRecommendations.length > 0 && (
                      <td className="px-3 py-2.5 text-center">
                        {rec ? <StarRating score={rec.score} reason={rec.reason} /> : null}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap">{item.search_volume?.toLocaleString() || "--"}</td>
                    <td className="px-4 py-2.5 hidden sm:table-cell whitespace-nowrap">
                      <div className="flex justify-center">
                        <CompetitionBar value={Number.isFinite(item.competition) ? item.competition : 0} level={item.competition_level} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{item.cpc ? `$${item.cpc.toFixed(2)}` : "--"}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="track-keyword" />
                          <input type="hidden" name="keyword" value={item.keyword} />
                          <input type="hidden" name="volume" value={item.search_volume} />
                          <input type="hidden" name="competition" value={item.competition} />
                          <input type="hidden" name="competition_level" value={item.competition_level} />
                          <input type="hidden" name="cpc" value={item.cpc} />
                          <button type="submit" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">Track</button>
                        </fetcher.Form>
                        <AddToSeoDropdown keyword={item.keyword} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">No keywords match the current filters.</div>
      )}
    </div>
  );
}

// Enhanced table for Labs results (LabsKeywordItem — includes difficulty + intent)
function LabsKeywordResultsTable({
  items,
  fetcher,
  aiRecommendations,
  ragDocuments,
  seoFetcher,
}: {
  items: LabsKeywordItem[];
  fetcher: ReturnType<typeof useFetcher>;
  aiRecommendations?: KeywordRecommendation[];
  ragDocuments: Array<{ id: number; title: string }>;
  seoFetcher: ReturnType<typeof useFetcher>;
}) {
  const [sortBy, setSortBy] = useState("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minVolume, setMinVolume] = useState(0);

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  const filtered = items.filter((item) => item.search_volume >= minVolume);
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "desc" ? 1 : -1;
    if (sortBy === "keyword") return dir * b.keyword.localeCompare(a.keyword);
    if (sortBy === "volume") return dir * (b.search_volume - a.search_volume);
    if (sortBy === "difficulty") return dir * (b.keyword_difficulty - a.keyword_difficulty);
    if (sortBy === "cpc") return dir * (b.cpc - a.cpc);
    if (sortBy === "ai" && aiRecommendations) {
      const aScore = aiRecommendations.find((r) => r.keyword === a.keyword.toLowerCase())?.score ?? 0;
      const bScore = aiRecommendations.find((r) => r.keyword === b.keyword.toLowerCase())?.score ?? 0;
      return dir * (bScore - aScore);
    }
    return 0;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Min volume:</label>
          <input type="number" value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value) || 0)} className="w-20 text-xs border border-gray-300 rounded px-2 py-1" />
        </div>
        <span className="text-xs text-gray-400">{sorted.length} keywords</span>
      </div>
      {sorted.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortHeader label="Keyword" field="keyword" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-left" />
                {aiRecommendations && aiRecommendations.length > 0 && (
                  <SortHeader label="AI" field="ai" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-center !text-purple-500" />
                )}
                <SortHeader label="Volume" field="volume" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right" />
                <SortHeader label="Difficulty" field="difficulty" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-center hidden sm:table-cell" />
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Intent</th>
                <SortHeader label="CPC" field="cpc" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right hidden md:table-cell" />
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.slice(0, 200).map((item, idx) => {
                const rec = aiRecommendations?.find((r) => r.keyword === item.keyword.toLowerCase());
                return (
                  <tr key={idx} className={`hover:bg-gray-50 ${rec ? "bg-purple-50/30" : ""}`}>
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium">{item.keyword}</td>
                    {aiRecommendations && aiRecommendations.length > 0 && (
                      <td className="px-3 py-2.5 text-center">
                        {rec ? <StarRating score={rec.score} reason={rec.reason} /> : null}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap">{item.search_volume?.toLocaleString() || "--"}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div className="flex justify-center"><DifficultyBar value={item.keyword_difficulty} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden sm:table-cell"><IntentBadge intent={item.intent} /></td>
                    <td className="px-3 py-2.5 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{item.cpc ? `$${item.cpc.toFixed(2)}` : "--"}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="track-keyword" />
                          <input type="hidden" name="keyword" value={item.keyword} />
                          <input type="hidden" name="volume" value={item.search_volume} />
                          <input type="hidden" name="competition" value={item.competition} />
                          <input type="hidden" name="cpc" value={item.cpc} />
                          <button type="submit" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">Track</button>
                        </fetcher.Form>
                        <AddToSeoDropdown keyword={item.keyword} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">No keywords match the current filters.</div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

type TabType = "discover" | "lookup" | "suggestions" | "ideas" | "related";

export default function AdminMonitoringKeywords() {
  const { configured, ragDocuments, scanCaches } = useLoaderData<typeof loader>();
  const discoverFetcher = useFetcher<{ discoverResults?: SearchVolumeItem[]; error?: string }>();
  const lookupFetcher = useFetcher<{ lookupResults?: SearchVolumeItem[]; error?: string }>();
  const suggestionsFetcher = useFetcher<{ suggestionsResults?: LabsKeywordItem[]; error?: string }>();
  const ideasFetcher = useFetcher<{ ideasResults?: LabsKeywordItem[]; error?: string }>();
  const relatedFetcher = useFetcher<{ relatedResults?: LabsKeywordItem[]; error?: string }>();
  const trackFetcher = useFetcher<{ tracked?: string; error?: string }>();
  const aiFetcher = useFetcher<{ aiRecommendations?: KeywordRecommendation[]; aiAnalyzed?: boolean; aiCount?: number; error?: string }>();
  const seoFetcher = useFetcher<{ addedToSeo?: string; docTitle?: string; error?: string }>();
  const [tab, setTab] = useState<TabType>("discover");
  const [lookupText, setLookupText] = useState("");
  const [suggestionsInput, setSuggestionsInput] = useState("");
  const [ideasInput, setIdeasInput] = useState("");
  const [relatedInput, setRelatedInput] = useState("");

  // Build cached scan lookup: scan_type -> cached data
  const cachedByType = useMemo(() => {
    const map: Record<string, KeywordScanCache> = {};
    for (const cache of scanCaches) map[cache.scan_type] = cache;
    return map;
  }, [scanCaches]);

  // Derive results: fresh fetcher data takes priority, then cached
  // Derive results: fresh fetcher data takes priority, then cached. Ensure arrays.
  const asArray = <T,>(v: unknown): T[] | null => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed; } catch {} }
    return null;
  };
  const discoverResults = discoverFetcher.data?.discoverResults ?? asArray<SearchVolumeItem>(cachedByType.discover?.results);
  const lookupResults = lookupFetcher.data?.lookupResults ?? asArray<SearchVolumeItem>(cachedByType.lookup?.results);
  const suggestionsResults = suggestionsFetcher.data?.suggestionsResults ?? asArray<LabsKeywordItem>(cachedByType.suggestions?.results);
  const ideasResults = ideasFetcher.data?.ideasResults ?? asArray<LabsKeywordItem>(cachedByType.ideas?.results);
  const relatedResults = relatedFetcher.data?.relatedResults ?? asArray<LabsKeywordItem>(cachedByType.related?.results);

  // Toast on successful keyword track
  useEffect(() => {
    if (trackFetcher.data?.tracked) toast.success(`Keyword tracked: ${trackFetcher.data.tracked}`);
    if (trackFetcher.data?.error) toast.error(trackFetcher.data.error);
  }, [trackFetcher.data]);

  // Toast on successful SEO add
  useEffect(() => {
    if (seoFetcher.data?.addedToSeo) toast.success(`Added "${seoFetcher.data.addedToSeo}" to ${seoFetcher.data.docTitle}`);
  }, [seoFetcher.data]);

  const aiRecommendations = aiFetcher.data?.aiRecommendations;

  // Helper to build the analyze button + result banner for a given keyword list
  function AnalyzeButton({ keywords }: { keywords: Array<{ keyword: string; search_volume: number; competition?: number; cpc?: number; keyword_difficulty?: number; intent?: string | null }> }) {
    return (
      <div className="mb-4">
        <aiFetcher.Form method="post" className="inline">
          <input type="hidden" name="intent" value="analyze-keywords" />
          <input type="hidden" name="keywords_json" value={JSON.stringify(keywords.slice(0, 100))} />
          <button
            type="submit"
            disabled={aiFetcher.state !== "idle"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${aiFetcher.state !== "idle" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {aiFetcher.state !== "idle" ? "Analyzing..." : "Analyze with AI"}
          </button>
        </aiFetcher.Form>
        {aiFetcher.data?.aiAnalyzed && aiFetcher.state === "idle" && (
          <span className="ml-3 text-xs text-purple-600">
            {(aiFetcher.data.aiCount ?? 0) > 0
              ? `Found ${aiFetcher.data.aiCount} recommendations — highlighted with stars below`
              : "Analysis complete — no strong keyword opportunities identified"}
          </span>
        )}
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
          <span>/</span><span>Monitoring</span><span>/</span><span>Keyword Research</span>
        </div>
        <h1 className="text-3xl font-bold text-dark mb-8">Keyword Research</h1>
        <div className="max-w-lg mx-auto mt-16">
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
            </svg>
            <h2 className="text-lg font-semibold text-dark mb-2">DataForSEO is not configured</h2>
            <p className="text-sm text-gray-500 mb-6">Set up your DataForSEO API credentials to research keywords.</p>
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

  const tabs: { id: TabType; label: string }[] = [
    { id: "discover", label: "Discover" },
    { id: "lookup", label: "Lookup" },
    { id: "suggestions", label: "Suggestions" },
    { id: "ideas", label: "Ideas" },
    { id: "related", label: "Related" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span><span>Monitoring</span><span>/</span><span>Keyword Research</span>
      </div>
      <h1 className="text-3xl font-bold text-dark mb-6">Keyword Research</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Discover Tab */}
      {tab === "discover" && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Discover keywords for <span className="text-primary font-semibold">{new URL(siteConfig.siteUrl).hostname}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Finds keyword suggestions based on your site content and competitors.</p>
              </div>
              <discoverFetcher.Form method="post">
                <input type="hidden" name="intent" value="discover-keywords" />
                <button type="submit" disabled={discoverFetcher.state !== "idle"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  <svg className={`w-4 h-4 ${discoverFetcher.state !== "idle" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {discoverFetcher.state !== "idle" ? "Scanning..." : cachedByType.discover ? "Re-scan Keywords" : "Scan Keywords"}
                </button>
              </discoverFetcher.Form>
            </div>
          </div>
          {discoverFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{discoverFetcher.data.error}</div>}
          {aiFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{aiFetcher.data.error}</div>}
          {cachedByType.discover?.scanned_at && !discoverFetcher.data?.discoverResults && (
            <p className="text-xs text-gray-400 mb-4">Last scanned: {new Date(cachedByType.discover.scanned_at).toLocaleString()} ({cachedByType.discover.result_count} keywords)</p>
          )}
          {discoverResults && (
            <>
              <AnalyzeButton keywords={discoverResults} />
              <KeywordResultsTable items={discoverResults} fetcher={trackFetcher} aiRecommendations={aiRecommendations} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
            </>
          )}
        </div>
      )}

      {/* Lookup Tab */}
      {tab === "lookup" && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <lookupFetcher.Form method="post">
              <input type="hidden" name="intent" value="lookup-volume" />
              <label className="block text-sm font-medium text-gray-700 mb-2">Enter keywords (one per line, up to 100)</label>
              <textarea name="keywords" value={lookupText} onChange={(e) => setLookupText(e.target.value)} rows={6} placeholder={"bryce canyon national park lodging\nbest hikes near bryce canyon\nbryce canyon utah restaurants"} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono mb-3" />
              <button type="submit" disabled={lookupFetcher.state !== "idle" || !lookupText.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {lookupFetcher.state !== "idle" ? "Looking up..." : "Get Volume Data"}
              </button>
            </lookupFetcher.Form>
          </div>
          {lookupFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{lookupFetcher.data.error}</div>}
          {cachedByType.lookup?.scanned_at && !lookupFetcher.data?.lookupResults && (
            <p className="text-xs text-gray-400 mb-4">Last lookup: {new Date(cachedByType.lookup.scanned_at).toLocaleString()} ({cachedByType.lookup.result_count} keywords)</p>
          )}
          {lookupResults && (
            <>
              <AnalyzeButton keywords={lookupResults} />
              <KeywordResultsTable items={lookupResults} fetcher={trackFetcher} aiRecommendations={aiRecommendations} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
            </>
          )}
        </div>
      )}

      {/* Suggestions Tab */}
      {tab === "suggestions" && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <suggestionsFetcher.Form method="post" className="flex items-end gap-3">
              <input type="hidden" name="intent" value="keyword-suggestions" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Seed keyword</label>
                <input type="text" name="keyword" value={suggestionsInput} onChange={(e) => setSuggestionsInput(e.target.value)} placeholder="bryce canyon national park" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm" />
              </div>
              <button type="submit" disabled={suggestionsFetcher.state !== "idle" || !suggestionsInput.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {suggestionsFetcher.state !== "idle" ? "Searching..." : "Get Suggestions"}
              </button>
            </suggestionsFetcher.Form>
            <p className="text-xs text-gray-400 mt-2">Finds long-tail keyword variations containing your seed keyword.</p>
          </div>
          {suggestionsFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{suggestionsFetcher.data.error}</div>}
          {cachedByType.suggestions?.scanned_at && !suggestionsFetcher.data?.suggestionsResults && (
            <p className="text-xs text-gray-400 mb-4">Last searched: {new Date(cachedByType.suggestions.scanned_at).toLocaleString()} for &ldquo;{cachedByType.suggestions.input_key}&rdquo; ({cachedByType.suggestions.result_count} keywords)</p>
          )}
          {suggestionsResults && (
            <>
              <AnalyzeButton keywords={suggestionsResults} />
              <LabsKeywordResultsTable items={suggestionsResults} fetcher={trackFetcher} aiRecommendations={aiRecommendations} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
            </>
          )}
        </div>
      )}

      {/* Ideas Tab */}
      {tab === "ideas" && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <ideasFetcher.Form method="post">
              <input type="hidden" name="intent" value="keyword-ideas" />
              <label className="block text-sm font-medium text-gray-700 mb-1">Seed keywords (one per line, up to 20)</label>
              <textarea name="keywords" value={ideasInput} onChange={(e) => setIdeasInput(e.target.value)} rows={4} placeholder={"bryce canyon national park\nhiking trails utah\nbryce canyon restaurants"} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm font-mono mb-3" />
              <button type="submit" disabled={ideasFetcher.state !== "idle" || !ideasInput.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {ideasFetcher.state !== "idle" ? "Searching..." : "Get Ideas"}
              </button>
            </ideasFetcher.Form>
            <p className="text-xs text-gray-400 mt-2">Finds keywords in the same product/service category as your seeds. Broader than suggestions.</p>
          </div>
          {ideasFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{ideasFetcher.data.error}</div>}
          {cachedByType.ideas?.scanned_at && !ideasFetcher.data?.ideasResults && (
            <p className="text-xs text-gray-400 mb-4">Last searched: {new Date(cachedByType.ideas.scanned_at).toLocaleString()} ({cachedByType.ideas.result_count} keywords)</p>
          )}
          {ideasResults && (
            <>
              <AnalyzeButton keywords={ideasResults} />
              <LabsKeywordResultsTable items={ideasResults} fetcher={trackFetcher} aiRecommendations={aiRecommendations} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
            </>
          )}
        </div>
      )}

      {/* Related Tab */}
      {tab === "related" && (
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <relatedFetcher.Form method="post" className="flex items-end gap-3">
              <input type="hidden" name="intent" value="related-keywords" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
                <input type="text" name="keyword" value={relatedInput} onChange={(e) => setRelatedInput(e.target.value)} placeholder="things to do near bryce canyon" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm" />
              </div>
              <button type="submit" disabled={relatedFetcher.state !== "idle" || !relatedInput.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {relatedFetcher.state !== "idle" ? "Searching..." : "Find Related"}
              </button>
            </relatedFetcher.Form>
            <p className="text-xs text-gray-400 mt-2">Finds semantically related keywords from Google's "related searches" feature.</p>
          </div>
          {relatedFetcher.data?.error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{relatedFetcher.data.error}</div>}
          {cachedByType.related?.scanned_at && !relatedFetcher.data?.relatedResults && (
            <p className="text-xs text-gray-400 mb-4">Last searched: {new Date(cachedByType.related.scanned_at).toLocaleString()} for &ldquo;{cachedByType.related.input_key}&rdquo; ({cachedByType.related.result_count} keywords)</p>
          )}
          {relatedResults && (
            <>
              <AnalyzeButton keywords={relatedResults} />
              <LabsKeywordResultsTable items={relatedResults} fetcher={trackFetcher} aiRecommendations={aiRecommendations} ragDocuments={ragDocuments} seoFetcher={seoFetcher} />
            </>
          )}
        </div>
      )}

    </div>
  );
}
