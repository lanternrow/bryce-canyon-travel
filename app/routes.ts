import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Homepage
  index("routes/home.tsx"),

  // All-listings directory page
  route("listings", "routes/directory.tsx", { id: "all-listings" }),

  // Directory pages (each listing type) — options (id) go 3rd, children 4th
  route("dining", "routes/directory.tsx", { id: "dining" }),
  route("lodging", "routes/directory.tsx", { id: "lodging" }),
  route("experiences", "routes/directory.tsx", { id: "experiences" }),
  route("hiking", "routes/directory.tsx", { id: "hiking" }),
  route("transportation", "routes/directory.tsx", { id: "transportation" }),
  route("parks", "routes/directory.tsx", { id: "parks" }),
  route("golf", "routes/directory.tsx", { id: "golf" }),

  // Individual listing detail
  route("listing/:type/:slug", "routes/listing.tsx"),

  // Contact page
  route("contact", "routes/contact.tsx"),

  // News / Blog index
  route("news", "routes/news.tsx"),

  // News category archives
  route("news/category/:categorySlug", "routes/blog-category.tsx"),

  // Legacy category archives redirect to canonical /news/category/{slug}
  route("category/:categorySlug", "routes/redirect-news-category.tsx"),

  // News article detail
  route("news/:slug", "routes/blog-post.tsx"),

  // Public image submission page (token-based, no auth)
  route("submit-images/:token", "routes/submit-images.tsx"),

  // Admin login (standalone — NOT under layout)
  route("admin/login", "routes/admin-login.tsx"),

  // Admin routes — nested under layout with sidebar
  route("admin", "routes/admin-layout.tsx", [
    // Redirect /admin → /admin/dashboard (workaround for React Router v7
    // not navigating from child routes back to index routes via <Link>)
    index("routes/admin-index-redirect.tsx"),
    route("dashboard", "routes/admin-dashboard.tsx"),
    route("listings", "routes/admin-listings.tsx"),
    route("listings/new", "routes/admin-listing-edit.tsx", {
      id: "admin-listing-new",
    }),
    route("listings/:id/edit", "routes/admin-listing-edit.tsx", {
      id: "admin-listing-edit",
    }),
    route("posts", "routes/admin-posts.tsx"),
    route("post-categories", "routes/admin-post-categories.tsx"),
    route("posts/new", "routes/admin-post-edit.tsx", {
      id: "admin-post-new",
    }),
    route("posts/:id/edit", "routes/admin-post-edit.tsx", {
      id: "admin-post-edit",
    }),
    route("media", "routes/admin-media.tsx"),
    route("categories", "routes/admin-categories.tsx"),
    route("reviews", "routes/admin-reviews.tsx"),
    route("keywords", "routes/admin-keywords.tsx"),
    route("settings", "routes/admin-settings.tsx"),
    route("pages", "routes/admin-pages-list.tsx"),
    route("pages/homepage", "routes/admin-homepage.tsx"),
    route("pages/news", "routes/admin-news-page.tsx"),
    route("pages/contact", "routes/admin-contact-page.tsx"),
    route("pages/directory/:slug", "routes/admin-directory-page.tsx", {
      id: "admin-directory-page",
    }),
    route("pages/new", "routes/admin-page-edit.tsx", {
      id: "admin-page-new",
    }),
    route("pages/:slug/edit", "routes/admin-page-edit.tsx", {
      id: "admin-page-edit",
    }),
    route("menus", "routes/admin-menus.tsx"),
    route("redirects", "routes/admin-redirects.tsx"),
    route("monitoring/search", "routes/admin-monitoring-search.tsx"),
    route("monitoring/analytics", "routes/admin-monitoring-analytics.tsx"),
    route("monitoring/speed", "routes/admin-monitoring-speed.tsx"),
    route("monitoring/indexing", "routes/admin-monitoring-indexing.tsx"),
    route("batch-repopulate", "routes/admin-batch-repopulate.tsx"),
    route("discover-listings", "routes/admin-discover-listings.tsx"),
    route("account", "routes/admin-account.tsx"),
  ]),

  // API routes
  route("api/listings", "routes/api.listings.ts"),
  route("api/listings/:id", "routes/api.listing-detail.ts"),
  route("api/cron/refresh-hours", "routes/api.cron-refresh-hours.ts"),
  route("api/cron/refresh-popularity", "routes/api.cron-refresh-popularity.ts"),
  route("api/url-inspection", "routes/api.url-inspection.ts"),
  route("api/upload-image", "routes/api.upload-image.tsx"),
  route("api/ai-image-meta", "routes/api.ai-image-meta.ts"),
  route("api/ai-seo-meta", "routes/api.ai-seo-meta.ts"),
  route("api/ai-readability", "routes/api.ai-readability.ts"),
  route("api/ai-keyphrase", "routes/api.ai-keyphrase.ts"),
  route("api/media-browse", "routes/api.media-browse.ts"),
  route("api/media-meta", "routes/api.media-meta.ts"),
  route("api/check-keyphrase", "routes/api.check-keyphrase.ts"),
  route("api/test-discover", "routes/api.test-discover.ts"),
  route("api/discover-scan", "routes/api.discover-scan.ts"),
  route("api/discover-import", "routes/api.discover-import.ts"),
  route("api/link-search", "routes/api.link-search.ts"),
  route("api/newsletter-subscribe", "routes/api.newsletter-subscribe.ts"),
  route("api/submit-images", "routes/api.submit-images.ts"),
  route("api/debug-listing", "routes/api.debug-listing.ts"),

  // Sitemap & SEO
  route("sitemap.xml", "routes/sitemap[.]xml.ts"),
  route("sitemap-pages.xml", "routes/sitemap-pages[.]xml.ts"),
  route("sitemap-listings.xml", "routes/sitemap-listings[.]xml.ts"),
  route("sitemap-posts.xml", "routes/sitemap-posts[.]xml.ts"),
  route("robots.txt", "routes/robots[.]txt.ts"),
  route("llms.txt", "routes/llms[.]txt.ts"),

  // ============================================================
  // 301 REDIRECTS — Old WordPress URLs → New site structure
  // ============================================================

  // Old /directory/{slug}/ listing pages → /listing/{type}/{slug}
  route("directory/:slug", "routes/redirect-directory.tsx"),

  // Old /at_biz_dir-category/{slug}/ taxonomy → filtered directory pages
  route("at_biz_dir-category/:slug", "routes/redirect-taxonomy.tsx"),

  // Old /at_biz_dir-location/{slug}/ taxonomy → filtered directory pages
  route("at_biz_dir-location/:slug", "routes/redirect-location.tsx"),

  // Custom pages — catch-all MUST be last
  route("*", "routes/custom-page.tsx"),
] satisfies RouteConfig;
