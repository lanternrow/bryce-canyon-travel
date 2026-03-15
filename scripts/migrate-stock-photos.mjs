// Migration: Add stock photo columns to the media table
// Run with: node scripts/migrate-stock-photos.mjs
//
// All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS),
// so running multiple times is safe.

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function migrate() {
  console.log("Adding stock photo columns to media table...");

  // Stock photo integration columns
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS photographer_name TEXT`;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS photographer_url TEXT`;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS source TEXT`;
  await sql`ALTER TABLE media ADD COLUMN IF NOT EXISTS source_id TEXT`;

  console.log("  ✓ photographer_name, photographer_url, source, source_id");

  // Indexes for stock photo lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_media_source ON media(source)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_source_id ON media(source_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_folder_id ON media(folder_id)`;

  console.log("  ✓ indexes on source, source_id, folder_id");

  // Google Place ID override for listings (from previous upgrade)
  await sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS has_no_google_place_id BOOLEAN DEFAULT false`;

  console.log("  ✓ has_no_google_place_id on listings");

  console.log("\nMigration complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
