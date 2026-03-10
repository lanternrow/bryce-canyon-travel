import { Link, useLoaderData, Form, redirect, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/admin-posts";
import { requireAuth } from "../lib/auth.server";
import { getBlogPosts, deleteBlogPost, publishScheduledPosts } from "../lib/queries.server";
import { formatShortDate } from "../lib/format";
import { runSeoAnalysis } from "../lib/seo-analysis";
import { siteConfig } from "../lib/site-config";

export function meta({}: Route.MetaArgs) {
  return [{ title: `News Articles | Admin | ${siteConfig.siteName}` }];
}

// ============================================
// Helpers
// ============================================

function computeMetaRating(metaTitle: string, metaDescription: string): "good" | "ok" | "problem" {
  const titleLen = (metaTitle || "").length;
  const descLen = (metaDescription || "").length;
  if (titleLen === 0 || descLen === 0) return "problem";
  const titleGood = titleLen >= 35 && titleLen <= 60;
  const descGood = descLen >= 120 && descLen <= 160;
  if (titleGood && descGood) return "good";
  return "ok";
}

function buildUrl(updates: Record<string, string | undefined>, searchParams: URLSearchParams) {
  const newParams = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
  }
  const qs = newParams.toString();
  return `/admin/posts${qs ? `?${qs}` : ""}`;
}

const metaBadge: Record<string, { classes: string; label: string }> = {
  good: { classes: "bg-emerald-100 text-emerald-700", label: "Good" },
  ok: { classes: "bg-amber-100 text-amber-700", label: "OK" },
  problem: { classes: "bg-red-100 text-red-700", label: "Missing" },
};

const seoBadge: Record<string, { classes: string; dot: string }> = {
  good: { classes: "bg-emerald-100 text-emerald-700", dot: "#22c55e" },
  improvement: { classes: "bg-amber-100 text-amber-700", dot: "#f59e0b" },
  problem: { classes: "bg-red-100 text-red-700", dot: "#ef4444" },
};

// ============================================
// Loader & Action
// ============================================

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  // Auto-publish any scheduled posts past their publish date
  await publishScheduledPosts();

  const url = new URL(request.url);
  const metaFilter = url.searchParams.get("meta") || "";
  const seoFilter = url.searchParams.get("seo") || "";
  const popularFilter = url.searchParams.get("popular") || "";

  // Get all posts regardless of status
  const [published, drafts, pending, scheduled] = await Promise.all([
    getBlogPosts({ status: "published", limit: 100 }),
    getBlogPosts({ status: "draft", limit: 100 }),
    getBlogPosts({ status: "pending", limit: 100 }),
    getBlogPosts({ status: "scheduled", limit: 100 }),
  ]);

  let allPosts = [...(published as any[]), ...(drafts as any[]), ...(pending as any[]), ...(scheduled as any[])];

  // Compute scores for each post
  allPosts = allPosts.map((post) => {
    const metaRating = computeMetaRating(post.meta_title, post.meta_description);
    const seo = runSeoAnalysis({
      contentType: "blog_post",
      focusKeyphrase: post.focus_keyphrase || "",
      metaTitle: post.meta_title || "",
      metaDescription: post.meta_description || "",
      slug: post.slug || "",
      bodyHtml: post.content || "",
      featuredImage: post.featured_image || undefined,
    });
    return {
      ...post,
      metaRating,
      seoRating: seo.overallRating,
      seoGoodCount: seo.goodCount,
      seoTotalChecks: seo.checks.length,
    };
  });

  // Filter by meta score
  if (metaFilter) {
    allPosts = allPosts.filter((p) => p.metaRating === metaFilter);
  }

  // Filter by SEO score
  if (seoFilter) {
    allPosts = allPosts.filter((p) => p.seoRating === seoFilter);
  }
  if (popularFilter === "popular") {
    allPosts = allPosts.filter((p) => Boolean(p.is_popular));
  } else if (popularFilter === "not_popular") {
    allPosts = allPosts.filter((p) => !p.is_popular);
  }

  // Sort by published_at descending (most recent first), posts without dates at end
  allPosts.sort((a, b) => {
    const aDate = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bDate = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bDate - aDate;
  });

  return { posts: allPosts };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await deleteBlogPost(id);
  }

  return redirect("/admin/posts");
}

const categoryPalette = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-rose-100 text-rose-700",
];

function getCategoryColor(category: string | null | undefined) {
  if (!category) return "bg-gray-100 text-gray-700";
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash << 5) - hash + category.charCodeAt(i);
    hash |= 0;
  }
  return categoryPalette[Math.abs(hash) % categoryPalette.length];
}

const statusColors: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
};

export default function AdminPosts() {
  const { posts } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentMeta = searchParams.get("meta") || "";
  const currentSeo = searchParams.get("seo") || "";
  const currentPopular = searchParams.get("popular") || "";

  return (
    <div className="px-6 py-8">
      {/* Breadcrumbs + Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/admin/dashboard" className="hover:text-primary">
              Admin
            </Link>
            <span>/</span>
            <span>News Articles</span>
          </div>
          <h1 className="text-3xl font-bold text-dark">News Articles</h1>
          <p className="text-sm text-gray-500 mt-1">{posts.length} total articles</p>
        </div>
        <Link
          to="/admin/posts/new"
          className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          + New Article
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={currentMeta}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(buildUrl({ meta: e.target.value || undefined }, searchParams))
          }
        >
          <option value="">All Meta</option>
          <option value="good">Meta: Good</option>
          <option value="ok">Meta: OK</option>
          <option value="problem">Meta: Missing</option>
        </select>
        <select
          value={currentSeo}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(buildUrl({ seo: e.target.value || undefined }, searchParams))
          }
        >
          <option value="">All SEO</option>
          <option value="good">SEO: Good</option>
          <option value="improvement">SEO: OK</option>
          <option value="problem">SEO: Needs Work</option>
        </select>
        <select
          value={currentPopular}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(buildUrl({ popular: e.target.value || undefined }, searchParams))
          }
        >
          <option value="">All Popularity</option>
          <option value="popular">Popular only</option>
          <option value="not_popular">Not popular</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Meta
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                SEO
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Popular
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(posts as any[]).map((post: any) => {
              const mb = metaBadge[post.metaRating] || metaBadge.problem;
              const sb = seoBadge[post.seoRating] || seoBadge.problem;
              return (
                <tr key={post.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 max-w-xs">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {post.title}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${getCategoryColor(post.category)}`}
                    >
                      {post.category || "Uncategorized"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                        statusColors[post.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {post.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${mb.classes}`}>
                      {mb.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${sb.classes}`}>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sb.dot }}
                      />
                      {post.seoGoodCount}/{post.seoTotalChecks}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 hidden sm:table-cell">
                    {post.published_at
                      ? formatShortDate(post.published_at)
                      : "—"}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    {post.is_popular ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          Popular
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          {Number(post.views_30d || 0).toLocaleString()} views
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/posts/${post.id}/edit`}
                        className="text-sm text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <Form method="post" onSubmit={(e) => { if (!confirm("Delete this article?")) e.preventDefault(); }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={post.id} />
                        <button type="submit" className="text-sm text-red-500 hover:underline">
                          Delete
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {posts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No articles yet. Create your first news article.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <p>Showing {posts.length} of {posts.length} articles</p>
      </div>
    </div>
  );
}
