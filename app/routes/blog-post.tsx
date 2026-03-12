import { Link } from "react-router";
import type { Route } from "./+types/blog-post";
import { getBlogPostBySlug, getBlogPosts, getBlogCategoriesWithPostCounts, publishScheduledPosts } from "../lib/queries.server";
import { formatShortDate } from "../lib/format";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { cfHero, cfCard } from "../lib/image-utils";
import { buildBlogPostSchema } from "../lib/schema";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { getSession } from "../lib/auth.server";
import { getNewsArticlePath, getNewsArticleUrl, getNewsCategoryPath } from "../lib/news-url";

function openSharePopup(shareUrl: string) {
  if (typeof window === "undefined") return;

  const width = 640;
  const height = 640;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const popup = window.open(
    shareUrl,
    "share-article",
    `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
  );

  if (popup) {
    popup.focus();
  } else {
    window.location.href = shareUrl;
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const slug = params.slug;

  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  // Auto-publish any scheduled posts whose time has arrived
  await publishScheduledPosts();

  const post = (await getBlogPostBySlug(slug)) as any;
  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  // Draft/scheduled/pending articles are only visible in explicit admin preview mode.
  if (post.status !== "published") {
    const isPreview = url.searchParams.get("preview") === "true";
    if (!isPreview) {
      throw new Response("Not Found", { status: 404 });
    }
    const session = await getSession(request);
    if (!session) {
      throw new Response("Not Found", { status: 404 });
    }
  }

  // Fetch related posts (same category, excluding current post)
  const [allPosts, categories] = await Promise.all([
    post.category_slug
      ? getBlogPosts({ status: "published", category: post.category_slug, limit: 4 })
      : Promise.resolve([]),
    getBlogCategoriesWithPostCounts({ includeEmpty: false, status: "published" }),
  ]);
  const relatedPosts = (allPosts as any[])
    .filter((p: any) => p.slug !== post.slug)
    .slice(0, 3);

  // Batch-fetch media metadata for hero + related post images
  const allImageUrls = [
    post.featured_image,
    ...relatedPosts.map((p: any) => p.featured_image),
  ];
  const mediaMetadata = await buildMediaMetadata(allImageUrls);

  return { post, relatedPosts, categories, mediaMetadata };
}

export function meta({ data, matches }: Route.MetaArgs) {
  if (!data?.post) {
    return [{ title: formatPageTitle("News Article Not Found", matches) }];
  }
  const p = data.post as any;
  const mm = data.mediaMetadata as Record<string, { alt_text?: string }> | undefined;

  const seoTitle = p.meta_title || p.title;
  const pageTitle = formatPageTitle(seoTitle, matches);
  const siteName = getSiteName(matches);
  const seoDescription = p.meta_description || p.excerpt || "";
  const canonicalUrl = getNewsArticleUrl(p.slug);
  const ogImage = p.featured_image || null;
  const ogImageAlt =
    ogImage && mm?.[ogImage]?.alt_text ? mm[ogImage].alt_text : seoTitle;

  const tags: any[] = [
    { title: pageTitle },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "article" },
    { property: "og:site_name", content: siteName },

    // Twitter Card
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];

  if (ogImage) {
    tags.push(
      { property: "og:image", content: ogImage },
      { property: "og:image:alt", content: ogImageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: ogImageAlt },
    );
  } else {
    tags.push({ name: "twitter:card", content: "summary" });
  }

  if (p.status === "published") {
    tags.push({ "script:ld+json": buildBlogPostSchema(p) });
  } else {
    tags.push({ name: "robots", content: "noindex, nofollow" });
    tags.push({ name: "googlebot", content: "noindex, nofollow" });
  }

  // Noindex per content type (from admin settings)
  const rootData = matches?.find((m: any) => m.id === "root")?.data as any;
  if (p.status === "published" && rootData?.settings?.noindex_blog_posts === "true") {
    tags.push({ name: "robots", content: "noindex, follow" });
  }

  return tags;
}

export default function BlogPostPage({ loaderData }: Route.ComponentProps) {
  const { post, relatedPosts, categories, mediaMetadata } = loaderData as {
    post: any;
    relatedPosts: any[];
    categories: Array<{ id?: number; name: string; slug: string; post_count?: number }>;
    mediaMetadata: Record<string, { alt_text?: string; title?: string; caption?: string }>;
  };

  const publishedDate = post.published_at
    ? formatShortDate(post.published_at)
    : null;
  const articleUrl = getNewsArticleUrl(post.slug);
  const articleTitle = post.meta_title || post.title;
  const encodedArticleUrl = encodeURIComponent(articleUrl);
  const encodedArticleTitle = encodeURIComponent(articleTitle);
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedArticleUrl}`;
  const xShareUrl = `https://twitter.com/intent/tweet?url=${encodedArticleUrl}&text=${encodedArticleTitle}`;
  const pinterestShareUrl = `https://pinterest.com/pin/create/button/?url=${encodedArticleUrl}&description=${encodedArticleTitle}${post.featured_image ? `&media=${encodeURIComponent(post.featured_image)}` : ""}`;
  const emailShareUrl = `mailto:?subject=${encodedArticleTitle}&body=${encodeURIComponent(`${articleTitle}\n\n${articleUrl}`)}`;

  return (
    <div>
      {/* Hero */}
      <div className="relative h-[300px] bg-gradient-to-br from-dark via-gray-800 to-dark flex items-end">
        {post.featured_image && (
          <img
            src={cfHero(post.featured_image)}
            alt={mediaMetadata?.[post.featured_image]?.alt_text || post.title}
            width={1600}
            height={300}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            loading="eager"
            decoding="async"
          />
        )}
        <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <div className="flex items-center gap-2 mb-4">
            <Link
              to="/news"
              className="text-sand hover:text-white text-sm transition-colors"
            >
              News
            </Link>
            {post.category_slug && (
              <>
                <span className="text-gray-500">/</span>
                <Link
                  to={getNewsCategoryPath(post.category_slug)}
                  className="text-sand hover:text-white text-sm transition-colors"
                >
                  {post.category}
                </Link>
              </>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight max-w-3xl">
            {post.title}
          </h1>
          {post.is_popular && (
            <div className="mt-4">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 uppercase tracking-wide">
                Popular Post
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
            {post.author && <span>{post.author}</span>}
            {publishedDate && (
              <>
                <span>·</span>
                <time>{publishedDate}</time>
              </>
            )}
            {post.read_time && (
              <>
                <span>·</span>
                <span>{post.read_time}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
          {/* Article */}
          <article
            className="prose prose-lg max-w-none prose-headings:text-dark prose-a:text-primary prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: post.content || "" }}
          />

          {/* Sidebar */}
          <aside className="space-y-8">
            {/* Share */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-dark uppercase tracking-wider mb-3">
                Share This Article
              </h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => openSharePopup(facebookShareUrl)}
                  className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                  aria-label="Share on Facebook"
                  title="Share on Facebook"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => openSharePopup(xShareUrl)}
                  className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 transition-colors"
                  aria-label="Share on X"
                  title="Share on X"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => openSharePopup(pinterestShareUrl)}
                  className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors"
                  aria-label="Share on Pinterest"
                  title="Share on Pinterest"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0a12 12 0 00-4.373 23.178c-.07-.633-.134-1.606.028-2.298.146-.625.942-3.995.942-3.995s-.24-.482-.24-1.193c0-1.116.647-1.95 1.452-1.95.685 0 1.016.515 1.016 1.131 0 .69-.438 1.718-.665 2.673-.19.8.4 1.45 1.186 1.45 1.424 0 2.518-1.502 2.518-3.666 0-1.916-1.377-3.255-3.344-3.255-2.276 0-3.612 1.707-3.612 3.471 0 .688.265 1.425.595 1.826a.24.24 0 01.056.23c-.061.252-.196.8-.222.912-.035.146-.116.177-.268.107-1-.465-1.624-1.926-1.624-3.1 0-2.523 1.834-4.84 5.286-4.84 2.775 0 4.932 1.977 4.932 4.62 0 2.757-1.739 4.976-4.151 4.976-.811 0-1.573-.421-1.834-.919l-.498 1.902c-.181.695-.669 1.566-.995 2.097A12 12 0 1012 0z" />
                  </svg>
                </button>
                <a
                  href={emailShareUrl}
                  className="w-10 h-10 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
                  aria-label="Share by Email"
                  title="Share by Email"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Categories */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-dark uppercase tracking-wider mb-3">
                Categories
              </h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    to={getNewsCategoryPath(category.slug)}
                    className={`px-3 py-1 bg-white border rounded-full text-sm transition-colors ${
                      post.category_slug === category.slug
                        ? "border-primary text-primary"
                        : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Explore CTA */}
            <div className="bg-cream/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-dark uppercase tracking-wider mb-2">
                Plan Your Visit
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Browse local businesses and services near the park.
              </p>
              <div className="space-y-2">
                <Link
                  to="/lodging"
                  className="block text-sm text-primary hover:underline"
                >
                  → Find Lodging
                </Link>
                <Link
                  to="/dining"
                  className="block text-sm text-primary hover:underline"
                >
                  → Browse Restaurants
                </Link>
                <Link
                  to="/experiences"
                  className="block text-sm text-primary hover:underline"
                >
                  → Book Experiences
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-16 pt-12 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-dark mb-8">
              Related Articles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {relatedPosts.map((related: any) => (
                <Link
                  key={related.slug}
                  to={getNewsArticlePath(related.slug)}
                  className="group"
                >
                  <article className="listing-card h-full">
                    {related.featured_image ? (
                      <img
                        src={cfCard(related.featured_image)}
                        alt={mediaMetadata?.[related.featured_image]?.alt_text || related.title}
                        width={400}
                        height={160}
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-40 bg-gradient-to-br from-sage/30 to-sand/30" />
                    )}
                    <div className="p-5">
                      {related.category && (
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                          {related.category}
                        </span>
                      )}
                      <h3 className="text-base font-bold text-dark mt-1 leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {related.title}
                      </h3>
                      {related.published_at && (
                        <time className="text-xs text-gray-500 mt-2 block">
                          {formatShortDate(related.published_at)}
                        </time>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
