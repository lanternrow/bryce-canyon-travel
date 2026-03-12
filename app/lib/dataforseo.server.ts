import { getSettings } from "./queries.server";

// ============================================
// DataForSEO API Client
// ============================================

const BASE_URL = "https://api.dataforseo.com/v3";

// ── Credentials ────────────────────────────

export async function getDataForSEOCredentials(): Promise<{
  login: string;
  password: string;
} | null> {
  const settings = await getSettings();
  const login = settings.dataforseo_login;
  const password = settings.dataforseo_password;
  if (!login || !password) return null;
  return { login, password };
}

export async function hasDataForSEOCredentials(): Promise<boolean> {
  return (await getDataForSEOCredentials()) !== null;
}

// ── In-memory cache (15 min TTL) ───────────

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

export function clearDataForSEOCache() {
  cache.clear();
}

// ── Core fetch ─────────────────────────────

interface DataForSEOResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    cost: number;
    result_count: number;
    result: T[];
  }>;
}

async function dataforseoFetch<T>(
  endpoint: string,
  body: unknown[],
  creds: { login: string; password: string }
): Promise<T[]> {
  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString(
    "base64"
  );
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${res.status}: ${text}`);
  }

  const json = (await res.json()) as DataForSEOResponse<T>;
  if (json.status_code !== 20000) {
    throw new Error(
      `DataForSEO error: ${json.status_message} (${json.status_code})`
    );
  }

  const results: T[] = [];
  for (const task of json.tasks || []) {
    if (task.status_code === 20000 && task.result) {
      results.push(...task.result);
    }
  }
  return results;
}

async function dataforseoGet<T>(
  endpoint: string,
  creds: { login: string; password: string }
): Promise<T[]> {
  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString(
    "base64"
  );
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${res.status}: ${text}`);
  }

  const json = (await res.json()) as DataForSEOResponse<T>;
  if (json.status_code !== 20000) {
    throw new Error(
      `DataForSEO error: ${json.status_message} (${json.status_code})`
    );
  }

  const results: T[] = [];
  for (const task of json.tasks || []) {
    if (task.status_code === 20000 && task.result) {
      results.push(...task.result);
    }
  }
  return results;
}

// ── Test connection ────────────────────────

export async function testConnection(creds: {
  login: string;
  password: string;
}): Promise<boolean> {
  try {
    const auth = Buffer.from(`${creds.login}:${creds.password}`).toString(
      "base64"
    );
    const res = await fetch(`${BASE_URL}/appendix/user_data`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.status_code === 20000;
  } catch {
    return false;
  }
}

// ── SERP Rankings ──────────────────────────

export interface SerpRankItem {
  rank_group: number;
  rank_absolute: number;
  domain: string;
  url: string;
  title: string;
  description: string;
  is_featured_snippet?: boolean;
  type: string;
}

interface SerpResult {
  keyword: string;
  items: SerpRankItem[];
  items_count: number;
}

export async function checkSerpRankings(
  keywords: string[],
  domain: string,
  creds: { login: string; password: string }
): Promise<
  Map<string, { rank: SerpRankItem | null; allItems: SerpRankItem[] }>
> {
  const results = new Map<
    string,
    { rank: SerpRankItem | null; allItems: SerpRankItem[] }
  >();

  // Process in batches of 3 to stay within API limits
  const batchSize = 3;
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    const tasks = batch.map((kw) => ({
      keyword: kw,
      location_code: 2840,
      language_code: "en",
      depth: 100,
    }));

    const serpResults = await dataforseoFetch<SerpResult>(
      "/serp/google/organic/live/regular",
      tasks,
      creds
    );

    for (let j = 0; j < batch.length; j++) {
      const keyword = batch[j];
      const result = serpResults[j];
      const organicItems =
        result?.items?.filter(
          (item) => item.type === "organic" || item.type === "featured_snippet"
        ) || [];

      const domainHost = new URL(
        domain.startsWith("http") ? domain : `https://${domain}`
      ).hostname.replace(/^www\./, "");
      const match = organicItems.find((item) => {
        try {
          const itemHost = new URL(item.url).hostname.replace(/^www\./, "");
          return itemHost === domainHost;
        } catch {
          return false;
        }
      });

      results.set(keyword, {
        rank: match || null,
        allItems: organicItems.slice(0, 10),
      });
    }
  }

  return results;
}

