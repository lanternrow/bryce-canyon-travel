// Dynamic robots.txt — references sitemap and respects allow_indexing setting

import { getSettings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export async function loader() {
  let allowIndexing = true;

  try {
    const settings = await getSettings();
    allowIndexing = settings.allow_indexing !== "false";
  } catch {
    // Default to allowing indexing if settings fail
  }

  const baseUrl = siteConfig.siteUrl;

  const content = allowIndexing
    ? `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

# AI Crawlers — welcome
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${baseUrl}/sitemap.xml

# LLM-readable site summary
# See https://llmstxt.org
llms.txt: ${baseUrl}/llms.txt`
    : `User-agent: *
Disallow: /`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
