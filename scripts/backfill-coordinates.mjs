/**
 * Backfill lat/lng for listings that have a google_place_id but no coordinates.
 * Uses Google Places API (New) to fetch location data.
 *
 * Usage: node scripts/backfill-coordinates.mjs
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Get API key from settings table
const [setting] = await sql`SELECT value FROM settings WHERE key = 'google_places_api_key'`;
const API_KEY = setting?.value;
if (!API_KEY) {
  console.error("No google_places_api_key found in settings table");
  await sql.end();
  process.exit(1);
}

// Find listings missing coordinates
const listings = await sql`
  SELECT id, name, google_place_id 
  FROM listings 
  WHERE google_place_id IS NOT NULL 
    AND (lat IS NULL OR lng IS NULL)
  ORDER BY name
`;

console.log(`Found ${listings.length} listings missing coordinates.\n`);

if (listings.length === 0) {
  console.log("Nothing to backfill!");
  await sql.end();
  process.exit(0);
}

let updated = 0;
let failed = 0;

for (const listing of listings) {
  try {
    const url = `https://places.googleapis.com/v1/places/${listing.google_place_id}`;
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "location",
      },
    });

    if (!res.ok) {
      // Try legacy API as fallback
      const legacyUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${listing.google_place_id}&fields=geometry&key=${API_KEY}`;
      const legacyRes = await fetch(legacyUrl);
      const legacyData = await legacyRes.json();
      
      if (legacyData.status === "OK" && legacyData.result?.geometry?.location) {
        const { lat, lng } = legacyData.result.geometry.location;
        await sql`UPDATE listings SET lat = ${lat}, lng = ${lng} WHERE id = ${listing.id}`;
        updated++;
        console.log(`  ✓ ${listing.name} → ${lat}, ${lng} (legacy API)`);
      } else {
        failed++;
        console.log(`  ✗ ${listing.name} — legacy API: ${legacyData.status}`);
      }
      continue;
    }

    const data = await res.json();
    if (data.location?.latitude && data.location?.longitude) {
      const lat = data.location.latitude;
      const lng = data.location.longitude;
      await sql`UPDATE listings SET lat = ${lat}, lng = ${lng} WHERE id = ${listing.id}`;
      updated++;
      console.log(`  ✓ ${listing.name} → ${lat}, ${lng}`);
    } else {
      failed++;
      console.log(`  ✗ ${listing.name} — no location in response`);
    }

    // Rate limit: 100ms between requests
    await new Promise(r => setTimeout(r, 100));
  } catch (err) {
    failed++;
    console.log(`  ✗ ${listing.name} — ${err.message}`);
  }
}

console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
await sql.end();