// ── Search Volume ──────────────────────────

export interface SearchVolumeItem {
  keyword: string;
  search_volume: number;
  competition: number;
  competition_level: string;
  cpc: number;
  monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
}

interface SearchVolumeResult {
  items: SearchVolumeItem[] | null;
}

export async function getSearchVolume(
  keywords: string[],
  creds: { login: string; password: string }
): Promise<SearchVolumeItem[]> {
  const cacheKey = `volume:${keywords.sort().join(",")}`;
  const cached = getCached<SearchVolumeItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<SearchVolumeResult>(
    "/keywords_data/google_ads/search_volume/live",
    [
      {
        keywords,
        location_code: 2840,
        language_code: "en",
      },
    ],
    creds
  );

  const items = results.flatMap((r) => r.items || []);
  setCache(cacheKey, items);
  return items;
}

// ── Keywords For Site ──────────────────────

// The keywords_for_site endpoint returns flat keyword objects directly
// in the result array (unlike search_volume which wraps them in {items: []})
interface KeywordsForSiteResult {
  keyword: string;
  location_code: number;
  language_code: string;
  search_partners: boolean;
  competition: number;
  competition_index: number;
  search_volume: number;
  low_top_of_page_bid: number;
  high_top_of_page_bid: number;
  cpc: number;
}

export async function getKeywordsForSite(
  domain: string,
  creds: { login: string; password: string }
): Promise<SearchVolumeItem[]> {
  const cacheKey = `keywords-for-site:${domain}`;
  const cached = getCached<SearchVolumeItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<KeywordsForSiteResult>(
    "/keywords_data/google_ads/keywords_for_site/live",
    [
      {
        target: domain,
        target_type: "site",
        location_code: 2840,
        language_code: "en",
      },
    ],
    creds
  );

  // Map to SearchVolumeItem format (field names differ slightly)
  // keywords_for_site returns competition_index (0-100) instead of competition (0-1)
  const items: SearchVolumeItem[] = results.map((r) => ({
    keyword: r.keyword,
    search_volume: r.search_volume ?? 0,
    competition: r.competition_index != null ? r.competition_index / 100 : (r.competition ?? 0),
    competition_level: r.competition_index != null
      ? r.competition_index < 33 ? "LOW" : r.competition_index < 66 ? "MEDIUM" : "HIGH"
      : "UNKNOWN",
    cpc: r.cpc ?? r.high_top_of_page_bid ?? 0,
    monthly_searches: [],
  }));
  setCache(cacheKey, items);
  return items;
}

// ── Backlinks Summary ──────────────────────

export interface BacklinksSummary {
  total_backlinks: number;
  referring_domains: number;
  rank: number;
  broken_backlinks: number;
  referring_ips: number;
  referring_subnets: number;
  referring_domains_nofollow: number;
  backlinks_nofollow: number;
}

export async function getBacklinksSummary(
  domain: string,
  creds: { login: string; password: string }
): Promise<BacklinksSummary | null> {
  const cacheKey = `backlinks-summary:${domain}`;
  const cached = getCached<BacklinksSummary>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<BacklinksSummary>(
    "/backlinks/summary/live",
    [{ target: domain, internal_list_limit: 0, backlinks_status_type: "all" }],
    creds
  );

  const summary = results[0] || null;
  if (summary) setCache(cacheKey, summary);
  return summary;
}

// ── Referring Domains ──────────────────────

export interface ReferringDomain {
  domain: string;
  rank: number;
  backlinks: number;
  first_seen: string;
  lost_date: string | null;
  backlinks_nofollow: number;
  broken_backlinks: number;
}

interface ReferringDomainsResult {
  items: ReferringDomain[] | null;
  total_count: number;
}

export async function getReferringDomains(
  domain: string,
  limit: number,
  creds: { login: string; password: string }
): Promise<{ items: ReferringDomain[]; totalCount: number }> {
  const cacheKey = `referring-domains:${domain}:${limit}`;
  const cached = getCached<{ items: ReferringDomain[]; totalCount: number }>(
    cacheKey
  );
  if (cached) return cached;

  const results = await dataforseoFetch<ReferringDomainsResult>(
    "/backlinks/referring_domains/live",
    [
      {
        target: domain,
        limit,
        order_by: ["rank,desc"],
      },
    ],
    creds
  );

  const data = {
    items: results[0]?.items || [],
    totalCount: results[0]?.total_count || 0,
  };
  setCache(cacheKey, data);
  return data;
}

