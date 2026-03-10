import postgres from "postgres";

const sql = postgres(
  "postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require"
);

// 1. Check if a header menu already exists
const locRows = await sql`
  SELECT menu_id FROM menu_locations WHERE location = 'header' LIMIT 1
`;
let menuId = locRows[0]?.menu_id;

if (menuId) {
  console.log(`Header already assigned to menu ${menuId}, updating items...`);
} else {
  // Create a new menu
  const menuRows = await sql`
    INSERT INTO menus (name, slug) VALUES ('Main Navigation', 'main-navigation')
    ON CONFLICT (slug) DO UPDATE SET name = 'Main Navigation'
    RETURNING id
  `;
  menuId = menuRows[0].id;
  console.log(`Created menu ${menuId}`);

  // Assign to header location
  await sql`UPDATE menu_locations SET menu_id = ${menuId} WHERE location = 'header'`;
  console.log("Assigned to header location");
}

// 2. Clear existing items
await sql`DELETE FROM menu_items WHERE menu_id = ${menuId}`;
console.log("Cleared existing menu items");

// 3. Insert top-level items
const topItems = [
  { label: "Things To Do", url: "/experiences", position: 0 },
  { label: "Lodging", url: "/lodging", position: 1 },
  { label: "Dining", url: "/dining", position: 2 },
  { label: "Plan Your Trip", url: "/transportation", position: 3 },
  { label: "News", url: "/news", position: 4 },
];

const parentIds = {};
for (const item of topItems) {
  const rows = await sql`
    INSERT INTO menu_items (menu_id, parent_id, label, url, item_type, position, open_in_new_tab)
    VALUES (${menuId}, ${null}, ${item.label}, ${item.url}, 'custom_link', ${item.position}, false)
    RETURNING id
  `;
  parentIds[item.label] = rows[0].id;
  console.log(`  Inserted top-level: ${item.label} (${rows[0].id})`);
}

// 4. Insert children for "Things To Do"
const thingsToDoChildren = [
  { label: "Experiences", url: "/experiences", position: 0 },
  { label: "Hiking", url: "/hiking", position: 1 },
  { label: "Parks", url: "/parks", position: 2 },
  { label: "Golf", url: "/golf", position: 3 },
];

for (const child of thingsToDoChildren) {
  await sql`
    INSERT INTO menu_items (menu_id, parent_id, label, url, item_type, position, open_in_new_tab)
    VALUES (${menuId}, ${parentIds["Things To Do"]}, ${child.label}, ${child.url}, 'custom_link', ${child.position}, false)
  `;
  console.log(`    Child: ${child.label}`);
}

// 5. Insert children for "Plan Your Trip"
const planChildren = [
  { label: "Transportation", url: "/transportation", position: 0 },
];

for (const child of planChildren) {
  await sql`
    INSERT INTO menu_items (menu_id, parent_id, label, url, item_type, position, open_in_new_tab)
    VALUES (${menuId}, ${parentIds["Plan Your Trip"]}, ${child.label}, ${child.url}, 'custom_link', ${child.position}, false)
  `;
  console.log(`    Child: ${child.label}`);
}

// 6. Verify
const allItems = await sql`
  SELECT id, parent_id, label, url, position FROM menu_items
  WHERE menu_id = ${menuId} ORDER BY parent_id NULLS FIRST, position
`;
console.log("\nFinal menu structure:");
for (const item of allItems) {
  const indent = item.parent_id ? "    " : "  ";
  console.log(`${indent}${item.label} → ${item.url}`);
}

await sql.end();
console.log("\nDone!");
