import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function migrate() {
  await sql`
    ALTER TABLE hiking_details
    ADD COLUMN IF NOT EXISTS data_sources TEXT
  `;

  const columns = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'hiking_details'
      AND column_name = 'data_sources'
  `;
  console.log("hiking_details.data_sources column:", columns);
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
