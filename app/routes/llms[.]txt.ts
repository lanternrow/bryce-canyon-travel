// ============================================
// llms.txt — LLM-friendly site description
// ============================================
// Follows the emerging llms.txt standard: a plain-text
// Markdown file that helps AI assistants understand
// the site structure and content at a glance.
// ============================================

import { getBlogPosts, getListings } from "../lib/queries.server";
import { getNewsArticlePath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

const BASE_URL = siteConfig.siteUrl;

export async function loader() {
  // Fetch published content for link lists
  const [posts, dining, lodging, experiences, hiking, transportation, parks, golf] = await Promise.all([
    getBlogPosts({ status: "published", limit: 50 }),
    getListings({ type: "dining", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "lodging", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "experiences", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "hiking", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "transportation", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "parks", status: "published", perPage: 100, sort: "name_asc" }),
    getListings({ type: "golf", status: "published", perPage: 100, sort: "name_asc" }),
  ]);

  const lines: string[] = [];

  // Header
  lines.push(`# ${siteConfig.siteName}`);
  lines.push("");
  lines.push(`> ${siteConfig.defaults.llmsDescription}`);
  lines.push("");

  // Main pages
  lines.push("## Main Pages");
  lines.push("");
  lines.push(`- [Home](${BASE_URL}/)`);
  lines.push(`- [Dining Directory](${BASE_URL}/dining)`);
  lines.push(`- [Lodging Directory](${BASE_URL}/lodging)`);
  lines.push(`- [Experiences Directory](${BASE_URL}/experiences)`);
  lines.push(`- [Hiking Directory](${BASE_URL}/hiking)`);
  lines.push(`- [Transportation Directory](${BASE_URL}/transportation)`);
  lines.push(`- [Parks & Landscapes Directory](${BASE_URL}/parks)`);
  lines.push(`- [Golf Courses Directory](${BASE_URL}/golf)`);
  lines.push(`- [News Articles](${BASE_URL}/news)`);
  lines.push(`- [Contact](${BASE_URL}/contact)`);
  lines.push("");

  // News articles
  if ((posts as any[]).length > 0) {
    lines.push("## News Articles");
    lines.push("");
    for (const post of posts as any[]) {
      const title = post.meta_title || post.title;
      lines.push(`- [${title}](${BASE_URL}${getNewsArticlePath(post.slug)})`);
    }
    lines.push("");
  }

  // Listings by type
  const listingGroups = [
    { label: "Dining", listings: dining },
    { label: "Lodging", listings: lodging },
    { label: "Experiences", listings: experiences },
    { label: "Hiking", listings: hiking },
    { label: "Transportation", listings: transportation },
    { label: "Parks & Landscapes", listings: parks },
    { label: "Golf Courses", listings: golf },
  ];

  for (const group of listingGroups) {
    const items = (group.listings as any).listings || [];
    if (items.length > 0) {
      lines.push(`## ${group.label}`);
      lines.push("");
      for (const listing of items) {
        lines.push(`- [${listing.name}](${BASE_URL}/listing/${listing.type}/${listing.slug})`);
      }
      lines.push("");
    }
  }

  const content = lines.join("\n");

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
