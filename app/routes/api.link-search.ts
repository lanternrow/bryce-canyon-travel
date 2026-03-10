// API endpoint for searching internal content (listings, posts, pages)
// Used by the RichTextEditor inline link popup

import sql from "../lib/db.server";
import { getNewsArticlePath } from "../lib/news-url";
import { requireApiAuth } from "../lib/auth.server";

export async function loader({ request }: { request: Request }) {
  await requireApiAuth(request);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q || q.length < 2) {
    return Response.json({ results: [] });
  }

  const pattern = `%${q}%`;

  // Search listings, posts, and pages in parallel
  const [listings, posts, pages] = await Promise.all([
    sql`
      SELECT name AS title, slug, type,
             'listing' AS content_type
      FROM listings
      WHERE status = 'published'
        AND (name ILIKE ${pattern} OR tagline ILIKE ${pattern})
      ORDER BY name ASC
      LIMIT 8
    `,
    sql`
      SELECT title, slug,
             'post' AS content_type
      FROM blog_posts
      WHERE status = 'published'
        AND (title ILIKE ${pattern} OR excerpt ILIKE ${pattern})
      ORDER BY title ASC
      LIMIT 5
    `,
    sql`
      SELECT title, slug,
             'page' AS content_type
      FROM pages
      WHERE page_type = 'custom' AND status = 'published'
        AND (title ILIKE ${pattern} OR slug ILIKE ${pattern})
      ORDER BY title ASC
      LIMIT 5
    `,
  ]);

  // Build URLs for each result
  const results = [
    ...listings.map((l: any) => ({
      title: l.title,
      url: `/listing/${l.type}/${l.slug}`,
      type: l.type,
      contentType: "listing" as const,
    })),
    ...posts.map((p: any) => ({
      title: p.title,
      url: getNewsArticlePath(p.slug),
      type: null,
      contentType: "post" as const,
    })),
    ...pages.map((pg: any) => ({
      title: pg.title,
      url: `/${pg.slug}`,
      type: null,
      contentType: "page" as const,
    })),
  ];

  // Sort combined results alphabetically
  results.sort((a, b) => a.title.localeCompare(b.title));

  return Response.json({ results: results.slice(0, 12) });
}