// ── On-Page (Site Audit) ───────────────────

export async function submitSiteAudit(
  domain: string,
  creds: { login: string; password: string }
): Promise<string> {
  // Submit a crawl task
  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString(
    "base64"
  );
  const res = await fetch(`${BASE_URL}/on_page/task_post`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        target: domain,
        max_crawl_pages: 500,
        load_resources: true,
        enable_javascript: true,
        enable_browser_rendering: true,
      },
    ]),
  });

  if (!res.ok) throw new Error(`DataForSEO audit submit failed: ${res.status}`);
  const json = await res.json();
  const taskId = json.tasks?.[0]?.id;
  if (!taskId) throw new Error("No task ID returned from audit submission");
  return taskId;
}

export interface AuditSummary {
  crawl_progress: string;
  crawl_status: {
    max_crawl_pages: number;
    pages_in_queue: number;
    pages_crawled: number;
  };
  page_metrics: {
    checks: Record<string, number>;
    onpage_score: number;
    links_external: number;
    links_internal: number;
    duplicate_title: number;
    duplicate_description: number;
    duplicate_content: number;
    broken_resources: number;
    broken_links: number;
    redirect_chains: number;
    is_https: number;
    is_http: number;
  };
}

export async function getSiteAuditSummary(
  taskId: string,
  creds: { login: string; password: string }
): Promise<AuditSummary | null> {
  try {
    const results = await dataforseoGet<AuditSummary>(
      `/on_page/summary/${taskId}`,
      creds
    );
    return results[0] || null;
  } catch {
    return null;
  }
}

export interface AuditPage {
  url: string;
  status_code: number;
  meta: {
    title: string;
    description: string;
  };
  onpage_score: number;
  checks: Record<string, boolean>;
  page_timing: {
    time_to_interactive: number;
    dom_complete: number;
    largest_contentful_paint: number;
    first_input_delay: number;
    connection_time: number;
    time_to_secure_connection: number;
    duration_time: number;
  };
  resource_errors: number;
}

interface AuditPagesResult {
  items: AuditPage[] | null;
}

export async function getSiteAuditPages(
  taskId: string,
  limit: number,
  creds: { login: string; password: string }
): Promise<AuditPage[]> {
  const results = await dataforseoFetch<AuditPagesResult>(
    "/on_page/pages",
    [{ id: taskId, limit, order_by: ["onpage_score,asc"] }],
    creds
  );
  return results[0]?.items || [];
}

// ══════════════════════════════════════════════
// DataForSEO Labs — Ranked Keywords, Competitors,
// Keyword Suggestions/Ideas/Related, Search Intent,
// Historical Volume
// ══════════════════════════════════════════════

// ── Ranked Keywords ──────────────────────────

export interface RankedKeywordItem {
  keyword: string;
  position: number;
  url: string;
  search_volume: number;
  keyword_difficulty: number;
  etv: number; // estimated traffic volume
  competition: number;
  cpc: number;
  intent: string | null; // informational, navigational, commercial, transactional
  serp_features: string[]; // e.g. ["featured_snippet", "people_also_ask"]
}

interface LabsRankedKeywordsResult {
  total_count: number;
  items_count: number;
  items: Array<{
    keyword_data: {
      keyword: string;
      keyword_info: {
        search_volume: number;
        competition: number;
        cpc: number;
        monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
      };
      keyword_properties: {
        keyword_difficulty: number;
        core_keyword: string | null;
      };
      serp_info: {
        serp_item_types: string[];
        se_results_count: number;
      };
      search_intent_info: {
        main_intent: string | null;
        foreign_intent: string[];
      } | null;
    };
    ranked_serp_element: {
      serp_item: {
        rank_group: number;
        rank_absolute: number;
        url: string;
        title: string;
        description: string;
        type: string;
        etv: number;
      };
    };
  }>;
  metrics: Record<string, {
    pos_1: number;
    pos_2_3: number;
    pos_4_10: number;
    pos_11_20: number;
    pos_21_30: number;
    pos_31_40: number;
    pos_41_50: number;
    pos_51_60: number;
    pos_61_70: number;
    pos_71_80: number;
    pos_81_90: number;
    pos_91_100: number;
    etv: number;
    count: number;
  }>;
}

