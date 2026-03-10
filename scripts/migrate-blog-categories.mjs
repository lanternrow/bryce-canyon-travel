import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

function slugify(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCaseFromSlug(slug) {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS blog_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      meta_title TEXT,
      meta_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS description TEXT`;
  await sql`ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS meta_title TEXT`;
  await sql`ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS meta_description TEXT`;
  await sql`ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

  await sql`
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS category_id INTEGER
  `;
  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS focus_keyphrase TEXT`;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_category_id_fkey'
      ) THEN
        ALTER TABLE blog_posts
          ADD CONSTRAINT blog_posts_category_id_fkey
          FOREIGN KEY (category_id)
          REFERENCES blog_categories(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_blog_posts_category_id
    ON blog_posts(category_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_blog_categories_slug
    ON blog_categories(slug)
  `;

  const distinctRows = await sql`
    SELECT DISTINCT
      NULLIF(TRIM(category), '') AS category,
      NULLIF(TRIM(category_slug), '') AS category_slug
    FROM blog_posts
    WHERE (category IS NOT NULL AND TRIM(category) <> '')
       OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
  `;

  let insertedOrUpdated = 0;
  for (const row of distinctRows) {
    const slug = slugify(row.category_slug || row.category);
    if (!slug) continue;
    const name = (row.category || titleCaseFromSlug(slug) || "Uncategorized").trim();
    await sql`
      INSERT INTO blog_categories (name, slug, updated_at)
      VALUES (${name}, ${slug}, NOW())
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `;
    insertedOrUpdated += 1;
  }

  const categories = await sql`SELECT id, name, slug FROM blog_categories`;
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const categoryNameBySlug = new Map(categories.map((c) => [c.slug, c.name]));

  const postsToBackfill = await sql`
    SELECT id, category, category_slug, category_id
    FROM blog_posts
    WHERE category_id IS NULL
      AND (
        (category IS NOT NULL AND TRIM(category) <> '')
        OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
      )
  `;

  let postsBackfilled = 0;
  for (const post of postsToBackfill) {
    const slug = slugify(post.category_slug || post.category);
    const categoryId = categoryIdBySlug.get(slug);
    if (!categoryId) continue;
    const canonicalName = categoryNameBySlug.get(slug) || post.category || titleCaseFromSlug(slug);
    await sql`
      UPDATE blog_posts
      SET
        category_id = ${categoryId},
        category = ${canonicalName || null},
        category_slug = ${slug || null},
        updated_at = NOW()
      WHERE id = ${post.id}
    `;
    postsBackfilled += 1;
  }

  const [categoryCountRow] = await sql`SELECT COUNT(*)::int AS count FROM blog_categories`;
  const [linkedPostsRow] = await sql`SELECT COUNT(*)::int AS count FROM blog_posts WHERE category_id IS NOT NULL`;

  console.log("Blog categories migration complete.");
  console.log("Categories inserted/updated from posts:", insertedOrUpdated);
  console.log("Posts backfilled with category_id:", postsBackfilled);
  console.log("Total blog categories:", categoryCountRow.count);
  console.log("Blog posts linked to category_id:", linkedPostsRow.count);
}

migrate()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await sql.end();
    process.exit(1);
  });
