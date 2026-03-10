// Sitemap for all published news articles

import { getBlogPosts } from "../lib/queries.server";
import { getNewsArticlePath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

export async function loader() {
  const baseUrl = siteConfig.siteUrl;

  try {
    const posts = await getBlogPosts({ status: "published" });

    // Build a set of slugs from DB posts
    const slugSet = new Set<string>();
    const urls: string[] = [];

    for (const p of posts as any[]) {
      if (!p.slug || slugSet.has(p.slug)) continue;
      slugSet.add(p.slug);

      const lastmod = (p.updated_at || p.published_at)
        ? new Date(p.updated_at || p.published_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      urls.push(`  <url>
    <loc>${baseUrl}${getNewsArticlePath(p.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`);
    }

    // Include seed post slugs from site-config that may not be in DB yet
    const HARDCODED_SLUGS = siteConfig.defaults.seedPosts.map((p) => p.slug);

    const today = new Date().toISOString().split("T")[0];
    for (const slug of HARDCODED_SLUGS) {
      if (slugSet.has(slug)) continue;
      slugSet.add(slug);
      urls.push(`  <url>
    <loc>${baseUrl}${getNewsArticlePath(slug)}</loc>
    <lastmod>${today}</lastmod>
  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Sitemap posts generation failed:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`,
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  }
}