export async function getRankedKeywords(
  domain: string,
  creds: { login: string; password: string }
): Promise<{ items: RankedKeywordItem[]; totalCount: number; metrics: LabsRankedKeywordsResult["metrics"] | null }> {
  const cacheKey = `ranked-keywords:${domain}`;
  const cached = getCached<{ items: RankedKeywordItem[]; totalCount: number; metrics: LabsRankedKeywordsResult["metrics"] | null }>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsRankedKeywordsResult>(
    "/dataforseo_labs/google/ranked_keywords/live",
    [{
      target: domain,
      location_code: 2840,
      language_code: "en",
      item_types: ["organic"],
      limit: 1000,
      order_by: ["ranked_serp_element.serp_item.rank_group,asc"],
    }],
    creds
  );

  const result = results[0];
  const items: RankedKeywordItem[] = (result?.items || []).map((item) => ({
    keyword: item.keyword_data.keyword,
    position: item.ranked_serp_element.serp_item.rank_group,
    url: item.ranked_serp_element.serp_item.url,
    search_volume: item.keyword_data.keyword_info?.search_volume ?? 0,
    keyword_difficulty: item.keyword_data.keyword_properties?.keyword_difficulty ?? 0,
    etv: item.ranked_serp_element.serp_item.etv ?? 0,
    competition: item.keyword_data.keyword_info?.competition ?? 0,
    cpc: item.keyword_data.keyword_info?.cpc ?? 0,
    intent: item.keyword_data.search_intent_info?.main_intent ?? null,
    serp_features: item.keyword_data.serp_info?.serp_item_types ?? [],
  }));

  const data = {
    items,
    totalCount: result?.total_count ?? items.length,
    metrics: result?.metrics ?? null,
  };
  setCache(cacheKey, data);
  return data;
}

// ── Domain Competitors ───────────────────────

export interface CompetitorDomainItem {
  domain: string;
  avg_position: number;
  intersections: number; // shared keyword count
  etv: number;
  estimated_paid_traffic_cost: number;
  organic_count: number;
}

interface LabsCompetitorResult {
  total_count: number;
  items_count: number;
  items: Array<{
    domain: string;
    avg_position: number;
    sum_position: number;
    intersections: number;
    full_domain_metrics: Record<string, {
      etv: number;
      count: number;
      estimated_paid_traffic_cost: number;
      pos_1: number;
      pos_2_3: number;
      pos_4_10: number;
      pos_11_20: number;
    }>;
    metrics: Record<string, {
      etv: number;
      count: number;
      estimated_paid_traffic_cost: number;
    }>;
  }>;
}

export async function getDomainCompetitors(
  domain: string,
  creds: { login: string; password: string }
): Promise<CompetitorDomainItem[]> {
  const cacheKey = `domain-competitors:${domain}`;
  const cached = getCached<CompetitorDomainItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsCompetitorResult>(
    "/dataforseo_labs/google/competitors_domain/live",
    [{
      target: domain,
      location_code: 2840,
      language_code: "en",
      item_types: ["organic"],
      limit: 100,
      exclude_top_domains: true,
      order_by: ["metrics.organic.count,desc"],
    }],
    creds
  );

  const items: CompetitorDomainItem[] = (results[0]?.items || []).map((item) => ({
    domain: item.domain,
    avg_position: item.avg_position,
    intersections: item.intersections,
    etv: item.full_domain_metrics?.organic?.etv ?? 0,
    estimated_paid_traffic_cost: item.full_domain_metrics?.organic?.estimated_paid_traffic_cost ?? 0,
    organic_count: item.full_domain_metrics?.organic?.count ?? 0,
  }));

  setCache(cacheKey, items);
  return items;
}

// ── Keyword Suggestions (Labs) ───────────────

export interface LabsKeywordItem {
  keyword: string;
  search_volume: number;
  competition: number;
  cpc: number;
  keyword_difficulty: number;
  intent: string | null;
  serp_features: string[];
  monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
}

