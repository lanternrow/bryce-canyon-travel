import { Link, useLoaderData, Form, useActionData } from "react-router";
import type { Route } from "./+types/admin-redirects";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import {
  getRedirects,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  type Redirect,
} from "../lib/queries.server";
import { clearRedirectCache } from "../lib/redirect-cache.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Redirects | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const redirects = await getRedirects();
  return { redirects };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const from_path = (formData.get("from_path") as string)?.trim();
    const to_path = (formData.get("to_path") as string)?.trim();
    const status_code = Number(formData.get("status_code")) || 301;
    const notes = (formData.get("notes") as string)?.trim() || undefined;

    if (!from_path || !to_path) {
      return { error: "Both 'From' and 'To' paths are required." };
    }
    if (!from_path.startsWith("/")) {
      return { error: "'From' path must start with /." };
    }
    if (from_path === to_path) {
      return { error: "'From' and 'To' paths must be different." };
    }

    try {
      await createRedirect({ from_path, to_path, status_code, notes });
      clearRedirectCache();
    } catch (err: any) {
      if (err?.message?.includes("unique") || err?.code === "23505") {
        return { error: `A redirect from "${from_path}" already exists.` };
      }
      return { error: "Failed to create redirect." };
    }
  }

  if (intent === "update") {
    const id = formData.get("id") as string;
    const from_path = (formData.get("from_path") as string)?.trim();
    const to_path = (formData.get("to_path") as string)?.trim();
    const status_code = Number(formData.get("status_code")) || 301;
    const notes = (formData.get("notes") as string)?.trim() || undefined;

    if (!from_path || !to_path) {
      return { error: "Both 'From' and 'To' paths are required." };
    }

    try {
      await updateRedirect(id, { from_path, to_path, status_code, notes });
      clearRedirectCache();
    } catch (err: any) {
      if (err?.message?.includes("unique") || err?.code === "23505") {
        return { error: `A redirect from "${from_path}" already exists.` };
      }
      return { error: "Failed to update redirect." };
    }
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await deleteRedirect(id);
    clearRedirectCache();
  }

  if (intent === "import-legacy") {
    // Import the legacy hardcoded redirects from redirect-directory.tsx
    const legacyMap: Record<string, string> = {
      "zion-canyon-brew-pub": "/listing/dining/zion-canyon-brew-pub",
      "cactus-room": "/listing/dining/cactus-room",
      "balcony-one": "/listing/dining/balcony-one",
      "the-park-house": "/listing/dining/the-park-house",
      "kings-landing-bistro": "/listing/dining/kings-landing-bistro",
      "dulivia-ristorante-italiano": "/listing/dining/dulivia-ristorante-italiano",
      "jacks-sports-grill": "/listing/dining/jacks-sports-grill",
      "switchback-grille": "/listing/dining/switchback-grille",
      "bit-spur-restaurant-saloon": "/listing/dining/bit-spur-restaurant-saloon",
      "memes-cafe": "/listing/dining/memes-cafe",
      "oscars-cafe": "/listing/dining/oscars-cafe",
      porters: "/listing/dining/porters",
      "zion-pizza-noodle-co": "/listing/dining/zion-pizza-noodle-co",
      "bamboo-chinese-restaurant": "/listing/dining/bamboo-chinese-restaurant",
      "camp-outpost": "/listing/dining/camp-outpost",
      "whiptail-grill": "/listing/dining/whiptail-grill",
      "feellove-coffee-zion": "/listing/dining/feellove-coffee-zion",
      "perks-coffee-espresso-smoothies-in-zion": "/listing/dining/perks-coffee-espresso-smoothies-in-zion",
      anthera: "/listing/dining/anthera",
      "cafe-soleil": "/listing/dining/cafe-soleil",
      "thai-sapa": "/listing/dining/thai-sapa",
      subway: "/listing/dining/subway",
      "spotted-dog-cafe": "/listing/dining/spotted-dog-cafe",
      "springdale-candy-company": "/listing/dining/springdale-candy-company",
      "deep-creek-coffee-co": "/listing/dining/deep-creek-coffee-co",
      "river-rock-roasting-company": "/listing/dining/river-rock-roasting-company",
      "sol-foods-supermarket": "/listing/dining/sol-foods-supermarket",
    };

    let imported = 0;
    for (const [slug, to] of Object.entries(legacyMap)) {
      const from = `/directory/${slug}`;
      try {
        await createRedirect({ from_path: from, to_path: to, status_code: 301, notes: "Imported from legacy redirect map" });
        imported++;
      } catch {
        // Skip duplicates
      }
    }
    clearRedirectCache();
    return { success: `Imported ${imported} legacy redirects.` };
  }

  return { success: true };
}

