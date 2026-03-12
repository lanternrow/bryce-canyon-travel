import sql from "./db.server";

// ============================================
// TRACKED KEYWORDS
// ============================================

export interface TrackedKeyword {
  id: number;
  keyword: string;
  location_code: number;
  language_code: string;
  search_volume: number | null;
  competition: number | null;
  competition_level: string | null;
  cpc: number | null;
  created_at: string;
  updated_at: string;
  // Joined from latest rank history
  latest_rank: number | null;
  latest_url: string | null;
  latest_checked_at: string | null;
  previous_rank: number | null;
}

export async function getTrackedKeywords(): Promise<TrackedKeyword[]> {
  const rows = await sql`
    SELECT
      tk.*,
      latest.rank_group AS latest_rank,
      latest.url AS latest_url,
      latest.checked_at AS latest_checked_at,
      prev.rank_group AS previous_rank
    FROM tracked_keywords tk
    LEFT JOIN LATERAL (
      SELECT rank_group, url, checked_at
      FROM keyword_rank_history
      WHERE tracked_keyword_id = tk.id
      ORDER BY checked_at DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT rank_group
      FROM keyword_rank_history
      WHERE tracked_keyword_id = tk.id
        AND checked_at < COALESCE(latest.checked_at, NOW())
      ORDER BY checked_at DESC
      LIMIT 1
    ) prev ON true
    ORDER BY tk.keyword ASC
  `;
  return rows as unknown as TrackedKeyword[];
}

export async function addTrackedKeyword(
  keyword: string,
  volumeData?: {
    search_volume?: number;
    competition?: number;
    competition_level?: string;
    cpc?: number;
  }
): Promise<{ id: number }> {
  const [row] = await sql`
    INSERT INTO tracked_keywords (keyword, search_volume, competition, competition_level, cpc)
    VALUES (
      ${keyword},
      ${volumeData?.search_volume ?? null},
      ${volumeData?.competition ?? null},
      ${volumeData?.competition_level ?? null},
      ${volumeData?.cpc ?? null}
    )
    ON CONFLICT (keyword, location_code, language_code) DO UPDATE
      SET updated_at = NOW()
    RETURNING id
  `;
  return { id: row.id };
}

export async function removeTrackedKeyword(id: number): Promise<void> {
  await sql`DELETE FROM tracked_keywords WHERE id = ${id}`;
}

export async function updateKeywordVolume(
  id: number,
  data: {
    search_volume: number;
    competition: number;
    competition_level: string;
    cpc: number;
  }
): Promise<void> {
  await sql`
    UPDATE tracked_keywords
    SET search_volume = ${data.search_volume},
        competition = ${data.competition},
        competition_level = ${data.competition_level},
        cpc = ${data.cpc},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

// ============================================
// KEYWORD RANK HISTORY
// ============================================

export async function saveRankCheck(
  keywordId: number,
  data: {
    rank_group: number | null;
    rank_absolute: number | null;
    url: string | null;
    title: string | null;
    snippet: string | null;
    is_featured_snippet: boolean;
  }
): Promise<void> {
  await sql`
    INSERT INTO keyword_rank_history (tracked_keyword_id, rank_group, rank_absolute, url, title, snippet, is_featured_snippet)
    VALUES (${keywordId}, ${data.rank_group}, ${data.rank_absolute}, ${data.url}, ${data.title}, ${data.snippet}, ${data.is_featured_snippet})
  `;
}

export interface RankHistoryPoint {
  checked_at: string;
  rank_group: number | null;
  rank_absolute: number | null;
  url: string | null;
}

export async function getRankHistory(
  keywordId: number,
  days: number
): Promise<RankHistoryPoint[]> {
  const rows = await sql`
    SELECT checked_at, rank_group, rank_absolute, url
    FROM keyword_rank_history
    WHERE tracked_keyword_id = ${keywordId}
      AND checked_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY checked_at ASC
  `;
  return rows as unknown as RankHistoryPoint[];
}

export async function getAllRankHistory(
  days: number
): Promise<
  Array<{
    keyword: string;
    keyword_id: number;
    checked_at: string;
    rank_group: number | null;
  }>
> {
  const rows = await sql`
    SELECT tk.keyword, tk.id AS keyword_id, h.checked_at, h.rank_group
    FROM keyword_rank_history h
    JOIN tracked_keywords tk ON tk.id = h.tracked_keyword_id
    WHERE h.checked_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY h.checked_at ASC
  `;
  return rows as unknown as Array<{
    keyword: string;
    keyword_id: number;
    checked_at: string;
    rank_group: number | null;
  }>;
}

// ============================================
// BACKLINK SNAPSHOTS
// ============================================

export async function saveBacklinkSnapshot(data: {
  total_backlinks: number;
  referring_domains: number;
  domain_rank: number;
  broken_backlinks: number;
  referring_ips: number;
  referring_subnets: number;
  dofollow: number;
  nofollow: number;
}): Promise<void> {
  await sql`
    INSERT INTO backlink_snapshots (total_backlinks, referring_domains, domain_rank, broken_backlinks, referring_ips, referring_subnets, dofollow, nofollow)
    VALUES (${data.total_backlinks}, ${data.referring_domains}, ${data.domain_rank}, ${data.broken_backlinks}, ${data.referring_ips}, ${data.referring_subnets}, ${data.dofollow}, ${data.nofollow})
  `;
}

export interface BacklinkHistoryPoint {
  checked_at: string;
  total_backlinks: number;
  referring_domains: number;
  domain_rank: number;
  broken_backlinks: number;
  dofollow: number;
  nofollow: number;
}

export async function getBacklinkHistory(
  days: number
): Promise<BacklinkHistoryPoint[]> {
  const rows = await sql`
    SELECT checked_at, total_backlinks, referring_domains, domain_rank, broken_backlinks, dofollow, nofollow
    FROM backlink_snapshots
    WHERE checked_at > NOW() - INTERVAL '1 day' * ${days}
    ORDER BY checked_at ASC
  `;
  return rows as unknown as BacklinkHistoryPoint[];
}

export async function getLatestBacklinkSnapshot(): Promise<BacklinkHistoryPoint | null> {
  const rows = await sql`
    SELECT checked_at, total_backlinks, referring_domains, domain_rank, broken_backlinks, dofollow, nofollow
    FROM backlink_snapshots
    ORDER BY checked_at DESC
    LIMIT 1
  `;
  return (rows[0] as unknown as BacklinkHistoryPoint) || null;
}

// ============================================
// COMPETITOR DOMAINS
// ============================================

export interface CompetitorDomain {
  id: number;
  domain: string;
  notes: string | null;
  added_at: string;
  organic_keywords: number | null;
  top10_count: number | null;
  estimated_traffic: number | null;
  metrics_updated_at: string | null;
}

export async function getCompetitorDomains(): Promise<CompetitorDomain[]> {
  const rows = await sql`
    SELECT id, domain, notes, added_at, organic_keywords, top10_count, estimated_traffic, metrics_updated_at
    FROM competitor_domains
    ORDER BY added_at DESC
  `;
  return rows as unknown as CompetitorDomain[];
}

/** Strip protocol/path from a domain string */
function normalizeDomain(input: string): string {
  try {
    const url = input.includes("://") ? input : `https://${input}`;
    return new URL(url).hostname;
  } catch {
    return input;
  }
}