interface LabsKeywordResult {
  total_count: number;
  items_count: number;
  items: Array<{
    keyword_data: {
      keyword: string;
      keyword_info: {
        search_volume: number;
        competition: number;
        cpc: number;
        monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
      };
      keyword_properties: {
        keyword_difficulty: number;
        core_keyword: string | null;
      };
      serp_info: {
        serp_item_types: string[];
        se_results_count: number;
      } | null;
      search_intent_info: {
        main_intent: string | null;
        foreign_intent: string[];
      } | null;
    };
    depth?: number;
  }>;
}

function mapLabsKeywordItems(result: LabsKeywordResult | undefined): LabsKeywordItem[] {
  return (result?.items || []).map((item) => ({
    keyword: item.keyword_data.keyword,
    search_volume: item.keyword_data.keyword_info?.search_volume ?? 0,
    competition: item.keyword_data.keyword_info?.competition ?? 0,
    cpc: item.keyword_data.keyword_info?.cpc ?? 0,
    keyword_difficulty: item.keyword_data.keyword_properties?.keyword_difficulty ?? 0,
    intent: item.keyword_data.search_intent_info?.main_intent ?? null,
    serp_features: item.keyword_data.serp_info?.serp_item_types ?? [],
    monthly_searches: item.keyword_data.keyword_info?.monthly_searches ?? [],
  }));
}

export async function getKeywordSuggestions(
  keyword: string,
  creds: { login: string; password: string }
): Promise<LabsKeywordItem[]> {
  const cacheKey = `keyword-suggestions:${keyword}`;
  const cached = getCached<LabsKeywordItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsKeywordResult>(
    "/dataforseo_labs/google/keyword_suggestions/live",
    [{
      keyword,
      location_code: 2840,
      language_code: "en",
      include_seed_keyword: true,
      include_serp_info: true,
      limit: 500,
    }],
    creds
  );

  const items = mapLabsKeywordItems(results[0]);
  setCache(cacheKey, items);
  return items;
}

export async function getKeywordIdeas(
  keywords: string[],
  creds: { login: string; password: string }
): Promise<LabsKeywordItem[]> {
  const cacheKey = `keyword-ideas:${keywords.sort().join(",")}`;
  const cached = getCached<LabsKeywordItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsKeywordResult>(
    "/dataforseo_labs/google/keyword_ideas/live",
    [{
      keywords: keywords.slice(0, 20),
      location_code: 2840,
      language_code: "en",
      include_serp_info: true,
      limit: 500,
    }],
    creds
  );

  const items = mapLabsKeywordItems(results[0]);
  setCache(cacheKey, items);
  return items;
}

export async function getRelatedKeywords(
  keyword: string,
  creds: { login: string; password: string }
): Promise<LabsKeywordItem[]> {
  const cacheKey = `related-keywords:${keyword}`;
  const cached = getCached<LabsKeywordItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsKeywordResult>(
    "/dataforseo_labs/google/related_keywords/live",
    [{
      keyword,
      location_code: 2840,
      language_code: "en",
      depth: 2,
      include_seed_keyword: true,
      limit: 200,
    }],
    creds
  );

  const items = mapLabsKeywordItems(results[0]);
  setCache(cacheKey, items);
  return items;
}

// ── Search Intent ────────────────────────────

export interface SearchIntentResult {
  keyword: string;
  intent: string; // informational, navigational, commercial, transactional
  probability: number;
  secondary_intents: Array<{ label: string; probability: number }>;
}

interface LabsSearchIntentResult {
  items_count: number;
  items: Array<{
    keyword: string;
    keyword_intent: {
      label: string;
      probability: number;
    };
    secondary_keyword_intents: Array<{
      label: string;
      probability: number;
    }>;
  }>;
}

