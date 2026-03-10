import postgres from "postgres";

const sql = postgres(
  "postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require"
);

// 1. Check existing constraint
const constraints = await sql`
  SELECT conname, pg_get_constraintdef(oid) as definition
  FROM pg_constraint
  WHERE conrelid = 'categories'::regclass
    AND conname = 'categories_listing_type_check'
`;
console.log("Current constraint:", constraints[0]?.definition);

// 2. Also check listings table for the same constraint
const listingConstraints = await sql`
  SELECT conname, pg_get_constraintdef(oid) as definition
  FROM pg_constraint
  WHERE conrelid = 'listings'::regclass
    AND conname LIKE '%listing_type%'
`;
console.log("Listings type constraints:", listingConstraints);

// 3. Drop and recreate the categories constraint with 'golf' added
await sql`ALTER TABLE categories DROP CONSTRAINT categories_listing_type_check`;
await sql`ALTER TABLE categories ADD CONSTRAINT categories_listing_type_check CHECK (listing_type IN ('dining', 'lodging', 'experiences', 'hiking', 'transportation', 'parks', 'golf'))`;
console.log("Updated categories constraint to include 'golf'");

// 4. Update listings constraint too if it exists
for (const c of listingConstraints) {
  if (!c.definition.includes("golf")) {
    await sql`ALTER TABLE listings DROP CONSTRAINT ${sql(c.conname)}`;
    await sql`ALTER TABLE listings ADD CONSTRAINT ${sql(c.conname)} CHECK (type IN ('dining', 'lodging', 'experiences', 'hiking', 'transportation', 'parks', 'golf'))`;
    console.log(`Updated listings constraint ${c.conname} to include 'golf'`);
  }
}

// 5. Now insert golf categories
const r1 = await sql`
  INSERT INTO categories (name, slug, listing_type)
  VALUES ('Golf Courses', 'golf-courses', 'golf')
  ON CONFLICT DO NOTHING
  RETURNING *
`;
console.log("Created:", r1);

const r2 = await sql`
  INSERT INTO categories (name, slug, listing_type)
  VALUES ('Driving Ranges', 'driving-ranges', 'golf')
  ON CONFLICT DO NOTHING
  RETURNING *
`;
console.log("Created:", r2);

await sql.end();
console.log("Done!");