export default function AdminRedirects() {
  const { redirects } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const items = redirects as Redirect[];

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Redirects</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-dark">Redirects</h1>
          <p className="text-gray-500 mt-1">Manage 301/302 URL redirects. Changes take effect within 60 seconds.</p>
        </div>
        <div className="flex items-center gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="import-legacy" />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Import Legacy
            </button>
          </Form>
          <button
            type="button"
            onClick={() => { setShowAddForm(true); setEditingId(null); }}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            + Add Redirect
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionData && (actionData as any).error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {(actionData as any).error}
        </div>
      )}
      {actionData && (actionData as any).success && typeof (actionData as any).success === "string" && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {(actionData as any).success}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-dark mb-4">New Redirect</h2>
          <Form method="post" onSubmit={() => setShowAddForm(false)}>
            <input type="hidden" name="intent" value="create" />
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">From Path</label>
                <input
                  type="text"
                  name="from_path"
                  required
                  placeholder="/old-page"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">To Path</label>
                <input
                  type="text"
                  name="to_path"
                  required
                  placeholder="/new-page"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select name="status_code" className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-primary">
                  <option value="301">301</option>
                  <option value="302">302</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="sm:col-span-1 flex gap-2">
                <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                  Add
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </Form>
        </div>
      )}

      {/* Redirects Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <p className="text-sm">No redirects configured yet.</p>
            <p className="text-xs mt-1">Click "Add Redirect" to create one, or "Import Legacy" to import from the hardcoded redirect map.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">From</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">To</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Code</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Hits</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  {editingId === r.id ? (
                    <td colSpan={6} className="px-6 py-3">
                      <Form method="post" onSubmit={() => setEditingId(null)}>
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={r.id} />
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-4">
                            <input type="text" name="from_path" defaultValue={r.from_path} required className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-primary" />
                          </div>
                          <div className="col-span-4">
                            <input type="text" name="to_path" defaultValue={r.to_path} required className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-primary" />
                          </div>
                          <div className="col-span-1">
                            <select name="status_code" defaultValue={r.status_code} className="w-full px-1 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary">
                              <option value="301">301</option>
                              <option value="302">302</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input type="text" name="notes" defaultValue={r.notes || ""} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-primary" />
                          </div>
                          <div className="col-span-1 flex gap-1">
                            <button type="submit" className="px-2 py-1.5 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90">Save</button>
                            <button type="button" onClick={() => setEditingId(null)} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                          </div>
                        </div>
                      </Form>
                    </td>
                  ) : (
                    <>
                      <td className="px-6 py-3 text-sm font-mono text-gray-900 truncate max-w-[200px]" title={r.from_path}>{r.from_path}</td>
                      <td className="px-6 py-3 text-sm font-mono text-gray-600 truncate max-w-[200px]" title={r.to_path}>{r.to_path}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status_code === 301 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {r.status_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right tabular-nums">{r.hit_count}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 truncate max-w-[150px]" title={r.notes || ""}>{r.notes || "—"}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingId(r.id); setShowAddForm(false); }}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <Form method="post" onSubmit={(e) => { if (!confirm("Delete this redirect?")) e.preventDefault(); }}>
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-xs text-red-500 hover:underline">Delete</button>
                          </Form>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-400">
        <p>{items.length} redirect{items.length !== 1 ? "s" : ""} configured. Hit counts update in real-time; cache refreshes every 60 seconds.</p>
      </div>
    </div>
  );
}