export async function getSearchIntent(
  keywords: string[],
  creds: { login: string; password: string }
): Promise<SearchIntentResult[]> {
  const cacheKey = `search-intent:${keywords.sort().join(",")}`;
  const cached = getCached<SearchIntentResult[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsSearchIntentResult>(
    "/dataforseo_labs/google/search_intent/live",
    [{
      keywords: keywords.slice(0, 1000),
      language_code: "en",
    }],
    creds
  );

  const items: SearchIntentResult[] = (results[0]?.items || []).map((item) => ({
    keyword: item.keyword,
    intent: item.keyword_intent?.label ?? "unknown",
    probability: item.keyword_intent?.probability ?? 0,
    secondary_intents: item.secondary_keyword_intents ?? [],
  }));

  setCache(cacheKey, items);
  return items;
}

// ── Historical Volume ────────────────────────

export interface HistoricalVolumeItem {
  keyword: string;
  search_volume: number;
  competition: number;
  competition_level: string;
  cpc: number;
  keyword_difficulty: number;
  intent: string | null;
  monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
  search_volume_trend: { monthly: number; quarterly: number; yearly: number } | null;
}

interface LabsHistoricalVolumeResult {
  items_count: number;
  items: Array<{
    keyword_data: {
      keyword: string;
      keyword_info: {
        search_volume: number;
        competition: number;
        competition_level: string;
        cpc: number;
        monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
        search_volume_trend: { monthly: number; quarterly: number; yearly: number } | null;
      };
      keyword_properties: {
        keyword_difficulty: number;
      };
      search_intent_info: {
        main_intent: string | null;
      } | null;
    };
  }>;
}

export async function getHistoricalVolume(
  keywords: string[],
  creds: { login: string; password: string }
): Promise<HistoricalVolumeItem[]> {
  const cacheKey = `historical-volume:${keywords.sort().join(",")}`;
  const cached = getCached<HistoricalVolumeItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<LabsHistoricalVolumeResult>(
    "/dataforseo_labs/google/historical_search_volume/live",
    [{
      keywords: keywords.slice(0, 700),
      location_code: 2840,
      language_code: "en",
      include_serp_info: true,
    }],
    creds
  );

  const items: HistoricalVolumeItem[] = (results[0]?.items || []).map((item) => ({
    keyword: item.keyword_data.keyword,
    search_volume: item.keyword_data.keyword_info?.search_volume ?? 0,
    competition: item.keyword_data.keyword_info?.competition ?? 0,
    competition_level: item.keyword_data.keyword_info?.competition_level ?? "UNKNOWN",
    cpc: item.keyword_data.keyword_info?.cpc ?? 0,
    keyword_difficulty: item.keyword_data.keyword_properties?.keyword_difficulty ?? 0,
    intent: item.keyword_data.search_intent_info?.main_intent ?? null,
    monthly_searches: item.keyword_data.keyword_info?.monthly_searches ?? [],
    search_volume_trend: item.keyword_data.keyword_info?.search_volume_trend ?? null,
  }));

  setCache(cacheKey, items);
  return items;
}

// ══════════════════════════════════════════════
// Backlinks — History, Anchors, Individual Links
// ══════════════════════════════════════════════

// ── Backlinks History ────────────────────────

export interface BacklinksHistoryItem {
  date: string;
  backlinks: number;
  new_backlinks: number;
  lost_backlinks: number;
  referring_domains: number;
  new_referring_domains: number;
  lost_referring_domains: number;
  rank: number;
}

export async function getBacklinksHistoryFromAPI(
  domain: string,
  creds: { login: string; password: string }
): Promise<BacklinksHistoryItem[]> {
  const cacheKey = `backlinks-history:${domain}`;
  const cached = getCached<BacklinksHistoryItem[]>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<{
    items: Array<{
      date: string;
      backlinks: number;
      new_backlinks: number;
      lost_backlinks: number;
      referring_domains: number;
      new_referring_domains: number;
      lost_referring_domains: number;
      rank: number;
    }>;
  }>(
    "/backlinks/history/live",
    [{ target: domain }],
    creds
  );

  const items: BacklinksHistoryItem[] = (results[0]?.items || []).map((item) => ({
    date: item.date,
    backlinks: item.backlinks ?? 0,
    new_backlinks: item.new_backlinks ?? 0,
    lost_backlinks: item.lost_backlinks ?? 0,
    referring_domains: item.referring_domains ?? 0,
    new_referring_domains: item.new_referring_domains ?? 0,
    lost_referring_domains: item.lost_referring_domains ?? 0,
    rank: item.rank ?? 0,
  }));

  setCache(cacheKey, items);
  return items;
}

// ── Anchor Texts ─────────────────────────────

export interface AnchorTextItem {
  anchor: string;
  backlinks: number;
  referring_domains: number;
  referring_main_domains: number;
  backlinks_spam_score: number;
  first_seen: string | null;
  dofollow_percent: number;
}

interface AnchorResult {
  total_count: number;
  items_count: number;
  items: Array<{
    anchor: string;
    backlinks: number;
    referring_domains: number;
    referring_main_domains: number;
    backlinks_spam_score: number;
    first_seen: string | null;
    referring_pages: number;
    referring_pages_nofollow: number;
  }>;
}

export async function getAnchorTexts(
  domain: string,
  limit: number,
  creds: { login: string; password: string }
): Promise<{ items: AnchorTextItem[]; totalCount: number }> {
  const cacheKey = `anchor-texts:${domain}:${limit}`;
  const cached = getCached<{ items: AnchorTextItem[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  const results = await dataforseoFetch<AnchorResult>(
    "/backlinks/anchors/live",
    [{
      target: domain,
      limit,
      order_by: ["backlinks,desc"],
    }],
    creds
  );

  const result = results[0];
  const items: AnchorTextItem[] = (result?.items || []).map((item) => ({
    anchor: item.anchor || "(empty)",
    backlinks: item.backlinks ?? 0,
    referring_domains: item.referring_domains ?? 0,
    referring_main_domains: item.referring_main_domains ?? 0,
    backlinks_spam_score: item.backlinks_spam_score ?? 0,
    first_seen: item.first_seen,
    dofollow_percent: item.referring_pages > 0
      ? Math.round(((item.referring_pages - item.referring_pages_nofollow) / item.referring_pages) * 100)
      : 0,
  }));

  const data = { items, totalCount: result?.total_count ?? items.length };
  setCache(cacheKey, data);
  return data;
}

// ── Individual Backlinks ─────────────────────

export interface BacklinkItem {
  url_from: string;
  domain_from: string;
  url_to: string;
  anchor: string;
  dofollow: boolean;
  backlink_spam_score: number;
  rank: number;
  page_from_rank: number;
  first_seen: string | null;
  last_seen: string | null;
  is_new: boolean;
  is_lost: boolean;
  item_type: string; // anchor, image, meta, canonical, redirect
}

interface BacklinksListResult {
  total_count: number;
  items_count: number;
  items: Array<{
    url_from: string;
    domain_from: string;
    url_to: string;
    anchor: string;
    dofollow: boolean;
    backlink_spam_score: number;
    rank: number;
    page_from_rank: number;
    first_seen: string | null;
    last_seen: string | null;
    is_new: boolean;
    is_lost: boolean;
    item_type: string;
  }>;
}

export async function getBacklinksList(
  domain: string,
  limit: number,
  creds: { login: string; password: string },
  filter?: "new" | "lost" | "dofollow"
): Promise<{ items: BacklinkItem[]; totalCount: number }> {
  const cacheKey = `backlinks-list:${domain}:${limit}:${filter || "all"}`;
  const cached = getCached<{ items: BacklinkItem[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  const params: Record<string, unknown> = {
    target: domain,
    limit,
    mode: "as_is",
    order_by: ["rank,desc"],
  };

  if (filter === "new") {
    params.filters = ["is_new", "=", true];
  } else if (filter === "lost") {
    params.backlinks_status_type = "lost";
  } else if (filter === "dofollow") {
    params.filters = ["dofollow", "=", true];
  }

  const results = await dataforseoFetch<BacklinksListResult>(
    "/backlinks/backlinks/live",
    [params],
    creds
  );

  const result = results[0];
  const items: BacklinkItem[] = (result?.items || []).map((item) => ({
    url_from: item.url_from,
    domain_from: item.domain_from,
    url_to: item.url_to,
    anchor: item.anchor || "(no anchor)",
    dofollow: item.dofollow ?? false,
    backlink_spam_score: item.backlink_spam_score ?? 0,
    rank: item.rank ?? 0,
    page_from_rank: item.page_from_rank ?? 0,
    first_seen: item.first_seen,
    last_seen: item.last_seen,
    is_new: item.is_new ?? false,
    is_lost: item.is_lost ?? false,
    item_type: item.item_type ?? "anchor",
  }));

  const data = { items, totalCount: result?.total_count ?? items.length };
  setCache(cacheKey, data);
  return data;
}
