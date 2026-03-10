import sql from "./db.server";

// ── Types ──────────────────────────────────────

export interface CustomPage {
  id: string;
  slug: string;
  title: string;
  body: string | null;
  status: "draft" | "published";
  page_type: "system" | "custom";
  meta_title: string | null;
  meta_description: string | null;
  focus_keyphrase: string | null;
  og_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemPage {
  slug: string;
  title: string;
  content: Record<string, any>;
  status: "draft" | "published";
  meta_title: string | null;
  meta_description: string | null;
  focus_keyphrase: string | null;
  og_image: string | null;
  updated_at: string;
}

function parsePageContent(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, any>;
  }
  return {};
}

// ── System page functions ──────────────────────

export async function getSystemPage(slug: string): Promise<SystemPage | null> {
  const rows = await sql`
    SELECT slug, title, content, status, meta_title, meta_description, focus_keyphrase, og_image, updated_at
    FROM pages
    WHERE slug = ${slug} AND page_type = 'system'
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  const row = rows[0] as any;
  return {
    slug: row.slug,
    title: row.title || slug,
    content: parsePageContent(row.content),
    status: row.status || "published",
    meta_title: row.meta_title ?? null,
    meta_description: row.meta_description ?? null,
    focus_keyphrase: row.focus_keyphrase ?? null,
    og_image: row.og_image ?? null,
    updated_at: row.updated_at,
  };
}

export async function upsertSystemPage(input: {
  slug: string;
  title?: string;
  content: Record<string, any>;
  meta_title?: string | null;
  meta_description?: string | null;
  focus_keyphrase?: string | null;
  og_image?: string | null;
  status?: "draft" | "published";
}): Promise<void> {
  const title = (input.title || input.slug).trim() || input.slug;
  const status = input.status || "published";

  await sql`
    INSERT INTO pages (
      slug,
      title,
      content,
      page_type,
      status,
      meta_title,
      meta_description,
      focus_keyphrase,
      og_image,
      updated_at
    )
    VALUES (
      ${input.slug},
      ${title},
      ${sql.json(input.content || {})},
      'system',
      ${status},
      ${input.meta_title ?? null},
      ${input.meta_description ?? null},
      ${input.focus_keyphrase ?? null},
      ${input.og_image ?? null},
      NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET
      title = ${title},
      content = ${sql.json(input.content || {})},
      status = ${status},
      meta_title = ${input.meta_title ?? null},
      meta_description = ${input.meta_description ?? null},
      focus_keyphrase = ${input.focus_keyphrase ?? null},
      og_image = ${input.og_image ?? null},
      updated_at = NOW()
  `;
}

// ── Legacy convenience functions ───────────────

export async function getPageContent(
  slug: string
): Promise<Record<string, any> | null> {
  const page = await getSystemPage(slug);
  return page?.content || null;
}

export async function updatePageContent(
  slug: string,
  content: Record<string, any>
) {
  const existing = await getSystemPage(slug);
  await upsertSystemPage({
    slug,
    title: existing?.title || slug,
    content,
    meta_title: existing?.meta_title ?? null,
    meta_description: existing?.meta_description ?? null,
    focus_keyphrase: existing?.focus_keyphrase ?? null,
    og_image: existing?.og_image ?? null,
    status: "published",
  });
}

// ── Custom page functions ──────────────────────

/** Reserved slugs that custom pages cannot use */
const RESERVED_SLUGS = new Set([
  "home", "listings", "dining", "lodging", "experiences", "hiking", "transportation",
  "parks", "golf", "news", "contact", "admin", "api", "listing", "category",
  "directory", "sitemap.xml", "robots.txt", "llms.txt",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export async function getCustomPages(): Promise<CustomPage[]> {
  const rows = await sql`
    SELECT id, slug, title, body, status, page_type, meta_title, meta_description,
           focus_keyphrase, og_image, created_at, updated_at
    FROM pages
    WHERE page_type = 'custom'
    ORDER BY title ASC
  `;
  return rows as unknown as CustomPage[];
}

export async function getCustomPageBySlug(slug: string): Promise<CustomPage | null> {
  const rows = await sql`
    SELECT id, slug, title, body, status, page_type, meta_title, meta_description,
           focus_keyphrase, og_image, created_at, updated_at
    FROM pages
    WHERE slug = ${slug} AND page_type = 'custom'
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as unknown as CustomPage;
}

export async function getPublishedCustomPage(slug: string): Promise<CustomPage | null> {
  const rows = await sql`
    SELECT id, slug, title, body, status, page_type, meta_title, meta_description,
           focus_keyphrase, og_image, created_at, updated_at
    FROM pages
    WHERE slug = ${slug} AND page_type = 'custom' AND status = 'published'
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as unknown as CustomPage;
}

export async function getPublishedCustomPages(): Promise<CustomPage[]> {
  const rows = await sql`
    SELECT id, slug, title, body, status, page_type, meta_title, meta_description,
           focus_keyphrase, og_image, created_at, updated_at
    FROM pages
    WHERE page_type = 'custom' AND status = 'published'
    ORDER BY title ASC
  `;
  return rows as unknown as CustomPage[];
}

export async function createCustomPage(data: {
  title: string;
  slug: string;
  body?: string;
  status?: string;
  meta_title?: string;
  meta_description?: string;
  focus_keyphrase?: string;
  og_image?: string;
}): Promise<CustomPage> {
  const rows = await sql`
    INSERT INTO pages (id, slug, title, body, status, page_type, content, meta_title, meta_description, focus_keyphrase, og_image, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${data.slug},
      ${data.title},
      ${data.body || ""},
      ${data.status || "draft"},
      'custom',
      '{}'::jsonb,
      ${data.meta_title || null},
      ${data.meta_description || null},
      ${data.focus_keyphrase || null},
      ${data.og_image || null},
      NOW(),
      NOW()
    )
    RETURNING id, slug, title, body, status, page_type, meta_title, meta_description, focus_keyphrase, og_image, created_at, updated_at
  `;
  return rows[0] as unknown as CustomPage;
}

export async function updateCustomPage(
  slug: string,
  data: {
    title?: string;
    slug?: string;
    body?: string;
    status?: string;
    meta_title?: string;
    meta_description?: string;
    focus_keyphrase?: string;
    og_image?: string;
  }
): Promise<void> {
  await sql`
    UPDATE pages SET
      title = COALESCE(${data.title || null}, title),
      slug = COALESCE(${data.slug || null}, slug),
      body = COALESCE(${data.body ?? null}, body),
      status = COALESCE(${data.status || null}, status),
      meta_title = ${data.meta_title ?? null},
      meta_description = ${data.meta_description ?? null},
      focus_keyphrase = ${data.focus_keyphrase ?? null},
      og_image = ${data.og_image ?? null},
      updated_at = NOW()
    WHERE slug = ${slug} AND page_type = 'custom'
  `;
}

export async function deleteCustomPage(slug: string): Promise<void> {
  await sql`
    DELETE FROM pages WHERE slug = ${slug} AND page_type = 'custom'
  `;
}
