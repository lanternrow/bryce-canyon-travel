import { Link, useLoaderData, useActionData, Form, redirect, useFetcher, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/admin-post-edit";
import { Suspense, lazy, useState, useEffect } from "react";
import {
  getBlogPostById,
  getBlogCategories,
  getBlogCategoryBySlug,
  createBlogPost,
  updateBlogPost,
  syncMediaUsage,
} from "../lib/queries.server";
import { notifySearchEngines } from "../lib/seo-notify.server";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { requireAuth } from "../lib/auth.server";
import {
  getBlogPostDeindexPreflight,
  getRecentDeindexRequests,
  submitDeindexRequest,
} from "../lib/deindex.server";
import ImageUploader from "../components/ImageUploader";
import SerpPreview from "../components/SerpPreview";
import SocialPreview from "../components/SocialPreview";
import SeoMeter from "../components/SeoMeter";
import SeoScorecard, { type KeyphraseDuplicate } from "../components/SeoScorecard";
import ReadabilityScorecard from "../components/ReadabilityScorecard";
import { applyTitleTemplate } from "../lib/title-template";
import { getNewsArticlePath, getNewsArticleUrl } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

const RichTextEditor = lazy(() => import("../components/RichTextEditor"));

export function meta() {
  return [{ title: `Edit News Article | Admin | ${siteConfig.siteName}` }];
}

function serializePublishDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedLocalValue = trimmed.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizedLocalValue)) {
    const [datePart, timePart] = normalizedLocalValue.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString();
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const isNew = !params.id;
  let post: any = null;

  if (!isNew) {
    post = await getBlogPostById(params.id!);
    if (!post) {
      throw new Response("News article not found", { status: 404 });
    }
  }

  const [categories, mediaMeta, recentDeindexRequests] = await Promise.all([
    getBlogCategories(),
    post?.featured_image
      ? buildMediaMetadata([post.featured_image])
      : Promise.resolve({} as Record<string, { alt_text?: string }>),
    post
      ? getRecentDeindexRequests("blog_post", post.id, 5)
      : Promise.resolve([]),
  ]);

  const featuredImageAlt = post?.featured_image
    ? mediaMeta[post.featured_image]?.alt_text || ""
    : "";

  return {
    post,
    categories,
    isNew,
    featuredImageAlt,
    deindexPreflight: post ? getBlogPostDeindexPreflight(post) : null,
    recentDeindexRequests,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const isNew = !params.id;
  const intent = formData.get("intent") as string;
  const requestedStatus =
    formData.get("save_draft") === "1"
      ? "draft"
      : ((formData.get("status") as string) || "draft");
  const publishedAtRaw = ((formData.get("published_at") as string) || "").trim();
  const publishedAtIso = serializePublishDate(publishedAtRaw);

  if (!["draft", "published", "scheduled", "pending"].includes(requestedStatus)) {
    return { error: "Invalid article status." };
  }

  if (publishedAtRaw && !publishedAtIso) {
    return { error: "Publish date is invalid. Please choose a valid date and time." };
  }

  if (requestedStatus === "scheduled") {
    if (!publishedAtIso) {
      return { error: "Scheduled articles require a future publish date." };
    }
    const scheduledFor = new Date(publishedAtIso);
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
      return { error: "Scheduled articles require a future publish date." };
    }
  }

  if (intent === "request-deindex") {
    if (!params.id) {
      return {
        deindexRequest: {
          ok: false,
          message: "Save the article before requesting deindex.",
        },
      };
    }

    const post = (await getBlogPostById(params.id!)) as any;
    if (!post) {
      throw new Response("News article not found", { status: 404 });
    }

    const result = await submitDeindexRequest({
      contentType: "blog_post",
      contentId: post.id,
      requestedByUserId: user.id,
      requestedByEmail: user.email,
      preflight: getBlogPostDeindexPreflight(post),
    });

    return { deindexRequest: result };
  }

  const existingPost = !isNew ? ((await getBlogPostById(params.id!)) as any) : null;
  if (!isNew && !existingPost) {
    throw new Response("News article not found", { status: 404 });
  }

  const title = formData.get("title") as string;
  const slug =
    (formData.get("slug") as string) ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const categorySlug = (formData.get("category_slug") as string) || "";
  const selectedCategory = categorySlug
    ? await getBlogCategoryBySlug(categorySlug)
    : null;

  const data = {
    title,
    slug,
    excerpt: (formData.get("excerpt") as string) || undefined,
    content: (formData.get("content") as string) || undefined,
    author: (formData.get("author") as string) || siteConfig.defaults.defaultAuthor,
    category_id: selectedCategory?.id ? Number(selectedCategory.id) : null,
    category: selectedCategory?.name || undefined,
    category_slug: selectedCategory?.slug || undefined,
    read_time: (formData.get("read_time") as string) || undefined,
    featured_image: (formData.get("featured_image") as string) || undefined,
    meta_title: (formData.get("meta_title") as string) || undefined,
    meta_description:
      (formData.get("meta_description") as string) || undefined,
    focus_keyphrase: (formData.get("focus_keyphrase") as string) || undefined,
    status: requestedStatus,
    published_at: publishedAtIso || undefined,
  };

  // Helper: extract image URLs from HTML content
  function extractInlineImageUrls(html: string | undefined): string[] {
    if (!html) return [];
    const urls: string[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }

  if (isNew) {
    const newPost = await createBlogPost(data);
    const newId = (newPost as any).id;

    // Sync media usage tracking
    const mediaUsages: { url: string; usage_type: string }[] = [];
    if (data.featured_image) mediaUsages.push({ url: data.featured_image, usage_type: "featured_image" });
    for (const inlineUrl of extractInlineImageUrls(data.content)) {
      mediaUsages.push({ url: inlineUrl, usage_type: "inline" });
    }
    await syncMediaUsage("blog_post", newId, mediaUsages);

    // Notify search engines when newly published (fire-and-forget)
    if (data.status === "published") {
      const postUrl = getNewsArticleUrl(slug);
      notifySearchEngines([postUrl]).catch(console.error);
    }

    return redirect(`/admin/posts/${newId}/edit`);
  } else {
    await updateBlogPost(params.id!, data);

    // Sync media usage tracking
    const mediaUsages: { url: string; usage_type: string }[] = [];
    if (data.featured_image) mediaUsages.push({ url: data.featured_image, usage_type: "featured_image" });
    for (const inlineUrl of extractInlineImageUrls(data.content)) {
      mediaUsages.push({ url: inlineUrl, usage_type: "inline" });
    }
    await syncMediaUsage("blog_post", params.id!, mediaUsages);

    // Notify search engines on publish + unpublish transitions (fire-and-forget).
    // If a previously published URL is now draft/scheduled/pending, notifying its
    // old URL helps search engines see the new non-public state sooner.
    const changedUrls = new Set<string>();
    if (data.status === "published") {
      changedUrls.add(getNewsArticleUrl(slug));
    }
    if (existingPost?.status === "published") {
      changedUrls.add(getNewsArticleUrl(existingPost.slug));
    }
    if (changedUrls.size > 0) {
      notifySearchEngines(Array.from(changedUrls)).catch(console.error);
    }

    return { saved: true, savedAt: Date.now() };
  }
}

export default function AdminPostEdit() {
  const {
    post,
    categories,
    isNew,
    featuredImageAlt: initialFeaturedImageAlt,
    deindexPreflight,
    recentDeindexRequests,
  } = useLoaderData<typeof loader>();
  const p = post as any;
  const categoryOptions = (categories as any[]) || [];
  const rootData = useRouteLoaderData("root") as { settings: Record<string, string> } | undefined;

  const actionData = useActionData<typeof action>();
  const [contentHtml, setContentHtml] = useState(p?.content || "");
  const [featuredImage, setFeaturedImage] = useState(p?.featured_image || "");
  const [metaTitle, setMetaTitle] = useState(p?.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(
    p?.meta_description || ""
  );
  const [focusKeyphrase, setFocusKeyphrase] = useState(p?.focus_keyphrase || "");
  // seoOpen removed — SEO section always visible
  const [titleValue, setTitleValue] = useState(p?.title || "");
  const [slugValue, setSlugValue] = useState(p?.slug || "");
  const [excerptValue, setExcerptValue] = useState(p?.excerpt || "");
  const indexFetcher = useFetcher();
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [seoAiLoading, setSeoAiLoading] = useState<"title" | "description" | null>(null);
  const [keyphraseAiLoading, setKeyphraseAiLoading] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initialFeaturedImageAlt || "");
  // mediaMetaFetcher removed — raw fetch below avoids React Router revalidation
  const [readTime, setReadTime] = useState(p?.read_time || "");
  const [readTimeManual, setReadTimeManual] = useState(false);
  const [duplicateKeyphrases, setDuplicateKeyphrases] = useState<KeyphraseDuplicate[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState(
    p?.category_slug || ""
  );
  const latestDeindexRequest = (recentDeindexRequests as any[])[0] as
    | { request_outcome: string; created_at: string }
    | undefined;
  const formError = actionData && typeof actionData === "object" && "error" in actionData
    ? (actionData.error as string)
    : null;
  const hasRecentDeindexRequest =
    latestDeindexRequest?.request_outcome === "requested" &&
    Date.now() - new Date(latestDeindexRequest.created_at).getTime() < 6 * 60 * 60 * 1000;
  const deindexDisabledReason =
    isNew
      ? "Save the article before requesting deindex."
      : hasRecentDeindexRequest
      ? "A deindex request was already submitted in the last 6 hours."
      : (deindexPreflight as any)?.reasons?.[0] || null;

  // Auto-calculate read time from content word count (~317 wpm → ~25% shorter estimates)
  function calculateReadTime(html: string): string {
    if (!html) return "";
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const words = text.split(" ").filter(Boolean).length;
    if (words === 0) return "";
    const minutes = Math.max(1, Math.round(words / 317));
    return `${minutes} min read`;
  }

  // Recalculate read time whenever content changes (unless user manually edited it)
  useEffect(() => {
    if (!readTimeManual) {
      setReadTime(calculateReadTime(contentHtml));
    }
  }, [contentHtml, readTimeManual]);

  // Check for duplicate keyphrases (debounced)
  useEffect(() => {
    const kp = focusKeyphrase.trim();
    if (!kp) {
      setDuplicateKeyphrases([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ keyphrase: kp });
        if (p?.id) {
          params.set("excludeId", p.id);
          params.set("excludeType", "blog_post");
        }
        const res = await fetch(`/api/check-keyphrase?${params}`);
        const data = await res.json();
        setDuplicateKeyphrases(data.duplicates || []);
      } catch {
        setDuplicateKeyphrases([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [focusKeyphrase]); // eslint-disable-line react-hooks/exhaustive-deps

  const [statusValue, setStatusValue] = useState(p?.status || "draft");
  const selectedCategory =
    categoryOptions.find((cat: any) => cat.slug === selectedCategorySlug) || null;
  const [publishDate, setPublishDate] = useState(() => {
    if (p?.published_at) {
      const d = new Date(p.published_at);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return "";
  });
  const serializedPublishDate = serializePublishDate(publishDate);

  // Look up alt text whenever featured image changes (raw fetch to avoid revalidation)
  useEffect(() => {
    if (featuredImage) {
      let cancelled = false;
      fetch(`/api/media-meta?url=${encodeURIComponent(featuredImage)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setFeaturedImageAlt(data.alt_text || "");
        })
        .catch(() => {});
      return () => { cancelled = true; };
    } else {
      setFeaturedImageAlt("");
    }
  }, [featuredImage]);

  useEffect(() => {
    if (actionData && (actionData as any).saved) {
      setShowSaveToast(true);
      const timer = setTimeout(() => setShowSaveToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  const handleSeoAiGenerate = async (field: "title" | "description") => {
    if (!titleValue) return;
    setSeoAiLoading(field);
    try {
      const res = await fetch("/api/ai-seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          name: titleValue,
          pageType: "blog_post",
          slug: slugValue,
          description: contentHtml,
          excerpt: excerptValue,
          category: selectedCategory?.name || p?.category || "",
          focusKeyphrase: focusKeyphrase || undefined,
          currentMetaTitle: metaTitle || undefined,
          currentMetaDescription: metaDescription || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        if (field === "title" && data.metaTitle) setMetaTitle(data.metaTitle);
        if (field === "description" && data.metaDescription) setMetaDescription(data.metaDescription);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setSeoAiLoading(null);
    }
  };

  const handleAiKeyphrase = async () => {
    if (!contentHtml || keyphraseAiLoading) return;
    setKeyphraseAiLoading(true);
    try {
      const res = await fetch("/api/ai-keyphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml: contentHtml,
          contentType: "blog_post",
          title: titleValue,
          slug: slugValue,
          excludeId: p?.id || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.keyphrase) {
        setFocusKeyphrase(data.keyphrase);
      }
    } catch {
      alert("AI keyphrase suggestion failed. Please try again.");
    } finally {
      setKeyphraseAiLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Save toast */}
      {showSaveToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">News article saved successfully</span>
        </div>
      )}

      {formError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <Link to="/admin/posts" className="hover:text-primary">
          News Articles
        </Link>
        <span>/</span>
        <span>{isNew ? "New Article" : "Edit Article"}</span>
      </div>

      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-dark min-w-0 truncate">
          {isNew ? "Create News Article" : `Edit: ${p?.title}`}
        </h1>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isNew && p?.slug && (
            <a
              href={`${getNewsArticlePath(p.slug)}${p.status !== "published" ? "?preview=true" : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-full hover:bg-gray-50 hover:text-primary transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {p.status === "published" ? "View Live" : "Preview"}
            </a>
          )}
          {!isNew && p?.status && (
            <span
              className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize ${
                p.status === "published"
                  ? "bg-green-100 text-green-700"
                  : p.status === "scheduled"
                  ? "bg-blue-100 text-blue-700"
                  : p.status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {p.status}
            </span>
          )}
        </div>
      </div>

      <Form method="post" className="flex gap-8">
        {/* Hidden field for rich text content */}
        <input type="hidden" name="content" value={contentHtml} />
        <input type="hidden" name="featured_image" value={featuredImage} />
        <input type="hidden" name="meta_title" value={metaTitle} />
        <input type="hidden" name="meta_description" value={metaDescription} />
        <input type="hidden" name="focus_keyphrase" value={focusKeyphrase} />
        <input type="hidden" name="published_at" value={serializedPublishDate} />

        {/* LEFT COLUMN — Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Title */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              name="title"
              required
              defaultValue={p?.title || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-semibold focus:outline-none focus:border-primary"
              placeholder="Enter post title..."
              onChange={(e) => setTitleValue(e.target.value)}
            />
          </div>

          {/* Slug */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug
            </label>
            <input
              type="text"
              name="slug"
              defaultValue={p?.slug || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="post-url-slug"
              onChange={(e) => setSlugValue(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to auto-generate from title.
            </p>
          </div>

          {/* Rich Text Content */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <Suspense
              fallback={
                <textarea
                  rows={20}
                  defaultValue={p?.content || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-primary"
                  placeholder="Loading editor..."
                  readOnly
                />
              }
            >
              <RichTextEditor
                content={contentHtml}
                onChange={setContentHtml}
                contentVersion={contentVersion}
              />
            </Suspense>
          </div>

          {/* Readability — right after content for easy editing */}
          <ReadabilityScorecard
            bodyHtml={contentHtml}
            contentType="blog_post"
            onAiImprove={(improvedHtml) => {
              setContentHtml(improvedHtml);
              setContentVersion((v) => v + 1);
            }}
          />

          {/* Excerpt */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excerpt
            </label>
            <textarea
              name="excerpt"
              rows={4}
              defaultValue={p?.excerpt || ""}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="A short summary of the post for previews and search results..."
              onChange={(e) => setExcerptValue(e.target.value)}
            />
          </div>

          {/* SEO Settings */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-dark">SEO Settings</h2>
            </div>
            <div className="px-6 pb-6 space-y-4 pt-4">
                {/* 1. Focus Keyphrase */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-white border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">Focus Keyphrase</span>
                  </div>
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={focusKeyphrase}
                        onChange={(e) => setFocusKeyphrase(e.target.value)}
                        placeholder="e.g. zion national park hikes"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAiKeyphrase}
                        disabled={keyphraseAiLoading || !contentHtml}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
                        title="AI-suggest a focus keyphrase based on your content and keyword research"
                      >
                        {keyphraseAiLoading ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                        )}
                        AI Suggest
                      </button>
                    </div>
                    {!focusKeyphrase.trim() && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        Enter a keyphrase or let AI suggest one based on your content and keyword research.
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Meta Information */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-white border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">Meta Information</span>
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Meta Title
                        </label>
                        <button
                          type="button"
                          onClick={() => handleSeoAiGenerate("title")}
                          disabled={seoAiLoading === "title" || !titleValue}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title="AI-generate SEO meta title"
                        >
                          {seoAiLoading === "title" ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                          )}
                          AI Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary bg-white"
                        placeholder="Custom title for search engines..."
                        maxLength={70}
                      />
                      <SeoMeter value={metaTitle} field="title" pageContent={titleValue} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <label className="block text-xs font-medium text-gray-500">
                          Meta Description
                        </label>
                        <button
                          type="button"
                          onClick={() => handleSeoAiGenerate("description")}
                          disabled={seoAiLoading === "description" || !titleValue}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title="AI-generate SEO meta description"
                        >
                          {seoAiLoading === "description" ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                          )}
                          AI Generate
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary bg-white"
                        placeholder="Brief description for search results..."
                        maxLength={200}
                      />
                      <SeoMeter
                        value={metaDescription}
                        field="description"
                        pageContent={titleValue + " " + contentHtml}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. SEO Analysis Scorecard */}
                <SeoScorecard
                  focusKeyphrase={focusKeyphrase}
                  metaTitle={metaTitle}
                  metaDescription={metaDescription}
                  slug={slugValue}
                  bodyHtml={contentHtml}
                  contentType="blog_post"
                  featuredImage={featuredImage || undefined}
                  featuredImageAlt={featuredImageAlt || undefined}
                  duplicateKeyphrases={duplicateKeyphrases}
                />

                {/* 4. Search & Social Previews */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-white border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">Search & Social Preview</span>
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    <SerpPreview
                      title={applyTitleTemplate(metaTitle || titleValue || "", rootData?.settings?.title_template || "%page_title%")}
                      url={getNewsArticleUrl(slugValue)}
                      description={metaDescription || excerptValue}
                      image={featuredImage || null}
                      siteName={rootData?.settings?.site_title || siteConfig.siteName}
                      favicon={rootData?.settings?.favicon_url || null}
                    />
                    <SocialPreview
                      title={metaTitle || titleValue}
                      description={metaDescription || excerptValue}
                      image={featuredImage || null}
                      url={getNewsArticleUrl(slugValue)}
                    />
                  </div>
                </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Sidebar */}
        <div className="w-[280px] flex-shrink-0 space-y-6">
          {/* Publish */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-dark mb-4">
              Publish
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={statusValue}
                  onChange={(e) => setStatusValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="pending">Pending Review</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {statusValue === "scheduled" ? "Scheduled For" : "Publish Date"}
                </label>
                <input
                  type="datetime-local"
                  value={publishDate}
                  onChange={(e) => setPublishDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
                {statusValue === "scheduled" && !publishDate && (
                  <p className="text-xs text-red-500 mt-1">Set a future date for scheduled posts</p>
                )}
                {statusValue === "scheduled" && publishDate && !serializedPublishDate && (
                  <p className="text-xs text-red-500 mt-1">Use a valid date and time.</p>
                )}
                {!publishDate && statusValue !== "scheduled" && (
                  <p className="text-xs text-gray-400 mt-1">Leave blank to auto-set on publish</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Author
                </label>
                <input
                  type="text"
                  name="author"
                  defaultValue={p?.author || siteConfig.defaults.defaultAuthor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Read Time
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="read_time"
                    value={readTime}
                    onChange={(e) => {
                      setReadTime(e.target.value);
                      setReadTimeManual(true);
                    }}
                    placeholder="e.g. 5 min read"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                  {readTimeManual && (
                    <button
                      type="button"
                      onClick={() => {
                        setReadTimeManual(false);
                        setReadTime(calculateReadTime(contentHtml));
                      }}
                      className="px-2 py-2 text-xs text-gray-500 hover:text-primary transition-colors"
                      title="Reset to auto-calculated value"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {readTimeManual ? "Manually set" : "Auto-calculated from content"}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  name="save_draft"
                  value="1"
                  className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Save Draft
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  {isNew ? "Publish" : "Update"}
                </button>
              </div>
            </div>

            {/* Google Index Status Checker */}
            {!isNew && p?.status === "published" && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">Google Index</span>
                  {indexFetcher.data && (indexFetcher.data as any).success && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      (indexFetcher.data as any).verdict === "PASS"
                        ? "bg-emerald-100 text-emerald-700"
                        : (indexFetcher.data as any).verdict === "NEUTRAL" || (indexFetcher.data as any).verdict === "PARTIAL"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {(indexFetcher.data as any).verdict === "PASS"
                        ? "Indexed"
                        : (indexFetcher.data as any).coverageState || "Not indexed"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = getNewsArticleUrl(p.slug);
                    indexFetcher.load(`/api/url-inspection?url=${encodeURIComponent(url)}`);
                  }}
                  disabled={indexFetcher.state !== "idle"}
                  className="w-full px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {indexFetcher.state !== "idle" ? "Checking..." : "Check Index Status"}
                </button>
                {indexFetcher.data && !(indexFetcher.data as any).success && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {(indexFetcher.data as any).error || "Check failed"}
                  </p>
                )}
                {indexFetcher.data && (indexFetcher.data as any).success && (indexFetcher.data as any).lastCrawlTime && (
                  <p className="mt-1 text-xs text-gray-400">
                    Crawled: {new Date((indexFetcher.data as any).lastCrawlTime).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {!isNew && p && deindexPreflight && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">Search Cleanup</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      deindexDisabledReason
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {deindexDisabledReason ? "Locked" : "Ready"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Use this only when a stale search result remains after this article was unpublished. It never changes article status.
                </p>
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-gray-500">Public URL</span>
                    <span className="text-right break-all text-gray-700">{(deindexPreflight as any).url}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Anonymous response</span>
                    <span className="text-gray-700">{(deindexPreflight as any).publicStatusCode}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Robots</span>
                    <span className="text-gray-700">{(deindexPreflight as any).robotsDirective}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">In sitemap</span>
                    <span className="text-gray-700">{(deindexPreflight as any).inSitemap ? "Yes" : "No"}</span>
                  </div>
                </div>
                {(actionData as any)?.deindexRequest?.message && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      (actionData as any).deindexRequest.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {(actionData as any).deindexRequest.message}
                  </div>
                )}
                <button
                  type="submit"
                  name="intent"
                  value="request-deindex"
                  disabled={Boolean(deindexDisabledReason)}
                  onClick={(event) => {
                    if (deindexDisabledReason) return;
                    const ok = window.confirm(
                      `Request deindex for:\n${(deindexPreflight as any).url}\n\nThis article is already non-public. This action only asks search engines to refresh and remove stale index entries. It will not publish, unpublish, or delete the article.`
                    );
                    if (!ok) {
                      event.preventDefault();
                    }
                  }}
                  className="mt-3 w-full px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Request Deindex
                </button>
                {deindexDisabledReason && (
                  <p className="mt-2 text-xs text-gray-500">{deindexDisabledReason}</p>
                )}
                {(recentDeindexRequests as any[]).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-gray-600">Recent requests</div>
                    <div className="space-y-2">
                      {(recentDeindexRequests as any[]).map((entry: any) => (
                        <div key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-700 capitalize">{entry.request_outcome}</span>
                            <span className="text-gray-400">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 text-gray-500">
                            {entry.requested_by_email || "Unknown admin"}
                          </div>
                          {entry.blocked_reason && (
                            <div className="mt-1 text-amber-700">{entry.blocked_reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-dark mb-4">
              Category
            </h2>
            <div className="space-y-3">
              <select
                name="category_slug"
                value={selectedCategorySlug}
                onChange={(e) => setSelectedCategorySlug(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Uncategorized</option>
                {categoryOptions.map((cat: any) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                Manage categories at{" "}
                <Link to="/admin/post-categories" className="text-primary hover:underline">
                  News Categories
                </Link>.
              </p>
            </div>
          </div>

          {/* Featured Image */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <ImageUploader
              value={featuredImage || null}
              onChange={(url) => setFeaturedImage(url || "")}
              label="Featured Image"
              hint="Shown in the hero banner and post previews."
            />
          </div>
        </div>
      </Form>
    </div>
  );
}
