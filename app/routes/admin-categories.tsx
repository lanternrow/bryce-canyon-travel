import { Link, useLoaderData, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-categories";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import { getCategoriesWithCounts, createCategory, deleteCategory } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Categories | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const categories = await getCategoriesWithCounts();
  return { categories };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = formData.get("name") as string;
    const slug = (formData.get("slug") as string) ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const listing_type = formData.get("listing_type") as string;
    const parent_id = formData.get("parent_id") ? Number(formData.get("parent_id")) : undefined;
    const description = (formData.get("description") as string) || undefined;

    await createCategory({ name, slug, listing_type, parent_id, description });
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    await deleteCategory(id);
  }

  return redirect("/admin/categories");
}

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  listing_type: string;
  parent_id: number | null;
  listing_count: number;
};

const listingTypes = ["dining", "experiences", "golf", "hiking", "lodging", "parks", "transportation"];

const typeColors: Record<string, string> = {
  dining: "bg-orange-100 text-orange-700",
  lodging: "bg-blue-100 text-blue-700",
  experiences: "bg-purple-100 text-purple-700",
  hiking: "bg-green-100 text-green-700",
  transportation: "bg-gray-100 text-gray-700",
  parks: "bg-emerald-100 text-emerald-700",
  golf: "bg-lime-100 text-lime-700",
};

export default function AdminCategories() {
  const { categories } = useLoaderData<typeof loader>();
  const cats = categories as unknown as CategoryRow[];

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    listing_type: "",
    parent_id: "",
    description: "",
  });

  const toggleSection = (type: string) => {
    setCollapsedSections((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const handleNameChange = (value: string) => {
    setFormData({
      ...formData,
      name: value,
      slug: value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    });
  };

  const groupedCategories = listingTypes.reduce<Record<string, CategoryRow[]>>((acc, type) => {
    const items = cats.filter((c) => c.listing_type === type);
    if (items.length > 0) {
      acc[type] = items;
    }
    return acc;
  }, {});

  return (
    <div className="px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Categories</span>
      </div>
      <h1 className="text-3xl font-bold text-dark mb-8">Categories</h1>

      <div className="flex gap-8">
        {/* Left Column — Add New Category Form */}
        <div className="w-[350px] flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-dark mb-5">Add New Category</h2>

            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="create" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Breakfast & Brunch"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated-from-name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">Auto-generated from name. Edit if needed.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Listing Type</label>
                <select
                  name="listing_type"
                  required
                  value={formData.listing_type}
                  onChange={(e) => setFormData({ ...formData, listing_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">Select type...</option>
                  {listingTypes.map((type) => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                <select
                  name="parent_id"
                  value={formData.parent_id}
                  onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">None</option>
                  {[...cats].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  name="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description for this category"
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

        {/* Right Column — Categories Table */}
        <div className="flex-1 min-w-0 space-y-4">
          {Object.entries(groupedCategories).map(([type, items]) => (
            <div key={type} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(type)}
                className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${collapsedSections[type] ? "" : "rotate-90"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-semibold text-dark capitalize">{type}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColors[type] || "bg-gray-100 text-gray-700"}`}>
                    {items.length} {items.length === 1 ? "category" : "categories"}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {items.reduce((sum, c) => sum + (c.listing_count || 0), 0)} listings
                </span>
              </button>

              {/* Table */}
              {!collapsedSections[type] && (
                <table className="w-full">
                  <thead>
                    <tr className="border-t border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Slug</th>
                      <th className="px-5 py-3 text-center">Count</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((cat) => (
                      <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-dark">{cat.name}</td>
                        <td className="px-5 py-3 text-sm text-gray-500 font-mono">{cat.slug}</td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-center">{cat.listing_count || 0}</td>
                        <td className="px-5 py-3 text-right">
                          <Form
                            method="post"
                            className="inline"
                            onSubmit={(e) => { if (!confirm(`Delete "${cat.name}"?`)) e.preventDefault(); }}
                          >
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="id" value={cat.id} />
                            <button
                              type="submit"
                              className="text-xs px-2.5 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </Form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {Object.keys(groupedCategories).length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
              No categories yet. Add your first category using the form.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
