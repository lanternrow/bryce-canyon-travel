// Sitemap for static pages (home, directories, contact, blog categories)
// + published custom pages

import { getPublishedCustomPages } from "../lib/pages.server";
import { getBlogCategoriesWithPostCounts } from "../lib/queries.server";
import { getNewsCategoryPath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

const STATIC_PAGES = [
  "/",
  "/contact",
  "/news",
  "/listings",
  "/dining",
  "/lodging",
  "/experiences",
  "/hiking",
  "/transportation",
];

export async function loader() {
  const baseUrl = siteConfig.siteUrl;
  const today = new Date().toISOString().split("T")[0];

  const [customPages, blogCategories] = await Promise.all([
    getPublishedCustomPages(),
    getBlogCategoriesWithPostCounts({ includeEmpty: false, status: "published" }),
  ]);
  const customPageUrls = customPages.map((p) => `/${p.slug}`);
  const categoryUrls = (blogCategories as any[]).map((category) => getNewsCategoryPath(category.slug));

  const allPages = [...STATIC_PAGES, ...categoryUrls, ...customPageUrls];

  const urls = allPages.map(
    (path) => `  <url>
    <loc>${baseUrl}${path}</loc>
    <lastmod>${today}</lastmod>
  </url>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