export async function addCompetitorDomain(
  domain: string,
  notes?: string
): Promise<{ id: number }> {
  const clean = normalizeDomain(domain);
  const [row] = await sql`
    INSERT INTO competitor_domains (domain, notes)
    VALUES (${clean}, ${notes ?? null})
    ON CONFLICT (domain) DO UPDATE SET notes = COALESCE(EXCLUDED.notes, competitor_domains.notes)
    RETURNING id
  `;
  return { id: row.id };
}

/** One-time cleanup: strip any stored URLs to bare hostnames */
export async function normalizeCompetitorDomains(): Promise<void> {
  const rows = await sql`SELECT id, domain FROM competitor_domains WHERE domain LIKE 'http%'`;
  for (const row of rows) {
    const clean = normalizeDomain(row.domain as string);
    if (clean !== row.domain) {
      await sql`UPDATE competitor_domains SET domain = ${clean} WHERE id = ${row.id}`;
    }
  }
}

export async function updateCompetitorMetrics(
  domain: string,
  data: { organic_keywords: number; top10_count: number; estimated_traffic: number }
): Promise<void> {
  await sql`
    UPDATE competitor_domains
    SET organic_keywords = ${data.organic_keywords},
        top10_count = ${data.top10_count},
        estimated_traffic = ${data.estimated_traffic},
        metrics_updated_at = NOW()
    WHERE domain = ${domain}
  `;
}

export async function removeCompetitorDomain(id: number): Promise<void> {
  await sql`DELETE FROM competitor_domains WHERE id = ${id}`;
}

// ============================================
// KEYWORD SCAN CACHE
// ============================================

export interface KeywordScanCache {
  id: number;
  scan_type: string;
  input_key: string;
  results: unknown;
  result_count: number;
  scanned_at: string;
}

export async function upsertScanCache(
  scanType: string,
  inputKey: string,
  results: unknown[],
): Promise<void> {
  await sql`
    INSERT INTO keyword_scan_cache (scan_type, input_key, results, result_count, scanned_at)
    VALUES (${scanType}, ${inputKey}, ${JSON.stringify(results)}::jsonb, ${results.length}, NOW())
    ON CONFLICT (scan_type, input_key)
    DO UPDATE SET
      results = EXCLUDED.results,
      result_count = EXCLUDED.result_count,
      scanned_at = NOW()
  `;
}

export async function getLatestScanCaches(): Promise<KeywordScanCache[]> {
  const rows = await sql`
    SELECT DISTINCT ON (scan_type)
      id, scan_type, input_key, results, result_count, scanned_at
    FROM keyword_scan_cache
    ORDER BY scan_type, scanned_at DESC
  `;
  return rows as unknown as KeywordScanCache[];
}
