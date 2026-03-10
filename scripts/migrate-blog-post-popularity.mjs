import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function migrate() {
  await sql`
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS views_30d INTEGER NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`
    ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS popularity_refreshed_at TIMESTAMPTZ
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_blog_posts_is_popular_true
    ON blog_posts (is_popular)
    WHERE is_popular = TRUE
  `;

  const columns = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'blog_posts'
      AND column_name IN ('views_30d', 'is_popular', 'popularity_refreshed_at')
    ORDER BY column_name
  `;
  console.log("Blog post popularity columns:", columns);
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
