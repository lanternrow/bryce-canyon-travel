import { randomUUID } from "node:crypto";
import sql from "./db.server";
import { notifySearchEnginesDetailed } from "./seo-notify.server";
import { getListingUrl } from "./listing-url";
import { getNewsArticleUrl } from "./news-url";

export type DeindexContentType = "listing" | "blog_post";
export type DeindexRequestOutcome = "requested" | "blocked" | "duplicate";

export type DeindexPreflight = {
  url: string;
  eligible: boolean;
  publicStatusCode: 200 | 404;
  robotsDirective: "index, follow" | "noindex, nofollow";
  inSitemap: boolean;
  contentStatus: string;
  reasons: string[];
};

export type DeindexAuditEntry = {
  id: string;
  requested_url: string;
  requested_by_email: string | null;
  request_outcome: DeindexRequestOutcome;
  blocked_reason: string | null;
  public_status_code: number;
  robots_directive: string;
  in_sitemap: boolean;
  created_at: string;
};

let ensureTablePromise: Promise<void> | null = null;

async function ensureDeindexAuditTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      try {
        await sql.unsafe(`
          CREATE TABLE IF NOT EXISTS admin_deindex_requests (
            id UUID PRIMARY KEY,
            content_type VARCHAR(32) NOT NULL,
            content_id TEXT NOT NULL,
            requested_url TEXT NOT NULL,
            requested_by_user_id UUID,
            requested_by_email TEXT,
            content_status VARCHAR(32) NOT NULL,
            public_status_code INTEGER NOT NULL,
            robots_directive VARCHAR(64) NOT NULL,
            in_sitemap BOOLEAN NOT NULL DEFAULT false,
            eligible BOOLEAN NOT NULL DEFAULT false,
            request_outcome VARCHAR(32) NOT NULL,
            blocked_reason TEXT,
            notify_result JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await sql.unsafe(`
          CREATE INDEX IF NOT EXISTS idx_admin_deindex_requests_content
          ON admin_deindex_requests (content_type, content_id, created_at DESC)
        `);
        await sql.unsafe(`
          CREATE INDEX IF NOT EXISTS idx_admin_deindex_requests_recent
          ON admin_deindex_requests (requested_url, request_outcome, created_at DESC)
        `);
      } catch (error) {
        ensureTablePromise = null;
        throw error;
      }
    })();
  }

  await ensureTablePromise;
}

function buildDraftOnlyPreflight(
  url: string,
  contentStatus: string,
): DeindexPreflight {
  if (contentStatus !== "published") {
    return {
      url,
      eligible: true,
      publicStatusCode: 404,
      robotsDirective: "noindex, nofollow",
      inSitemap: false,
      contentStatus,
      reasons: [],
    };
  }

  return {
    url,
    eligible: false,
    publicStatusCode: 200,
    robotsDirective: "index, follow",
    inSitemap: true,
    contentStatus,
    reasons: ["Only non-published content can be deindexed."],
  };
}

export function getListingDeindexPreflight(listing: {
  type?: string | null;
  slug?: string | null;
  status?: string | null;
}): DeindexPreflight {
  if (!listing.type || !listing.slug) {
    return {
      url: "",
      eligible: false,
      publicStatusCode: 404,
      robotsDirective: "noindex, nofollow",
      inSitemap: false,
      contentStatus: listing.status || "draft",
      reasons: ["Save the listing before requesting deindex."],
    };
  }

  return buildDraftOnlyPreflight(
    getListingUrl(listing.type, listing.slug),
    listing.status || "draft",
  );
}

export function getBlogPostDeindexPreflight(post: {
  slug?: string | null;
  status?: string | null;
}): DeindexPreflight {
  if (!post.slug) {
    return {
      url: "",
      eligible: false,
      publicStatusCode: 404,
      robotsDirective: "noindex, nofollow",
      inSitemap: false,
      contentStatus: post.status || "draft",
      reasons: ["Save the article before requesting deindex."],
    };
  }

  return buildDraftOnlyPreflight(
    getNewsArticleUrl(post.slug),
    post.status || "draft",
  );
}

async function insertAuditEntry(input: {
  contentType: DeindexContentType;
  contentId: string;
  requestedUrl: string;
  requestedByUserId: string | null;
  requestedByEmail: string | null;
  preflight: DeindexPreflight;
  outcome: DeindexRequestOutcome;
  blockedReason?: string | null;
  notifyResult?: Record<string, unknown>;
}) {
  await ensureDeindexAuditTable();

  const rows = await sql`
    INSERT INTO admin_deindex_requests (
      id,
      content_type,
      content_id,
      requested_url,
      requested_by_user_id,
      requested_by_email,
      content_status,
      public_status_code,
      robots_directive,
      in_sitemap,
      eligible,
      request_outcome,
      blocked_reason,
      notify_result
    )
    VALUES (
      ${randomUUID()},
      ${input.contentType},
      ${input.contentId},
      ${input.requestedUrl},
      ${input.requestedByUserId},
      ${input.requestedByEmail},
      ${input.preflight.contentStatus},
      ${input.preflight.publicStatusCode},
      ${input.preflight.robotsDirective},
      ${input.preflight.inSitemap},
      ${input.preflight.eligible},
      ${input.outcome},
      ${input.blockedReason || null},
      ${JSON.stringify(input.notifyResult || {})}::jsonb
    )
    RETURNING
      id,
      requested_url,
      requested_by_email,
      request_outcome,
      blocked_reason,
      public_status_code,
      robots_directive,
      in_sitemap,
      created_at
  `;

  return rows[0] as unknown as DeindexAuditEntry;
}

export async function getRecentDeindexRequests(
  contentType: DeindexContentType,
  contentId: string,
  limit = 5,
) {
  await ensureDeindexAuditTable();

  const rows = await sql`
    SELECT
      id,
      requested_url,
      requested_by_email,
      request_outcome,
      blocked_reason,
      public_status_code,
      robots_directive,
      in_sitemap,
      created_at
    FROM admin_deindex_requests
    WHERE content_type = ${contentType}
      AND content_id = ${contentId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows as unknown as DeindexAuditEntry[];
}

export async function submitDeindexRequest(input: {
  contentType: DeindexContentType;
  contentId: string;
  requestedByUserId: string;
  requestedByEmail: string;
  preflight: DeindexPreflight;
}) {
  const blockedReason = input.preflight.reasons[0] || null;

  if (!input.preflight.eligible) {
    const auditEntry = await insertAuditEntry({
      contentType: input.contentType,
      contentId: input.contentId,
      requestedUrl: input.preflight.url,
      requestedByUserId: input.requestedByUserId,
      requestedByEmail: input.requestedByEmail,
      preflight: input.preflight,
      outcome: "blocked",
      blockedReason,
    });

    return {
      ok: false,
      auditEntry,
      message: blockedReason || "This URL is not eligible for deindex.",
    };
  }

  await ensureDeindexAuditTable();

  const recentRows = await sql`
    SELECT id, created_at
    FROM admin_deindex_requests
    WHERE requested_url = ${input.preflight.url}
      AND request_outcome = 'requested'
      AND created_at > NOW() - INTERVAL '6 hours'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recentRows.length > 0) {
    const duplicateReason = "A deindex request for this URL was already submitted in the last 6 hours.";
    const auditEntry = await insertAuditEntry({
      contentType: input.contentType,
      contentId: input.contentId,
      requestedUrl: input.preflight.url,
      requestedByUserId: input.requestedByUserId,
      requestedByEmail: input.requestedByEmail,
      preflight: input.preflight,
      outcome: "duplicate",
      blockedReason: duplicateReason,
    });

    return {
      ok: false,
      auditEntry,
      message: duplicateReason,
    };
  }

  const notifyResult = await notifySearchEnginesDetailed([input.preflight.url]);
  const auditEntry = await insertAuditEntry({
    contentType: input.contentType,
    contentId: input.contentId,
    requestedUrl: input.preflight.url,
    requestedByUserId: input.requestedByUserId,
    requestedByEmail: input.requestedByEmail,
    preflight: input.preflight,
    outcome: "requested",
    notifyResult,
  });

  return {
    ok: true,
    auditEntry,
    message:
      "Deindex request submitted. The URL is already non-public; search engines were asked to refresh and remove stale index entries.",
  };
}
