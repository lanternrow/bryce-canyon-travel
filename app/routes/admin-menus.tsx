import { Link, useLoaderData, Form, redirect, useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/admin-menus";
import { useState, useEffect } from "react";
import { requireAuth } from "../lib/auth.server";
import {
  getMenus,
  getMenuById,
  getMenuItems,
  createMenu,
  deleteMenu,
  saveMenuItems,
  getMenuLocations,
  setMenuLocation,
  type Menu,
  type MenuItem,
} from "../lib/menus.server";
import { getPublishedCustomPages } from "../lib/pages.server";
import sql from "../lib/db.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Menus | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const editId = url.searchParams.get("edit");

  const menus = await getMenus();
  const locations = await getMenuLocations();
  const pages = await getPublishedCustomPages();

  // Get categories for the "Add Category" tab
  const categories = await sql`
    SELECT DISTINCT listing_type as slug, listing_type as name FROM categories ORDER BY listing_type
  `;
  // Get unique listing types for category links
  const categoryTypes = [
    { slug: "listings", name: "All Listings" },
    { slug: "dining", name: "Dining" },
    { slug: "lodging", name: "Lodging" },
    { slug: "experiences", name: "Experiences" },
    { slug: "hiking", name: "Hiking" },
    { slug: "transportation", name: "Transportation" },
    { slug: "parks", name: "Parks" },
    { slug: "golf", name: "Golf" },
  ];

  let editMenu: Menu | null = null;
  let editItems: MenuItem[] = [];
  if (editId) {
    editMenu = await getMenuById(editId);
    if (editMenu) {
      editItems = await getMenuItems(editId);
    }
  }

  return { menus, locations, pages, categoryTypes, editMenu, editItems };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create-menu") {
    const name = (formData.get("name") as string) || "";
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!name.trim()) return { error: "Menu name is required" };
    const menu = await createMenu(name, slug);
    return redirect(`/admin/menus?edit=${menu.id}&toast=Menu+created`);
  }

  if (intent === "delete-menu") {
    const id = formData.get("id") as string;
    if (id) await deleteMenu(id);
    return redirect("/admin/menus?toast=Menu+deleted");
  }

  if (intent === "save-items") {
    const menuId = formData.get("menuId") as string;
    const itemsJson = formData.get("items") as string;
    try {
      const items = JSON.parse(itemsJson);
      await saveMenuItems(menuId, items);
    } catch {
      return { error: "Failed to save menu items" };
    }
    return redirect(`/admin/menus?edit=${menuId}&toast=Menu+saved`);
  }

  if (intent === "set-location") {
    const location = formData.get("location") as string;
    const menuId = formData.get("menuId") as string;
    await setMenuLocation(location, menuId || null);
    return redirect("/admin/menus?toast=Location+updated");
  }

  return null;
}

// Client-side item type for drag-and-drop state
interface ClientMenuItem {
  _cid: string; // Client-side unique ID
  parent_id: string | null;
  label: string;
  url: string;
  item_type: "custom_link" | "custom_page" | "category";
  page_slug: string | null;
  category_slug: string | null;
  open_in_new_tab: boolean;
}

let cidCounter = 0;
function nextCid() {
  return `cid_${Date.now()}_${cidCounter++}`;
}

