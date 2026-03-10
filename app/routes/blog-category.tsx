import { Link } from "react-router";
import type { Route } from "./+types/blog-category";
import { getBlogCategoryBySlug, getBlogPosts } from "../lib/queries.server";
import { formatLongDate } from "../lib/format";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { getNewsArticlePath, getNewsCategoryUrl } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

type BlogCategoryData = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

type BlogPostData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  read_time: string | null;
  published_at: string | null;
  is_popular?: boolean;
  views_30d?: number;
};

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.categorySlug;
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const category = await getBlogCategoryBySlug(slug);
  if (!category) {
    throw new Response("Not Found", { status: 404 });
  }

  const posts = await getBlogPosts({ status: "published", category: slug, limit: 100 });
  const imageUrls = (posts as any[])
    .map((post: any) => post.featured_image)
    .filter((url: any): url is string => !!url);
  const mediaMetadata = await buildMediaMetadata(imageUrls);

  return { category, posts, slug, mediaMetadata };
}

export function meta({ data, matches }: Route.MetaArgs) {
  if (!data?.category) {
    return [{ title: formatPageTitle("Category Not Found", matches) }];
  }

  const category = data.category as BlogCategoryData;
  const canonicalUrl = getNewsCategoryUrl(category.slug);
  const seoTitle = category.meta_title || `${category.name} Articles & Guides`;
  const seoDescription =
    category.meta_description ||
    category.description ||
    `Browse ${category.name.toLowerCase()} articles and travel guides from local experts.`;
  const siteName = getSiteName(matches);

  return [
    { title: formatPageTitle(seoTitle, matches) },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];
}

export default function BlogCategoryPage({ loaderData }: Route.ComponentProps) {
  const {
    category: rawCategory,
    posts: rawPosts,
    mediaMetadata,
  } = loaderData as unknown as {
    category: BlogCategoryData;
    posts: BlogPostData[];
    mediaMetadata: Record<string, { alt_text?: string }>;
  };

  const category = rawCategory;
  const posts = rawPosts || [];
  const description =
    category.description ||
    `Travel tips, trail guides, and curated reading for ${category.name.toLowerCase()} near ${siteConfig.parkName}.`;

  return (
    <div>
      <div className="relative h-[300px] bg-gradient-to-br from-dark via-gray-800 to-dark flex items-center justify-center">
        <div className="text-center max-w-3xl mx-auto px-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Link
              to="/news"
              className="text-sand hover:text-white text-sm transition-colors"
            >
              News
            </Link>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400 text-sm">{category.name}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-wide">
            {category.name.toUpperCase()}
          </h1>
          <p className="mt-4 text-lg text-gray-300">{description}</p>
        </div>
      </div>

      <div className="max-w-[950px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              No articles in this category yet.
            </p>
            <Link
              to="/news"
              className="inline-block mt-4 text-primary hover:underline"
            >
              ← Browse all articles
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {posts.map((post) => (
              <Link key={post.id} to={getNewsArticlePath(post.slug)} className="group block">
                <article className="flex flex-col sm:flex-row gap-6 p-6 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all">
                  <div className="relative w-full sm:w-48 h-36 sm:h-auto rounded-lg flex-shrink-0 overflow-hidden">
                    {post.featured_image ? (
                      <img
                        src={post.featured_image}
                        alt={mediaMetadata?.[post.featured_image]?.alt_text || post.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-sage/30 to-sand/30" />
                    )}
                    {post.is_popular && (
                      <div className="absolute top-3 left-3">
                        <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                          Popular
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                        {category.name}
                      </span>
                      {post.read_time && (
                        <span className="text-xs text-gray-400">
                          {post.read_time}
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-dark leading-tight group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed line-clamp-2">
                      {post.excerpt}
                    </p>
                    <time className="text-xs text-gray-500 mt-3 block">
                      {post.published_at ? formatLongDate(post.published_at) : ""}
                    </time>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            to="/news"
            className="inline-block px-6 py-3 bg-dark text-white font-medium rounded-lg hover:bg-dark/90 transition-colors"
          >
            ← All Articles
          </Link>
        </div>
      </div>
    </div>
  );
}
