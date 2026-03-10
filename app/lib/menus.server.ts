import sql from "./db.server";

// ── Types ──────────────────────────────────────

export interface Menu {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  menu_id: string;
  parent_id: string | null;
  label: string;
  url: string | null;
  item_type: "custom_link" | "custom_page" | "category";
  page_slug: string | null;
  category_slug: string | null;
  position: number;
  open_in_new_tab: boolean;
}

export interface ResolvedMenuItem {
  id: string;
  label: string;
  url: string;
  open_in_new_tab: boolean;
  children: ResolvedMenuItem[];
}

export interface MenuLocation {
  location: "header" | "footer";
  menu_id: string | null;
}

// ── Menus CRUD ─────────────────────────────────

export async function getMenus(): Promise<Menu[]> {
  const rows = await sql`
    SELECT id, name, slug, created_at, updated_at
    FROM menus ORDER BY name ASC
  `;
  return rows as unknown as Menu[];
}

export async function getMenuById(id: string): Promise<Menu | null> {
  const rows = await sql`
    SELECT id, name, slug, created_at, updated_at
    FROM menus WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rows[0] as unknown as Menu;
}

export async function createMenu(name: string, slug: string): Promise<Menu> {
  const rows = await sql`
    INSERT INTO menus (name, slug) VALUES (${name}, ${slug})
    RETURNING id, name, slug, created_at, updated_at
  `;
  return rows[0] as unknown as Menu;
}

export async function updateMenu(id: string, name: string, slug: string): Promise<void> {
  await sql`
    UPDATE menus SET name = ${name}, slug = ${slug}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function deleteMenu(id: string): Promise<void> {
  // Also unassign from locations
  await sql`UPDATE menu_locations SET menu_id = NULL WHERE menu_id = ${id}`;
  await sql`DELETE FROM menus WHERE id = ${id}`;
}

// ── Menu Items ─────────────────────────────────

export async function getMenuItems(menuId: string): Promise<MenuItem[]> {
  const rows = await sql`
    SELECT id, menu_id, parent_id, label, url, item_type, page_slug, category_slug, position, open_in_new_tab
    FROM menu_items
    WHERE menu_id = ${menuId}
    ORDER BY position ASC
  `;
  return rows as unknown as MenuItem[];
}

export async function saveMenuItems(
  menuId: string,
  items: Array<{
    parent_id?: string | null;
    parent_position?: number | null; // index of parent item (for two-pass insert)
    label: string;
    url?: string | null;
    item_type: string;
    page_slug?: string | null;
    category_slug?: string | null;
    position: number;
    open_in_new_tab?: boolean;
  }>
): Promise<void> {
  await sql.begin(async (tx: any) => {
    // Delete all existing items for this menu
    await tx`DELETE FROM menu_items WHERE menu_id = ${menuId}`;

    // Two-pass insert: top-level first, then children with resolved parent IDs
    const topLevel = items.filter((i) => !i.parent_id && (i.parent_position === null || i.parent_position === undefined));
    const children = items.filter((i) => i.parent_id || (i.parent_position !== null && i.parent_position !== undefined));

    // Map position → real UUID for parent resolution
    const positionToId = new Map<number, string>();

    // Pass 1: Insert top-level items
    for (const item of topLevel) {
      const rows = await tx`
        INSERT INTO menu_items (menu_id, parent_id, label, url, item_type, page_slug, category_slug, position, open_in_new_tab)
        VALUES (
          ${menuId},
          ${null},
          ${item.label},
          ${item.url || null},
          ${item.item_type},
          ${item.page_slug || null},
          ${item.category_slug || null},
          ${item.position},
          ${item.open_in_new_tab || false}
        )
        RETURNING id
      `;
      positionToId.set(item.position, rows[0].id);
    }

    // Pass 2: Insert children with resolved parent IDs
    for (const item of children) {
      let resolvedParentId: string | null = null;

      if (item.parent_position !== null && item.parent_position !== undefined) {
        resolvedParentId = positionToId.get(item.parent_position) || null;
      } else if (item.parent_id) {
        resolvedParentId = item.parent_id;
      }

      await tx`
        INSERT INTO menu_items (menu_id, parent_id, label, url, item_type, page_slug, category_slug, position, open_in_new_tab)
        VALUES (
          ${menuId},
          ${resolvedParentId},
          ${item.label},
          ${item.url || null},
          ${item.item_type},
          ${item.page_slug || null},
          ${item.category_slug || null},
          ${item.position},
          ${item.open_in_new_tab || false}
        )
      `;
    }
  });
}

// ── Menu Locations ─────────────────────────────

export async function getMenuLocations(): Promise<MenuLocation[]> {
  const rows = await sql`
    SELECT location, menu_id FROM menu_locations ORDER BY location
  `;
  return rows as unknown as MenuLocation[];
}

export async function setMenuLocation(location: string, menuId: string | null): Promise<void> {
  await sql`
    UPDATE menu_locations SET menu_id = ${menuId} WHERE location = ${location}
  `;
}

// ── Resolved menu for rendering ────────────────

/**
 * Get the fully resolved menu for a location (header/footer).
 * Resolves page slugs to URLs, category slugs to URLs, and builds a nested tree.
 * Returns null if no menu is assigned to the location.
 */
export async function getMenuForLocation(
  location: "header" | "footer"
): Promise<ResolvedMenuItem[] | null> {
  // Get the assigned menu
  const locRows = await sql`
    SELECT menu_id FROM menu_locations WHERE location = ${location} LIMIT 1
  `;
  const menuId = locRows[0]?.menu_id;
  if (!menuId) return null;

  // Get all items for that menu
  const items = await getMenuItems(menuId);
  if (items.length === 0) return null;

  // Resolve each item's URL
  const resolved: Array<MenuItem & { resolvedUrl: string }> = items.map((item) => {
    let resolvedUrl = item.url || "#";

    if (item.item_type === "custom_page" && item.page_slug) {
      resolvedUrl = `/${item.page_slug}`;
    } else if (item.item_type === "category" && item.category_slug) {
      // Category slugs map to directory listing type routes
      resolvedUrl = `/${item.category_slug}`;
    }

    return { ...item, resolvedUrl };
  });

  // Build tree: top-level items first, then attach children
  const topLevel = resolved.filter((i) => !i.parent_id);
  const childrenMap = new Map<string, typeof resolved>();

  for (const item of resolved) {
    if (item.parent_id) {
      const existing = childrenMap.get(item.parent_id) || [];
      existing.push(item);
      childrenMap.set(item.parent_id, existing);
    }
  }

  return topLevel.map((item) => ({
    id: item.id,
    label: item.label,
    url: item.resolvedUrl,
    open_in_new_tab: item.open_in_new_tab,
    children: (childrenMap.get(item.id) || []).map((child) => ({
      id: child.id,
      label: child.label,
      url: child.resolvedUrl,
      open_in_new_tab: child.open_in_new_tab,
      children: [], // Only one level of nesting
    })),
  }));
}