export default function AdminMenus() {
  const { menus, locations, pages, categoryTypes, editMenu, editItems } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Menu items state
  const [items, setItems] = useState<ClientMenuItem[]>([]);
  const [addTab, setAddTab] = useState<"link" | "page" | "category">("link");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Load items when editMenu changes
  useEffect(() => {
    if (editItems) {
      setItems(
        (editItems as any[]).map((item: any) => ({
          _cid: item.id || nextCid(),
          parent_id: item.parent_id || null,
          label: item.label,
          url: item.url || "",
          item_type: item.item_type,
          page_slug: item.page_slug || null,
          category_slug: item.category_slug || null,
          open_in_new_tab: item.open_in_new_tab || false,
        }))
      );
    } else {
      setItems([]);
    }
  }, [editMenu]);

  // Add item handlers
  const addCustomLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    setItems([
      ...items,
      {
        _cid: nextCid(),
        parent_id: null,
        label: linkLabel,
        url: linkUrl,
        item_type: "custom_link",
        page_slug: null,
        category_slug: null,
        open_in_new_tab: false,
      },
    ]);
    setLinkLabel("");
    setLinkUrl("");
  };

  const addPageItem = (slug: string, title: string) => {
    setItems([
      ...items,
      {
        _cid: nextCid(),
        parent_id: null,
        label: title,
        url: `/${slug}`,
        item_type: "custom_page",
        page_slug: slug,
        category_slug: null,
        open_in_new_tab: false,
      },
    ]);
  };

  const addCategoryItem = (slug: string, name: string) => {
    setItems([
      ...items,
      {
        _cid: nextCid(),
        parent_id: null,
        label: name,
        url: `/${slug}`,
        item_type: "category",
        page_slug: null,
        category_slug: slug,
        open_in_new_tab: false,
      },
    ]);
  };

  const removeItem = (cid: string) => {
    // Also remove children
    setItems(items.filter((i) => i._cid !== cid && i.parent_id !== cid));
  };

  const moveUp = (index: number) => {
    const current = items[index];
    if (!current) return;

    const siblingIndexes = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => (current.parent_id ? it.parent_id === current.parent_id : !it.parent_id))
      .map(({ idx }) => idx);

    const siblingPos = siblingIndexes.indexOf(index);
    if (siblingPos <= 0) return;

    const siblingItems = siblingIndexes.map((idx) => items[idx]);
    [siblingItems[siblingPos - 1], siblingItems[siblingPos]] = [siblingItems[siblingPos], siblingItems[siblingPos - 1]];

    const newItems = [...items];
    siblingIndexes.forEach((idx, i) => {
      newItems[idx] = siblingItems[i];
    });
    setItems(newItems);
  };

  const moveDown = (index: number) => {
    const current = items[index];
    if (!current) return;

    const siblingIndexes = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => (current.parent_id ? it.parent_id === current.parent_id : !it.parent_id))
      .map(({ idx }) => idx);

    const siblingPos = siblingIndexes.indexOf(index);
    if (siblingPos === -1 || siblingPos >= siblingIndexes.length - 1) return;

    const siblingItems = siblingIndexes.map((idx) => items[idx]);
    [siblingItems[siblingPos], siblingItems[siblingPos + 1]] = [siblingItems[siblingPos + 1], siblingItems[siblingPos]];

    const newItems = [...items];
    siblingIndexes.forEach((idx, i) => {
      newItems[idx] = siblingItems[i];
    });
    setItems(newItems);
  };

  const indent = (cid: string) => {
    // Find the item and the item before it (which becomes the parent)
    const idx = items.findIndex((i) => i._cid === cid);
    if (idx <= 0) return;
    const item = items[idx];
    if (item.parent_id) return; // Already nested

    // Find the previous top-level item
    let parentCid: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (!items[i].parent_id) {
        parentCid = items[i]._cid;
        break;
      }
    }
    if (!parentCid) return;

    setItems(items.map((i) => (i._cid === cid ? { ...i, parent_id: parentCid } : i)));
  };

  const outdent = (cid: string) => {
    setItems(items.map((i) => (i._cid === cid ? { ...i, parent_id: null } : i)));
  };

  const startEdit = (cid: string) => {
    const item = items.find((i) => i._cid === cid);
    if (item) {
      setEditingItem(cid);
      setEditLabel(item.label);
    }
  };

  const saveEdit = () => {
    if (!editingItem) return;
    setItems(items.map((i) => (i._cid === editingItem ? { ...i, label: editLabel } : i)));
    setEditingItem(null);
    setEditLabel("");
  };

  // Build serializable items for form submission
  const serializeItems = () => {
    // Build a map from client ID → position index for parent resolution
    const cidToPosition = new Map<string, number>();
    items.forEach((item, idx) => {
      cidToPosition.set(item._cid, idx);
    });

    return items.map((item, idx) => ({
      parent_position: item.parent_id ? (cidToPosition.get(item.parent_id) ?? null) : null,
      label: item.label,
      url: item.url,
      item_type: item.item_type,
      page_slug: item.page_slug,
      category_slug: item.category_slug,
      position: idx,
      open_in_new_tab: item.open_in_new_tab,
    }));
  };

  const headerMenuId = (locations as any[]).find((l: any) => l.location === "header")?.menu_id || "";
  const footerMenuId = (locations as any[]).find((l: any) => l.location === "footer")?.menu_id || "";

  const typeBadge: Record<string, { bg: string; label: string }> = {
    custom_link: { bg: "bg-blue-100 text-blue-700", label: "Link" },
    custom_page: { bg: "bg-purple-100 text-purple-700", label: "Page" },
    category: { bg: "bg-amber-100 text-amber-700", label: "Category" },
  };

  // Separate top-level and children for rendering
  const topLevelItems = items.filter((i) => !i.parent_id);
  const getChildren = (parentCid: string) => items.filter((i) => i.parent_id === parentCid);

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Menus</span>
      </div>

      <h1 className="text-3xl font-bold text-dark mb-6">Menus</h1>

      <div className="flex gap-6">
        {/* Left Panel — Menu list + locations */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* Create Menu */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Create Menu</h3>
            <Form method="post" className="space-y-2">
              <input type="hidden" name="intent" value="create-menu" />
              <input
                type="text"
                name="name"
                placeholder="Menu name (e.g. Main Nav)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="w-full px-3 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create Menu
              </button>
            </Form>
          </div>

          {/* Menu List */}
          {(menus as any[]).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Your Menus</h3>
              <ul className="space-y-1">
                {(menus as any[]).map((menu: any) => (
                  <li key={menu.id} className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/menus?edit=${menu.id}`)}
                      className={`text-sm transition-colors ${
                        (editMenu as any)?.id === menu.id
                          ? "text-primary font-medium"
                          : "text-gray-700 hover:text-primary"
                      }`}
                    >
                      {menu.name}
                    </button>
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="delete-menu" />
                      <input type="hidden" name="id" value={menu.id} />
                      <button
                        type="submit"
                        onClick={(e) => {
                          if (!confirm(`Delete menu "${menu.name}"?`)) e.preventDefault();
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </Form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Location Assignments */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Menu Locations</h3>
            <p className="text-xs text-gray-500 mb-3">Assign menus to your site's header and footer.</p>

            <div className="space-y-3">
              {/* Header */}
              <Form method="post">
                <input type="hidden" name="intent" value="set-location" />
                <input type="hidden" name="location" value="header" />
                <label className="block text-xs font-medium text-gray-500 mb-1">Header Menu</label>
                <div className="flex gap-1">
                  <select
                    name="menuId"
                    defaultValue={headerMenuId}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— None (use default) —</option>
                    {(menus as any[]).map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-2 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </Form>

              {/* Footer */}
              <Form method="post">
                <input type="hidden" name="intent" value="set-location" />
                <input type="hidden" name="location" value="footer" />
                <label className="block text-xs font-medium text-gray-500 mb-1">Footer Menu</label>
                <div className="flex gap-1">
                  <select
                    name="menuId"
                    defaultValue={footerMenuId}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— None (use default) —</option>
                    {(menus as any[]).map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-2 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </Form>
            </div>
          </div>
        </div>

        {/* Right Panel — Menu Editor */}
        <div className="flex-1 min-w-0">
          {editMenu ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">
                  Editing: {(editMenu as any).name}
                </h2>
              </div>

              {/* Add Items */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex border-b border-gray-100">
                  {(["link", "page", "category"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setAddTab(tab)}
                      className={`flex-1 px-4 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                        addTab === tab
                          ? "bg-white text-primary border-b-2 border-primary"
                          : "bg-gray-50 text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab === "link" ? "Custom Link" : tab === "page" ? "Pages" : "Categories"}
                    </button>
                  ))}
                </div>

                <div className="p-4">
                  {addTab === "link" && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={linkLabel}
                        onChange={(e) => setLinkLabel(e.target.value)}
                        placeholder="Label (e.g. Home)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                      <input
                        type="text"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="URL (e.g. / or https://...)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={addCustomLink}
                        className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Add to Menu
                      </button>
                    </div>
                  )}

                  {addTab === "page" && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold px-3 pt-1">Core Pages</p>
                      {[
                        { slug: "", label: "Home" },
                        { slug: "weather", label: "Weather" },
                        { slug: "news", label: "News" },
                        { slug: "contact", label: "Contact" },
                      ].map((sp) => (
                        <button
                          key={sp.slug || "_home"}
                          type="button"
                          onClick={() => addPageItem(sp.slug, sp.label)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between"
                        >
                          <span>{sp.label}</span>
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ))}
                      {(pages as any[]).length > 0 && (
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold px-3 pt-2">Custom Pages</p>
                      )}
                      {(pages as any[]).length === 0 ? (
                        <p className="text-sm text-gray-400 py-2">
                          No published pages yet.{" "}
                          <Link to="/admin/pages/new" className="text-primary hover:underline">
                            Create one →
                          </Link>
                        </p>
                      ) : (
                        (pages as any[]).map((pg: any) => (
                          <button
                            key={pg.slug}
                            type="button"
                            onClick={() => addPageItem(pg.slug, pg.title)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between"
                          >
                            <span>{pg.title}</span>
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {addTab === "category" && (
                    <div className="space-y-1">
                      {categoryTypes.map((cat) => (
                        <button
                          key={cat.slug}
                          type="button"
                          onClick={() => addCategoryItem(cat.slug, cat.name)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-between"
                        >
                          <span>{cat.name}</span>
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Menu Structure */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Menu Structure</h3>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    Add items from the panel above to build your menu.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {topLevelItems.map((item, idx) => {
                      const globalIdx = items.findIndex((i) => i._cid === item._cid);
                      const badge = typeBadge[item.item_type] || typeBadge.custom_link;
                      const children = getChildren(item._cid);

                      return (
                        <li key={item._cid}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                            {/* Drag handle indicator */}
                            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zm-6 5h2v2H8v-2zm6 0h2v2h-2v-2z" />
                            </svg>

                            {editingItem === item._cid ? (
                              <div className="flex-1 flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-primary"
                                  autoFocus
                                />
                                <button type="button" onClick={saveEdit} className="text-emerald-600 hover:text-emerald-800">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span className="flex-1 text-sm text-gray-800 font-medium">{item.label}</span>
                            )}

                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${badge.bg}`}>
                              {badge.label}
                            </span>

                            {/* Controls */}
                            <div className="flex items-center gap-0.5">
                              <button type="button" onClick={() => moveUp(globalIdx)} className="p-1 text-gray-400 hover:text-gray-700" title="Move up">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button type="button" onClick={() => moveDown(globalIdx)} className="p-1 text-gray-400 hover:text-gray-700" title="Move down">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <button type="button" onClick={() => startEdit(item._cid)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit label">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button type="button" onClick={() => removeItem(item._cid)} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Children (nested items) */}
                          {children.length > 0 && (
                            <ul className="ml-8 mt-1 space-y-1">
                              {children.map((child) => {
                                const childGlobalIdx = items.findIndex((i) => i._cid === child._cid);
                                const childBadge = typeBadge[child.item_type] || typeBadge.custom_link;
                                return (
                                  <li key={child._cid}>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100">
                                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                      </svg>

                                      {editingItem === child._cid ? (
                                        <div className="flex-1 flex items-center gap-1">
                                          <input
                                            type="text"
                                            value={editLabel}
                                            onChange={(e) => setEditLabel(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-primary"
                                            autoFocus
                                          />
                                          <button type="button" onClick={saveEdit} className="text-emerald-600 hover:text-emerald-800">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="flex-1 text-sm text-gray-700">{child.label}</span>
                                      )}

                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${childBadge.bg}`}>
                                        {childBadge.label}
                                      </span>

                                      <div className="flex items-center gap-0.5">
                                        <button type="button" onClick={() => moveUp(childGlobalIdx)} className="p-1 text-gray-400 hover:text-gray-700" title="Move up">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                          </svg>
                                        </button>
                                        <button type="button" onClick={() => moveDown(childGlobalIdx)} className="p-1 text-gray-400 hover:text-gray-700" title="Move down">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </button>
                                        <button type="button" onClick={() => outdent(child._cid)} className="p-1 text-gray-400 hover:text-gray-700" title="Remove nesting">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14V5" />
                                          </svg>
                                        </button>
                                        <button type="button" onClick={() => startEdit(child._cid)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit label">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button type="button" onClick={() => removeItem(child._cid)} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {/* Indent button for top-level items */}
                          {!item.parent_id && idx > 0 && (
                            <button
                              type="button"
                              onClick={() => indent(item._cid)}
                              className="ml-8 mt-0.5 text-[10px] text-gray-400 hover:text-gray-600"
                            >
                              ↳ Nest under previous item
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Save Button */}
                {items.length > 0 && (
                  <Form method="post" className="mt-4">
                    <input type="hidden" name="intent" value="save-items" />
                    <input type="hidden" name="menuId" value={(editMenu as any).id} />
                    <input type="hidden" name="items" value={JSON.stringify(serializeItems())} />
                    <button
                      type="submit"
                      className="w-full px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Save Menu
                    </button>
                  </Form>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {(menus as any[]).length === 0
                  ? "No menus yet"
                  : "Select a menu to edit"}
              </h3>
              <p className="text-sm text-gray-500">
                {(menus as any[]).length === 0
                  ? "Create your first menu using the form on the left."
                  : "Click a menu name on the left to start editing its items."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
