import type { Route } from "./+types/home";
import { useState } from "react";
import { Link } from "react-router";
import ListingCard from "../components/ListingCard";
import type { Listing } from "../lib/types";
import { formatLongDate } from "../lib/format";
import { getBlogPosts, getListings } from "../lib/queries.server";
import { getSystemPage } from "../lib/pages.server";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { getNewsArticlePath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";
import { cfHero, cfCard } from "../lib/image-utils";

// ---------------------------------------------------------------------------
// Defaults (used when DB has no overrides)
// ---------------------------------------------------------------------------
const DEFAULT_HOME = {
  hero: {
    subtitle: siteConfig.defaults.heroSubtitle,
    title_line1: siteConfig.defaults.heroLine1,
    title_line2: siteConfig.defaults.heroLine2,
    title_accent: siteConfig.defaults.heroAccent,
    description: siteConfig.defaults.heroDescription,
    search_placeholder: siteConfig.defaults.searchPlaceholder,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#2c2418",
    gradient_via: "#92400e",
    gradient_to: "#c1440e",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    accent_line: "line3",
    title_size_mobile: 36,
    title_size_desktop: 72,
    title_color: "#ffffff",
    accent_color: "#d4a574",
    hero_max_width: 1024,
  },
  explore: {
    title: siteConfig.defaults.exploreTitle,
    subtitle: siteConfig.defaults.exploreSubtitle,
  },
  featured: {
    title: "Featured Listings",
    subtitle: siteConfig.defaults.featuredSubtitle,
  },
  popular: {
    title: "Popular Listings",
    subtitle: "Trending spots travelers are viewing most right now.",
  },
  popular_posts: {
    title: "Popular News Articles",
    subtitle: siteConfig.defaults.popularPostsSubtitle,
  },
  recent_posts: {
    title: "Recent News Articles",
    subtitle: siteConfig.defaults.recentPostsSubtitle,
  },
  plan_your_visit: {
    title: "Plan Your Visit",
    subtitle: siteConfig.defaults.planVisitSubtitle,
    cards: [
      {
        icon: "sun",
        title: "Weather & Seasons",
        body: siteConfig.defaults.weatherCard,
      },
      {
        icon: "map",
        title: "Getting There",
        body: siteConfig.defaults.gettingThereCard,
      },
      {
        icon: "calendar",
        title: "Best Time to Visit",
        body: siteConfig.defaults.bestTimeCard,
      },
    ],
  },
  newsletter: {
    title: "Stay in the Loop",
    subtitle: siteConfig.defaults.newsletterSubtitle,
    disclaimer: "We respect your privacy. Unsubscribe at any time.",
  },
};

const DEFAULT_HOME_SEO = {
  meta_title: siteConfig.defaults.homeSeoTitle,
  meta_description: siteConfig.defaults.homeSeoDescription,
  og_image: "",
};

function normalizeFocal(value: unknown, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function getObjectPosition(x: unknown, y: unknown) {
  return `${normalizeFocal(x)}% ${normalizeFocal(y)}%`;
}

function mergeHomeContent(pageContent: any) {
  if (!pageContent) return DEFAULT_HOME;

  const incomingCards = Array.isArray(pageContent?.plan_your_visit?.cards)
    ? pageContent.plan_your_visit.cards
    : [];
  const cards = DEFAULT_HOME.plan_your_visit.cards.map((defaultCard, index) => ({
    ...defaultCard,
    ...(incomingCards[index] || {}),
  }));

  return {
    ...DEFAULT_HOME,
    ...pageContent,
    hero: {
      ...DEFAULT_HOME.hero,
      ...(pageContent.hero || {}),
    },
    explore: {
      ...DEFAULT_HOME.explore,
      ...(pageContent.explore || {}),
    },
    featured: {
      ...DEFAULT_HOME.featured,
      ...(pageContent.featured || {}),
    },
    popular: {
      ...DEFAULT_HOME.popular,
      ...(pageContent.popular || {}),
    },
    popular_posts: {
      ...DEFAULT_HOME.popular_posts,
      ...(pageContent.popular_posts || {}),
    },
    recent_posts: {
      ...DEFAULT_HOME.recent_posts,
      ...(pageContent.recent_posts || {}),
    },
    plan_your_visit: {
      ...DEFAULT_HOME.plan_your_visit,
      ...(pageContent.plan_your_visit || {}),
      cards,
    },
    newsletter: {
      ...DEFAULT_HOME.newsletter,
      ...(pageContent.newsletter || {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
export function meta({ data, matches }: Route.MetaArgs) {
  const seo = (data as any)?.seo || {};
  const seoTitle = seo.meta_title || DEFAULT_HOME_SEO.meta_title;
  const seoDescription = seo.meta_description || DEFAULT_HOME_SEO.meta_description;
  const ogImage = seo.og_image || "";
  const siteName = getSiteName(matches);

  const tags: Array<Record<string, string>> = [
    { title: formatPageTitle(seoTitle, matches) },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: `${siteConfig.siteUrl}/` },

    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: `${siteConfig.siteUrl}/` },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },

    // Twitter Card
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];

  if (ogImage) {
    tags.push({ property: "og:image", content: ogImage });
    tags.push({ name: "twitter:image", content: ogImage });
  }

  // Preload hero image for faster LCP
  const heroImage = (data as any)?.content?.hero?.bg_image;
  if (heroImage) {
    tags.push({ tagName: "link", rel: "preload", as: "image", href: cfHero(heroImage) });
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export async function loader({}: Route.LoaderArgs) {
  const [result, popularResult, popularPostsResult, recentPostsResult, page] = await Promise.all([
    getListings({ sort: "default", perPage: 6 }),
    getListings({ popular: "popular", perPage: 20, sort: "popular_desc" }),
    getBlogPosts({ status: "published", popular: "popular", sort: "popular_desc", limit: 12 }),
    getBlogPosts({ status: "published", sort: "newest", limit: 3 }),
    getSystemPage("home"),
  ]);

  const content = mergeHomeContent(page?.content);

  // Random assortment of popular listings (up to 6 cards)
  const shuffledPopular = [...(popularResult.listings as Listing[])]
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
  const shuffledPopularPosts = [...(popularPostsResult as any[])]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const recentPosts = (recentPostsResult as any[]).slice(0, 3);

  // Batch-fetch media metadata for listing + post images used on homepage cards
  const imageUrls = Array.from(
    new Set(
      [...result.listings, ...shuffledPopular, ...shuffledPopularPosts, ...recentPosts]
        .map((item: any) => item.featured_image)
        .filter((u: any): u is string => !!u)
    )
  );
  const mediaMetadata = await buildMediaMetadata(imageUrls);

  return {
    featured: result.listings,
    popular: shuffledPopular,
    popularPosts: shuffledPopularPosts,
    recentPosts,
    content,
    seo: {
      meta_title: page?.meta_title || DEFAULT_HOME_SEO.meta_title,
      meta_description: page?.meta_description || DEFAULT_HOME_SEO.meta_description,
      og_image: page?.og_image || DEFAULT_HOME_SEO.og_image,
    },
    mediaMetadata,
  };
}

// ---------------------------------------------------------------------------
// Explore directory cards config
// ---------------------------------------------------------------------------
const exploreCards = [
  {
    label: "Dining",
    href: "/dining",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C10 2 9 4 9 6c0 2.5 2 4 3 5v11h0V11c1-1 3-2.5 3-5 0-2-1-4-3-4zM4 2v7c0 1.1.9 2 2 2h1v11h2V11h1c1.1 0 2-.9 2-2V2M4 5h8" />
      </svg>
    ),
    description: "Restaurants & cafes",
    color: "from-orange-500 to-red-600",
  },
  {
    label: "Lodging",
    href: "/lodging",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 20v-8l10-7 10 7v8H2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20v-5h6v5" />
      </svg>
    ),
    description: "Hotels, cabins & camps",
    color: "from-amber-500 to-orange-600",
  },
  {
    label: "Experiences",
    href: "/experiences",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    description: "Tours & adventures",
    color: "from-emerald-500 to-teal-600",
  },
  {
    label: "Hiking",
    href: "/hiking",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21l6-6 4 4 8-10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9h4v4" />
      </svg>
    ),
    description: "Trails & viewpoints",
    color: "from-green-600 to-emerald-700",
  },
  {
    label: "Transportation",
    href: "/transportation",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6H4a1 1 0 00-1 1v8a1 1 0 001 1m9 0h-1m1 0h2m4 0h1a1 1 0 001-1v-3.28a1 1 0 00-.684-.948l-3.923-1.306A1 1 0 0016 7.72V6h-3" />
      </svg>
    ),
    description: "Shuttles & rentals",
    color: "from-sky-500 to-blue-600",
  },
];

// Icon lookup for Plan Your Visit cards
const cardIcons: Record<string, React.ReactNode> = {
  sun: (
    <svg className="w-6 h-6 text-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  ),
  map: (
    <svg className="w-6 h-6 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  ),
  calendar: (
    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
};

const cardIconBg: Record<string, string> = {
  sun: "bg-sky/20",
  map: "bg-sage/20",
  calendar: "bg-primary/10",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HomePage({ loaderData }: Route.ComponentProps) {
  const { featured, popular, popularPosts, recentPosts, content, mediaMetadata } = loaderData;
  const c = content as typeof DEFAULT_HOME;

  // Newsletter subscription state
  const [nlEmail, setNlEmail] = useState("");
  const [nlStatus, setNlStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [nlMessage, setNlMessage] = useState("");

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlEmail.trim() || nlStatus === "loading") return;
    setNlStatus("loading");
    try {
      const res = await fetch("/api/newsletter-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nlEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setNlStatus("success");
        setNlMessage(data.message);
        setNlEmail("");
      } else {
        setNlStatus("error");
        setNlMessage(data.message || "Something went wrong.");
      }
    } catch {
      setNlStatus("error");
      setNlMessage("Network error. Please try again.");
    }
  };

  // Hero background values with fallbacks
  const hero = c.hero as typeof DEFAULT_HOME.hero;
  const gradFrom = hero.gradient_from || "#2c2418";
  const gradVia = hero.gradient_via || "#92400e";
  const gradTo = hero.gradient_to || "#c1440e";
  const gradOpacity = typeof hero.gradient_opacity === "number" ? hero.gradient_opacity : 100;
  const gradDir = hero.gradient_direction || "to-br";

  // Map direction key to CSS gradient direction
  const directionCSS: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-t": "to top",
    "to-bl": "to bottom left",
  };
  const gradientBg =
    gradDir === "radial"
      ? `radial-gradient(circle, ${gradFrom}, ${gradVia}, ${gradTo})`
      : `linear-gradient(${directionCSS[gradDir] || "to bottom right"}, ${gradFrom}, ${gradVia}, ${gradTo})`;

  // Accent line + responsive title sizing
  const accentLine = (hero as any).accent_line || "line3";
  const mobilePx = (hero as any).title_size_mobile || 36;
  const desktopPx = (hero as any).title_size_desktop || 72;
  const titleFontSize = `clamp(${mobilePx}px, 5vw + 0.5rem, ${desktopPx}px)`;
  const titleColor = (hero as any).title_color || "#ffffff";
  const accentColor = (hero as any).accent_color || "#d4a574";
  const heroMaxWidth = (hero as any).hero_max_width || 1024;

  const titleLines = [
    { key: "line1", text: c.hero.title_line1 },
    { key: "line2", text: c.hero.title_line2 },
    { key: "line3", text: c.hero.title_accent },
  ];

  return (
    <>
        {/* ---------------------------------------------------------------- */}
        {/* HERO                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative h-[75vh] min-h-[560px] flex items-center justify-center overflow-hidden">
          {/* Background image (if set) */}
          {hero.bg_image && (
            <img
              src={cfHero(hero.bg_image)}
              alt=""
              width={1920}
              height={1080}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                objectPosition: getObjectPosition(
                  (hero as any).bg_image_focal_x,
                  (hero as any).bg_image_focal_y
                ),
              }}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              aria-hidden="true"
            />
          )}
          {/* Gradient — either full background or overlay on image */}
          <div
            className="absolute inset-0"
            style={{ background: gradientBg, opacity: gradOpacity / 100 }}
          />

          <div className="relative z-10 text-center px-4 mx-auto" style={{ maxWidth: `${heroMaxWidth}px` }}>
            <p className="text-sand/90 uppercase tracking-[0.25em] text-sm font-medium mb-4">
              {c.hero.subtitle}
            </p>
            <h1
              className="font-black tracking-tight leading-[1.1] drop-shadow-lg"
              style={{ fontSize: titleFontSize, color: titleColor }}
            >
              {titleLines.map((line) => (
                <span
                  key={line.key}
                  className="block"
                  style={line.key === accentLine ? { color: accentColor } : undefined}
                >
                  {line.text}
                </span>
              ))}
            </h1>
            <p className="mt-6 text-lg md:text-xl text-white/80 font-light max-w-2xl mx-auto leading-relaxed">
              {c.hero.description}
            </p>

            {/* Search bar */}
            <div className="mt-10 max-w-xl mx-auto">
              <form
                action="/listings"
                method="get"
                className="flex items-center bg-white rounded-full shadow-2xl overflow-hidden"
              >
                <div className="flex items-center pl-5 pr-2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="q"
                  placeholder={c.hero.search_placeholder}
                  className="flex-1 py-4 pr-2 text-gray-800 placeholder-gray-400 focus:outline-none text-base"
                />
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-3 m-1.5 rounded-full transition-colors text-sm tracking-wide"
                >
                  Search
                </button>
              </form>
            </div>
          </div>

        </section>

        {/* ---------------------------------------------------------------- */}
        {/* EXPLORE ZION                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-20 bg-white">
          <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                {c.explore.title}
              </h2>
              <p className="mt-3 text-gray-600 text-lg max-w-xl mx-auto">
                {c.explore.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
              {exploreCards.map((card) => (
                <Link
                  key={card.href}
                  to={card.href}
                  className="group relative flex flex-col items-center p-6 md:p-8 rounded-2xl bg-cream/50 border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {card.icon}
                  </div>
                  <h3 className="font-semibold text-dark text-base">
                    {card.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{card.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* FEATURED LISTINGS                                                */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-20 bg-cream/30">
          <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                  {c.featured.title}
                </h2>
                <p className="mt-2 text-gray-600 text-lg">
                  {c.featured.subtitle}
                </p>
              </div>
              <Link
                to="/dining"
                className="hidden sm:inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
              >
                View All
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {featured.map((listing: Listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  mediaAlt={listing.featured_image ? mediaMetadata?.[listing.featured_image]?.alt_text : undefined}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* POPULAR POSTS                                                    */}
        {/* ---------------------------------------------------------------- */}
        {popularPosts.length > 0 && (
          <section className="py-20 bg-white">
            <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                    {c.popular_posts.title}
                  </h2>
                  <p className="mt-2 text-gray-600 text-lg">
                    {c.popular_posts.subtitle}
                  </p>
                </div>
                <Link
                  to="/news"
                  className="hidden sm:inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                >
                  View All Articles
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {(popularPosts as any[]).map((post: any) => (
                  <Link key={post.id} to={getNewsArticlePath(post.slug)} className="group">
                    <article className="listing-card h-full flex flex-col">
                      <div className="relative h-48 overflow-hidden">
                        {post.featured_image ? (
                          <img
                            src={cfCard(post.featured_image)}
                            alt={mediaMetadata?.[post.featured_image]?.alt_text || post.title}
                            width={400}
                            height={192}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="h-full bg-gradient-to-br from-sage/30 to-sand/30" />
                        )}
                        {post.is_popular && (
                          <div className="absolute top-3 left-3">
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              Popular
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                            {post.category || "Article"}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-dark leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </h3>
                        <time className="text-sm text-gray-500 mb-3 block">
                          {post.published_at ? formatLongDate(post.published_at) : ""}
                        </time>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                        <span className="inline-block mt-4 text-sm font-semibold text-primary group-hover:underline">
                          Read Article →
                        </span>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PLAN YOUR VISIT                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-20 bg-cream/30">
          <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                {c.plan_your_visit.title}
              </h2>
              <p className="mt-3 text-gray-600 text-lg max-w-xl mx-auto">
                {c.plan_your_visit.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {c.plan_your_visit.cards.map((card: any, i: number) => {
                const icon = cardIcons[card.icon] || cardIcons.sun;
                const iconBg = cardIconBg[card.icon] || cardIconBg.sun;
                return (
                  <div key={i} className="bg-white rounded-2xl p-8 border border-gray-200">
                    <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-5`}>
                      {icon}
                    </div>
                    <h3 className="text-xl font-semibold text-dark mb-3">
                      {card.title}
                    </h3>
                    <p className="text-gray-600 leading-relaxed text-sm">
                      {card.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* POPULAR LISTINGS                                                 */}
        {/* ---------------------------------------------------------------- */}
        {popular.length > 0 && (
          <section className="py-20 bg-white">
            <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                    {c.popular.title}
                  </h2>
                  <p className="mt-2 text-gray-600 text-lg">
                    {c.popular.subtitle}
                  </p>
                </div>
                <Link
                  to="/listings"
                  className="hidden sm:inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                >
                  View All
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {popular.map((listing: Listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    mediaAlt={listing.featured_image ? mediaMetadata?.[listing.featured_image]?.alt_text : undefined}
                    showPopularityBadge
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* RECENT BLOG POSTS                                                */}
        {/* ---------------------------------------------------------------- */}
        {recentPosts.length > 0 && (
          <section className="py-20 bg-cream/30">
            <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                    {c.recent_posts.title}
                  </h2>
                  <p className="mt-2 text-gray-600 text-lg">
                    {c.recent_posts.subtitle}
                  </p>
                </div>
                <Link
                  to="/news"
                  className="hidden sm:inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                >
                  View All Articles
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {(recentPosts as any[]).map((post: any) => (
                  <Link key={post.id} to={getNewsArticlePath(post.slug)} className="group">
                    <article className="listing-card h-full flex flex-col">
                      <div className="relative h-48 overflow-hidden">
                        {post.featured_image ? (
                          <img
                            src={cfCard(post.featured_image)}
                            alt={mediaMetadata?.[post.featured_image]?.alt_text || post.title}
                            width={400}
                            height={192}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="h-full bg-gradient-to-br from-sage/30 to-sand/30" />
                        )}
                        {post.is_popular && (
                          <div className="absolute top-3 left-3">
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              Popular
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                            {post.category || "Article"}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-dark leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </h3>
                        <time className="text-sm text-gray-500 mb-3 block">
                          {post.published_at ? formatLongDate(post.published_at) : ""}
                        </time>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                        <span className="inline-block mt-4 text-sm font-semibold text-primary group-hover:underline">
                          Read Article →
                        </span>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* NEWSLETTER                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="py-20 bg-dark">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {c.newsletter.title}
            </h2>
            <p className="mt-4 text-gray-400 text-lg leading-relaxed">
              {c.newsletter.subtitle}
            </p>
            <form
              onSubmit={handleNewsletterSubmit}
              className="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
            >
              <input
                type="email"
                placeholder="Enter your email"
                value={nlEmail}
                onChange={(e) => { setNlEmail(e.target.value); if (nlStatus !== "idle") setNlStatus("idle"); }}
                className="flex-1 px-5 py-3.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sand focus:ring-1 focus:ring-sand/50 text-base"
                required
                disabled={nlStatus === "loading"}
              />
              <button
                type="submit"
                disabled={nlStatus === "loading"}
                className="px-8 py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors tracking-wide text-sm whitespace-nowrap disabled:opacity-60"
              >
                {nlStatus === "loading" ? "Subscribing…" : "Subscribe"}
              </button>
            </form>
            {nlMessage && (
              <p className={`mt-3 text-sm ${nlStatus === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {nlMessage}
              </p>
            )}
            <p className="mt-4 text-xs text-gray-500">
              {c.newsletter.disclaimer}
            </p>
          </div>
        </section>
    </>
  );
}
