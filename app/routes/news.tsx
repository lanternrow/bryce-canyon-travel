import { Link } from "react-router";
import type { Route } from "./+types/news";
import { getBlogPosts, getBlogCategoriesWithPostCounts } from "../lib/queries.server";
import { formatLongDate } from "../lib/format";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { getSystemPage } from "../lib/pages.server";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { getNewsArticlePath, getNewsCategoryPath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";
import { cfHero, cfCard } from "../lib/image-utils";

export function meta({ data, matches }: Route.MetaArgs) {
  const seo = (data as any)?.seo || {};
  const seoTitle = seo.meta_title || "News & Guides";
  const seoDescription =
    seo.meta_description ||
    `Latest news, travel guides, and tips for visiting ${siteConfig.parkName}. Plan your perfect trip with advice from local experts.`;
  const ogImage = seo.og_image || "";
  const siteName = getSiteName(matches);

  const tags: Array<Record<string, string>> = [
    { title: formatPageTitle(seoTitle, matches) },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: `${siteConfig.siteUrl}/news` },

    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: `${siteConfig.siteUrl}/news` },
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

  return tags;
}

const DEFAULT_NEWS_PAGE = {
  hero: {
    title: "NEWS & GUIDES",
    subtitle: siteConfig.defaults.newsHeroSubtitle,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#111827",
    gradient_via: "#1f2937",
    gradient_to: "#111827",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    height: 300,
    title_size_mobile: 48,
    title_size_desktop: 64,
    title_color: "#ffffff",
    subtitle_color: "#d1d5db",
  },
};

const DEFAULT_NEWS_SEO = {
  meta_title: siteConfig.defaults.newsSeoTitle,
  meta_description: siteConfig.defaults.newsSeoDescription,
  og_image: "",
};

function mergeNewsContent(pageContent: any) {
  if (!pageContent) return DEFAULT_NEWS_PAGE;
  return {
    ...DEFAULT_NEWS_PAGE,
    ...pageContent,
    hero: {
      ...DEFAULT_NEWS_PAGE.hero,
      ...(pageContent.hero || {}),
    },
  };
}

function normalizeFocal(value: unknown, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function getObjectPosition(x: unknown, y: unknown) {
  return `${normalizeFocal(x)}% ${normalizeFocal(y)}%`;
}

function getGradientBackground(hero: {
  gradient_from?: string;
  gradient_via?: string;
  gradient_to?: string;
  gradient_direction?: string;
}) {
  const from = hero.gradient_from || "#111827";
  const via = hero.gradient_via || "#1f2937";
  const to = hero.gradient_to || "#111827";
  const direction = hero.gradient_direction || "to-br";
  const directionCss: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-bl": "to bottom left",
  };

  if (direction === "radial") {
    return `radial-gradient(circle, ${from}, ${via}, ${to})`;
  }
  return `linear-gradient(${directionCss[direction] || "to bottom right"}, ${from}, ${via}, ${to})`;
}

export async function loader({}: Route.LoaderArgs) {
  const [posts, categories, page] = await Promise.all([
    getBlogPosts({ status: "published", limit: 50 }),
    getBlogCategoriesWithPostCounts({ includeEmpty: false, status: "published" }),
    getSystemPage("news"),
  ]);

  // Batch-fetch media metadata for post featured images
  const imageUrls = (posts as any[])
    .map((p: any) => p.featured_image)
    .filter((u: any): u is string => !!u);
  const mediaMetadata = await buildMediaMetadata(imageUrls);

  return {
    posts,
    categories,
    mediaMetadata,
    content: mergeNewsContent(page?.content),
    seo: {
      meta_title: page?.meta_title || DEFAULT_NEWS_SEO.meta_title,
      meta_description: page?.meta_description || DEFAULT_NEWS_SEO.meta_description,
      og_image: page?.og_image || DEFAULT_NEWS_SEO.og_image,
    },
  };
}

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  category_slug: string | null;
  featured_image: string | null;
  published_at: string | null;
  read_time: string | null;
  is_popular?: boolean;
  views_30d?: number;
};

