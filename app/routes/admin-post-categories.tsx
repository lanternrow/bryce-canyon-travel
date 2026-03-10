import { Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/admin-post-categories";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import {
  createBlogCategory,
  deleteBlogCategory,
  getBlogCategoriesWithPostCounts,
  updateBlogCategory,
} from "../lib/queries.server";
import { getNewsCategoryPath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

type BlogCategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  post_count: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function meta() {
  return [{ title: `News Categories | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const categories = await getBlogCategoriesWithPostCounts({
    includeEmpty: true,
    status: "published",
  });
  return { categories };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    const slug = slugify(String(formData.get("slug") || "") || name);
    if (name && slug) {
      await createBlogCategory({
        name,
        slug,
        description: String(formData.get("description") || "").trim() || undefined,
        meta_title: String(formData.get("meta_title") || "").trim() || undefined,
        meta_description: String(formData.get("meta_description") || "").trim() || undefined,
      });
    }
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const name = String(formData.get("name") || "").trim();
    const slug = slugify(String(formData.get("slug") || "") || name);
    if (Number.isFinite(id) && name && slug) {
      await updateBlogCategory(id, {
        name,
        slug,
        description: String(formData.get("description") || "").trim(),
        meta_title: String(formData.get("meta_title") || "").trim(),
        meta_description: String(formData.get("meta_description") || "").trim(),
      });
    }
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    if (Number.isFinite(id)) {
      await deleteBlogCategory(id);
    }
  }

  return redirect("/admin/post-categories");
}

function CategoryCard({
  category,
  isExpanded,
  onToggle,
}: {
  category: BlogCategoryRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [description, setDescription] = useState(category.description || "");
  const [metaTitle, setMetaTitle] = useState(category.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(category.meta_description || "");
  const [aiLoading, setAiLoading] = useState(false);

  const handleAiGenerate = async () => {
    if (!name.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "both",
          name: name.trim(),
          pageType: "blog_category",
          slug: slugify(slug || name),
          description: description.trim() || undefined,
          currentMetaTitle: metaTitle || undefined,
          currentMetaDescription: metaDescription || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        if (data.metaTitle) setMetaTitle(data.metaTitle);
        if (data.metaDescription) setMetaDescription(data.metaDescription);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-dark truncate">{name || category.name}</h3>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {getNewsCategoryPath(slug || category.slug)} · {category.post_count} published{" "}
            {category.post_count === 1 ? "article" : "articles"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href={getNewsCategoryPath(category.slug)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            View Category
          </a>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <Form
        method="post"
        className={`space-y-3 mt-4 pt-4 border-t border-gray-100 ${isExpanded ? "" : "hidden"}`}
      >
        <input type="hidden" name="id" value={category.id} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => {
                const nextName = e.target.value;
                setName(nextName);
                if (!slug || slug === slugify(name)) {
                  setSlug(slugify(nextName));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
            <input
              type="text"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Category Description
          </label>
          <textarea
            rows={2}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
            placeholder="Optional intro shown on the category page."
          />
        </div>

        <div className="pt-1 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              SEO
            </h4>
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={aiLoading}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {aiLoading ? "Generating..." : "AI Generate"}
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Meta Title</label>
              <input
                type="text"
                name="meta_title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder={`${name} Articles`}
              />
              <p className="text-xs text-gray-400 mt-1">{metaTitle.length}/65</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Meta Description
              </label>
              <textarea
                rows={2}
                name="meta_description"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
                placeholder={`Browse ${name.toLowerCase()} articles and guides.`}
              />
              <p className="text-xs text-gray-400 mt-1">{metaDescription.length}/160</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="submit"
            name="intent"
            value="update"
            className="px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Save Category
          </button>
          <button
            type="submit"
            name="intent"
            value="delete"
            onClick={(e) => {
              if (!confirm(`Delete "${name}"? News articles in this category will become uncategorized.`)) {
                e.preventDefault();
              }
            }}
            className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </Form>
    </div>
  );
}

export default function AdminPostCategories() {
  const { categories } = useLoaderData<typeof loader>();
  const rows = categories as unknown as BlogCategoryRow[];
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(() => {
    if (rows.length === 0) return new Set<number>();
    return new Set<number>([rows[0].id]);
  });

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMetaTitle, setNewMetaTitle] = useState("");
  const [newMetaDescription, setNewMetaDescription] = useState("");

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <span>News Categories</span>
      </div>
      <h1 className="text-3xl font-bold text-dark mb-8">News Categories</h1>

      <div className="flex gap-8 items-start">
        <div className="w-[360px] flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-dark mb-5">Add New Category</h2>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="create" />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  value={newName}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setNewName(nextName);
                    if (!newSlug || newSlug === slugify(newName)) {
                      setNewSlug(slugify(nextName));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  name="slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(slugify(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Description
                </label>
                <textarea
                  rows={3}
                  name="description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta Title</label>
                <input
                  type="text"
                  name="meta_title"
                  value={newMetaTitle}
                  onChange={(e) => setNewMetaTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meta Description
                </label>
                <textarea
                  rows={2}
                  name="meta_description"
                  value={newMetaDescription}
                  onChange={(e) => setNewMetaDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Add Category
              </button>
            </Form>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          {rows.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              isExpanded={expandedCategoryIds.has(category.id)}
              onToggle={() => {
                setExpandedCategoryIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(category.id)) {
                    next.delete(category.id);
                  } else {
                    next.add(category.id);
                  }
                  return next;
                });
              }}
            />
          ))}

          {rows.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
              No news categories yet. Add your first category using the form.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
