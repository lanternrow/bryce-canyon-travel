import { Link, useLoaderData, useActionData, Form, redirect, useFetcher, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/admin-page-edit";
import { Suspense, lazy, useState, useEffect } from "react";
import {
  getCustomPageBySlug,
  createCustomPage,
  updateCustomPage,
  isReservedSlug,
} from "../lib/pages.server";
import { requireAuth } from "../lib/auth.server";
import ImageUploader from "../components/ImageUploader";
import SerpPreview from "../components/SerpPreview";
import SeoScorecard, { type KeyphraseDuplicate } from "../components/SeoScorecard";
import ReadabilityScorecard from "../components/ReadabilityScorecard";
import { applyTitleTemplate } from "../lib/title-template";
import { siteConfig } from "../lib/site-config";

const RichTextEditor = lazy(() => import("../components/RichTextEditor"));

export function meta() {
  return [{ title: `Edit Page | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const isNew = !params.slug;
  let page = null;

  if (!isNew) {
    page = await getCustomPageBySlug(params.slug!);
    if (!page) {
      throw new Response("Page not found", { status: 404 });
    }
  }

  return { page, isNew };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const isNew = !params.slug;

  const title = (formData.get("title") as string) || "";
  const rawSlug =
    (formData.get("slug") as string) ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  if (!title.trim()) {
    return { error: "Title is required" };
  }

  if (isReservedSlug(rawSlug)) {
    return { error: `The slug "${rawSlug}" is reserved and cannot be used for a custom page.` };
  }

  const data = {
    title,
    slug: rawSlug,
    body: (formData.get("body") as string) || "",
    status: formData.get("save_draft") === "1" ? "draft" : ((formData.get("status") as string) || "draft"),
    meta_title: (formData.get("meta_title") as string) || undefined,
    meta_description: (formData.get("meta_description") as string) || undefined,
    focus_keyphrase: (formData.get("focus_keyphrase") as string) || undefined,
    og_image: (formData.get("og_image") as string) || undefined,
  };

  if (isNew) {
    const newPage = await createCustomPage(data);
    return redirect(`/admin/pages/${newPage.slug}/edit?toast=Page+created`);
  } else {
    await updateCustomPage(params.slug!, data);
    return { saved: true, savedAt: Date.now() };
  }
}

export default function AdminPageEdit() {
  const { page, isNew } = useLoaderData<typeof loader>();
  const p = page as any;
  const rootData = useRouteLoaderData("root") as { settings: Record<string, string> } | undefined;

  const actionData = useActionData<typeof action>();
  const [bodyHtml, setBodyHtml] = useState(p?.body || "");
  const [metaTitle, setMetaTitle] = useState(p?.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(p?.meta_description || "");
  const [focusKeyphrase, setFocusKeyphrase] = useState(p?.focus_keyphrase || "");
  const [titleValue, setTitleValue] = useState(p?.title || "");
  const [slugValue, setSlugValue] = useState(p?.slug || "");
  const [ogImage, setOgImage] = useState(p?.og_image || "");
  // SEO section always visible (no twirl-down)
  const [contentVersion, setContentVersion] = useState(0);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [seoAiLoading, setSeoAiLoading] = useState<"title" | "description" | null>(null);
  const [keyphraseAiLoading, setKeyphraseAiLoading] = useState(false);
  const [duplicateKeyphrases, setDuplicateKeyphrases] = useState<KeyphraseDuplicate[]>([]);

  // Show save toast
  useEffect(() => {
    if (actionData && (actionData as any).saved) {
      setShowSaveToast(true);
      const t = setTimeout(() => setShowSaveToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [actionData]);

  // Auto-generate slug from title (only when creating new)
  useEffect(() => {
    if (isNew && titleValue) {
      setSlugValue(
        titleValue
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }, [titleValue, isNew]);

  // AI SEO generation
  const handleAiSeo = async (field: "title" | "description") => {
    if (!bodyHtml) return;
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
          description: bodyHtml,
          focusKeyphrase: focusKeyphrase || undefined,
          currentMetaTitle: metaTitle || undefined,
          currentMetaDescription: metaDescription || undefined,
        }),
      });
      const data = await res.json();
      if (data.metaTitle && field === "title") setMetaTitle(data.metaTitle);
      if (data.metaDescription && field === "description") setMetaDescription(data.metaDescription);
    } catch {
      // silent fail
    } finally {
      setSeoAiLoading(null);
    }
  };

  // AI Keyphrase generation
  const handleAiKeyphrase = async () => {
    if (!bodyHtml) return;
    setKeyphraseAiLoading(true);
    try {
      const res = await fetch("/api/ai-keyphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml,
          contentType: "page",
          title: titleValue,
          excludeId: page?.id || undefined,
        }),
      });
      const data = await res.json();
      if (data.keyphrase) setFocusKeyphrase(data.keyphrase);
    } catch {
      // silent fail
    } finally {
      setKeyphraseAiLoading(false);
    }
  };

  // Check keyphrase duplicates
  useEffect(() => {
    if (!focusKeyphrase) {
      setDuplicateKeyphrases([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/check-keyphrase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyphrase: focusKeyphrase,
            excludeType: "page",
            excludeSlug: slugValue,
          }),
        });
        const data = await res.json();
        setDuplicateKeyphrases(data.duplicates || []);
      } catch {
        setDuplicateKeyphrases([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [focusKeyphrase, slugValue]);

  const titleTemplate = rootData?.settings?.title_template || "{title} | {site_name}";
  const displayTitle = metaTitle || titleValue;
  const renderedTitle = displayTitle
    ? applyTitleTemplate(displayTitle, titleTemplate)
    : "";

  return (
    <div className="px-6 py-8">
      {/* Save toast */}
      {showSaveToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
          Page saved!
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <Link to="/admin/pages" className="hover:text-primary">Pages</Link>
        <span>/</span>
        <span>{isNew ? "New Page" : titleValue || "Edit"}</span>
      </div>

      <h1 className="text-3xl font-bold text-dark mb-6">
        {isNew ? "New Page" : "Edit Page"}
      </h1>

      {(actionData as any)?.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {(actionData as any).error}
        </div>
      )}

      <Form method="post">
        <div className="flex gap-6">
          {/* Left column — Editor */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                type="text"
                name="title"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                placeholder="Page title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">/</span>
                <input
                  type="text"
                  name="slug"
                  value={slugValue}
                  onChange={(e) => setSlugValue(e.target.value)}
                  placeholder="page-slug"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Rich Text Editor */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Content</label>
              <input type="hidden" name="body" value={bodyHtml} />
              <Suspense
                fallback={
                  <div className="h-64 border border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                    Loading editor…
                  </div>
                }
              >
                <RichTextEditor
                  content={bodyHtml}
                  onChange={setBodyHtml}
                  placeholder="Write your page content here…"
                  contentVersion={contentVersion}
                />
              </Suspense>
            </div>

            {/* Readability Scorecard — right after content editor */}
            {bodyHtml && (
              <ReadabilityScorecard
                bodyHtml={bodyHtml}
                contentType="page"
                onAiImprove={(improvedHtml) => {
                  setBodyHtml(improvedHtml);
                  setContentVersion((v) => v + 1);
                }}
              />
            )}

            {/* SEO Section */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <span className="text-sm font-semibold text-dark">SEO Settings</span>
              </div>
              <div className="px-4 pb-4 pt-4 space-y-4">
                  {/* Focus Keyphrase */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Focus Keyphrase</label>
                      <button
                        type="button"
                        onClick={handleAiKeyphrase}
                        disabled={keyphraseAiLoading}
                        className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                      >
                        {keyphraseAiLoading ? "Generating…" : "✨ AI Suggest"}
                      </button>
                    </div>
                    <input
                      type="text"
                      name="focus_keyphrase"
                      value={focusKeyphrase}
                      onChange={(e) => setFocusKeyphrase(e.target.value)}
                      placeholder="e.g. about zion travel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Meta Title */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">
                        Meta Title <span className="text-gray-400 font-normal">({(metaTitle || titleValue).length}/60)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAiSeo("title")}
                        disabled={seoAiLoading !== null}
                        className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                      >
                        {seoAiLoading === "title" ? "Generating…" : "✨ AI Generate"}
                      </button>
                    </div>
                    <input
                      type="text"
                      name="meta_title"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder={titleValue || "Page title"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Meta Description */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">
                        Meta Description <span className="text-gray-400 font-normal">({metaDescription.length}/160)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAiSeo("description")}
                        disabled={seoAiLoading !== null}
                        className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                      >
                        {seoAiLoading === "description" ? "Generating…" : "✨ AI Generate"}
                      </button>
                    </div>
                    <textarea
                      name="meta_description"
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      rows={3}
                      placeholder="Brief description for search engines"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* SERP Preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Search Preview</p>
                    <SerpPreview
                      title={renderedTitle || `Page Title | ${siteConfig.siteName}`}
                      description={metaDescription || "Page description will appear here."}
                      url={`${siteConfig.siteUrl}/${slugValue}`}
                    />
                  </div>
              </div>
            </div>
          </div>

          {/* Right column — Sidebar */}
          <div className="w-72 flex-shrink-0 space-y-4">
            {/* Publish Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Publish</h3>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue={p?.status || "draft"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  name="save_draft"
                  value="1"
                  className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Save Draft
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {isNew ? "Create" : "Update"}
                </button>
              </div>

              {!isNew && p?.status === "published" && (
                <a
                  href={`/${p.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="block text-center text-xs text-primary hover:underline mt-1"
                >
                  View Page →
                </a>
              )}
            </div>

            {/* OG Image */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <ImageUploader
                label="OG Image"
                hint="Social sharing image (1200×630 recommended)"
                value={ogImage || null}
                onChange={(url) => setOgImage(url || "")}
              />
              <input type="hidden" name="og_image" value={ogImage} />
            </div>

            {/* SEO Scorecard */}
            {focusKeyphrase && (
              <SeoScorecard
                focusKeyphrase={focusKeyphrase}
                metaTitle={metaTitle || titleValue}
                metaDescription={metaDescription}
                bodyHtml={bodyHtml}
                slug={slugValue}
                contentType="page"
                duplicateKeyphrases={duplicateKeyphrases}
              />
            )}

          </div>
        </div>
      </Form>
    </div>
  );
}