type BlogCategory = {
  id?: number;
  name: string;
  slug: string;
  post_count?: number;
};

// Fallback static posts in case DB has none (sourced from site-config)
const fallbackPosts: BlogPost[] = siteConfig.defaults.seedPosts.map((p) => ({
  ...p,
  featured_image: null,
}));

export default function NewsPage({ loaderData }: Route.ComponentProps) {
  const { posts: rawPosts, categories: rawCategories, mediaMetadata, content } = loaderData;
  const dbPosts = rawPosts as unknown as BlogPost[];
  const dbCategories = rawCategories as unknown as BlogCategory[];
  const pageContent = content as typeof DEFAULT_NEWS_PAGE;
  const hero = pageContent.hero;
  const posts = dbPosts.length > 0 ? dbPosts : fallbackPosts;
  const categories = dbCategories.length > 0
    ? dbCategories
    : Array.from(
        new Map(
          fallbackPosts
            .filter((post) => post.category && post.category_slug)
            .map((post) => [
              post.category_slug!,
              { name: post.category!, slug: post.category_slug!, post_count: 0 },
            ])
        ).values()
      );

  return (
    <div>
      {/* Hero */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: `${Math.min(520, Math.max(220, Number(hero.height) || 300))}px`,
        }}
      >
        {hero.bg_image && (
          <img
            src={cfHero(hero.bg_image)}
            alt=""
            width={1600}
            height={520}
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            decoding="async"
            style={{
              objectPosition: getObjectPosition(
                hero.bg_image_focal_x,
                hero.bg_image_focal_y
              ),
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: getGradientBackground(hero),
            opacity:
              Math.min(100, Math.max(0, Number(hero.gradient_opacity) || 100)) /
              100,
          }}
        />
        <div className="relative z-10 text-center">
          <h1
            className="font-black tracking-wide px-4"
            style={{
              color: hero.title_color || "#ffffff",
              fontSize: `clamp(${Math.min(72, Math.max(24, Number(hero.title_size_mobile) || 48))}px, 6vw, ${Math.min(92, Math.max(28, Number(hero.title_size_desktop) || 64))}px)`,
            }}
          >
            {hero.title}
          </h1>
          <p
            className="mt-4 text-lg max-w-2xl mx-auto px-4"
            style={{ color: hero.subtitle_color || "#d1d5db" }}
          >
            {hero.subtitle}
          </p>
        </div>
      </div>

      {/* Category filter bar */}
      <div className="border-b border-gray-200">
        <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-4 overflow-x-auto">
            <span className="text-sm font-semibold text-dark flex-shrink-0">
              Browse:
            </span>
            <Link
              to="/news"
              className="px-3 py-1 text-sm font-medium text-white bg-primary rounded-full flex-shrink-0"
            >
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={getNewsCategoryPath(category.slug)}
                className="px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Posts grid */}
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link key={post.id} to={getNewsArticlePath(post.slug)} className="group">
              <article className="listing-card h-full flex flex-col">
                {/* Image — show featured_image if available, else gradient placeholder */}
                <div className="relative h-48 overflow-hidden">
                  {post.featured_image ? (
                    <img
                      src={cfCard(post.featured_image)}
                      alt={mediaMetadata?.[post.featured_image!]?.alt_text || post.title}
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
                  <h2 className="text-lg font-bold text-dark leading-tight mb-2 group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  <time className="text-sm text-gray-500 mb-3 block">
                    {post.published_at
                      ? formatLongDate(post.published_at)
                      : ""}
                  </time>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <span className="inline-block mt-4 text-sm font-semibold text-primary group-hover:underline">
                    Read More →
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No published news articles yet.</p>
            <p className="text-sm mt-2">Check back soon for travel guides and tips.</p>
          </div>
        )}
      </div>
    </div>
  );
}
