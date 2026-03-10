// Sitemap for all published listings

import { getListings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export async function loader() {
  const baseUrl = siteConfig.siteUrl;

  try {
    const { listings } = await getListings({
      status: "published",
      perPage: 5000,
    });

    const urls = listings
      .map((l: any) => {
        const lastmod = l.updated_at
          ? new Date(l.updated_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        return `  <url>
    <loc>${baseUrl}/listing/${l.type}/${l.slug}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Sitemap listings generation failed:", error);
    // Return valid empty sitemap so Google doesn't see a 500
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
