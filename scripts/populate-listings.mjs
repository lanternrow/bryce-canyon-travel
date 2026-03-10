#!/usr/bin/env node
/**
 * populate-listings.mjs
 *
 * Searches Google Places for businesses around the Zion National Park area,
 * fetches detailed info for each, and creates draft listings in the database.
 *
 * Usage:
 *   node scripts/populate-listings.mjs                    # Run all categories
 *   node scripts/populate-listings.mjs --type dining      # Run only dining
 *   node scripts/populate-listings.mjs --type lodging     # Run only lodging
 *   node scripts/populate-listings.mjs --dry-run          # Preview without inserting
 */

import postgres from "postgres";

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_NLeYfn3Kqd1C@ep-dry-rice-akvotzdw.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require";

const sql = postgres(DB_URL);

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const typeFilter = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;

// Rate limiting: Google allows ~10 QPS for Place Details
const DETAIL_DELAY_MS = 150;
const SEARCH_DELAY_MS = 2000; // delay between search pages/queries

// ─── Search Queries ──────────────────────────────────────────────────────────
// Each entry: { query, type (our listing type), defaultCategoryId }

const SEARCH_QUERIES = [
  // === DINING ===
  { query: "restaurants in Springdale UT", type: "dining", defaultCategoryId: 1 },
  { query: "restaurants in Virgin UT near Zion", type: "dining", defaultCategoryId: 1 },
  { query: "restaurants in Hurricane UT", type: "dining", defaultCategoryId: 1 },
  { query: "restaurants in Kanab UT", type: "dining", defaultCategoryId: 1 },
  { query: "restaurants in Orderville UT", type: "dining", defaultCategoryId: 1 },
  { query: "cafes and bakeries in Springdale UT", type: "dining", defaultCategoryId: 4 },
  { query: "fine dining near Zion National Park", type: "dining", defaultCategoryId: 5 },
  { query: "pizza near Zion National Park", type: "dining", defaultCategoryId: 3 },

  // === LODGING ===
  { query: "hotels in Springdale UT", type: "lodging", defaultCategoryId: 10 },
  { query: "hotels near Zion National Park", type: "lodging", defaultCategoryId: 10 },
  { query: "lodging in Hurricane UT", type: "lodging", defaultCategoryId: 10 },
  { query: "lodging in Kanab UT", type: "lodging", defaultCategoryId: 10 },
  { query: "campgrounds near Zion National Park", type: "lodging", defaultCategoryId: 13 },
  { query: "glamping near Zion National Park", type: "lodging", defaultCategoryId: 12 },
  { query: "vacation rentals Springdale UT Zion", type: "lodging", defaultCategoryId: 11 },
  { query: "bed and breakfast near Zion National Park", type: "lodging", defaultCategoryId: 14 },

  // === EXPERIENCES ===
  { query: "guided tours Zion National Park", type: "experiences", defaultCategoryId: 20 },
  { query: "adventure companies Springdale UT", type: "experiences", defaultCategoryId: 20 },
  { query: "canyoneering tours Zion", type: "experiences", defaultCategoryId: 22 },
  { query: "horseback riding near Zion National Park", type: "experiences", defaultCategoryId: 23 },
  { query: "gear rental Springdale UT Zion", type: "experiences", defaultCategoryId: 21 },
  { query: "ATV tours near Zion National Park", type: "experiences", defaultCategoryId: 20 },
  { query: "rock climbing guides Zion", type: "experiences", defaultCategoryId: 20 },
  { query: "photography tours Zion National Park", type: "experiences", defaultCategoryId: 24 },

  // === TRANSPORTATION ===
  { query: "shuttle service Zion National Park Springdale", type: "transportation", defaultCategoryId: 40 },
  { query: "car rental near Zion National Park", type: "transportation", defaultCategoryId: 41 },
  { query: "car rental St George UT", type: "transportation", defaultCategoryId: 41 },
  { query: "bike rental Springdale UT Zion", type: "transportation", defaultCategoryId: 42 },
];

// ─── Category Mapping Helpers ────────────────────────────────────────────────

// Google place types that indicate dining subcategories
function refineDiningCategory(name, types, editorialSummary) {
  const nameL = name.toLowerCase();
  const summary = (editorialSummary || "").toLowerCase();
  const allText = nameL + " " + summary;

  if (types.includes("cafe") || allText.includes("cafe") || allText.includes("coffee") || allText.includes("bakery")) return 4; // Cafe & Bakery
  if (allText.includes("pizza")) return 3; // Pizza
  if (allText.includes("mexican") || allText.includes("taco") || allText.includes("burrito")) return 2; // Mexican
  if (allText.includes("fine dining") || allText.includes("upscale")) return 5; // Fine Dining
  return 1; // American Restaurant (default)
}

function refineLodgingCategory(name, types, editorialSummary) {
  const nameL = name.toLowerCase();
  const summary = (editorialSummary || "").toLowerCase();
  const allText = nameL + " " + types.join(" ") + " " + summary;

  if (allText.includes("campground") || allText.includes("camping") || allText.includes("rv park")) return 13; // Campground
  if (allText.includes("glamping") || allText.includes("canvas") || allText.includes("tent")) return 12; // Glamping
  if (allText.includes("vacation rental") || allText.includes("vrbo") || allText.includes("airbnb") || allText.includes("cabin rental")) return 11; // Vacation Rental
  if (allText.includes("bed and breakfast") || allText.includes("b&b") || allText.includes("inn")) return 14; // B&B / Inn
  return 10; // Hotel (default)
}

function refineExperienceCategory(name, types, editorialSummary) {
  const nameL = name.toLowerCase();
  const summary = (editorialSummary || "").toLowerCase();
  const allText = nameL + " " + summary;

  if (allText.includes("canyoneering") || allText.includes("rappel")) return 22; // Canyoneering
  if (allText.includes("horseback") || allText.includes("horse") || allText.includes("ride")) return 23; // Horseback Riding
  if (allText.includes("photo") || allText.includes("photography")) return 24; // Photography Tour
  if (allText.includes("gear") || allText.includes("rental") || allText.includes("outfitter")) return 21; // Gear Rental
  return 20; // Tour Operator (default)
}

function refineCategory(type, name, types, editorialSummary) {
  switch (type) {
    case "dining": return refineDiningCategory(name, types, editorialSummary);
    case "lodging": return refineLodgingCategory(name, types, editorialSummary);
    case "experiences": return refineExperienceCategory(name, types, editorialSummary);
    default: return null; // Use the default from the query
  }
}

// ─── Google Places Type Blocklist ────────────────────────────────────────────
// Skip results that are clearly not what we want

const BLOCKED_TYPES = new Set([
  "dentist", "doctor", "hospital", "pharmacy", "health",
  "lawyer", "accounting", "insurance_agency", "real_estate_agency",
  "bank", "atm", "post_office",
  "school", "university",
  "church", "place_of_worship",
  "local_government_office", "city_hall", "courthouse",
  "police", "fire_station",
  "hair_care", "beauty_salon", "spa",
  "gym", "laundry", "dry_cleaner",
  "car_repair", "car_wash", "gas_station",
  "hardware_store", "home_goods_store", "furniture_store",
  "electrician", "plumber", "roofing_contractor", "general_contractor",
  "veterinary_care", "pet_store",
  "cemetery", "funeral_home",
  "storage", "moving_company",
]);

const BLOCKED_NAME_PATTERNS = [
  /walmart/i, /target/i, /costco/i, /home depot/i, /lowe'?s/i,
  /mcdonald'?s/i, /burger king/i, /wendy'?s/i, /taco bell/i, /subway/i,
  /starbucks/i, /dunkin/i, /domino'?s/i, /papa john/i, /little caesars/i,
  /jack in the box/i, /carl'?s jr/i, /arby'?s/i, /kfc/i, /chick-fil-a/i,
  /denny'?s/i, /ihop/i, /applebee/i, /chili'?s/i, /olive garden/i,
  /panda express/i, /del taco/i, /sonic drive/i, /wingstop/i,
  /7-eleven/i, /circle k/i, /chevron/i, /shell/i, /maverick/i,
  /pizza hut/i, /papa murphy/i, /jimmy john/i, /firehouse subs/i,
  /five guys/i, /in-n-out/i, /dairy queen/i, /baskin.robbins/i,
  /costa vida/i, /cafe rio/i, /chipotle/i, /panera/i,
  /cracker barrel/i, /waffle house/i, /golden corral/i,
];

// Cities within our target area around Zion National Park
const ALLOWED_CITIES = new Set([
  "springdale", "virgin", "la verkin", "hurricane", "kanab",
  "orderville", "glendale", "mount carmel", "mt. carmel", "mt carmel",
  "st. george", "saint george", "ivins", "santa clara",
  "rockville", "grafton", "leeds", "toquerville",
  "fredonia", // AZ, but right across the border from Kanab
]);

function shouldSkip(result) {
  // Skip permanently/temporarily closed
  if (result.business_status && result.business_status !== "OPERATIONAL") return true;

  // Skip blocked types
  if (result.types && result.types.some((t) => BLOCKED_TYPES.has(t))) return true;

  // Skip chain restaurants and irrelevant businesses
  if (BLOCKED_NAME_PATTERNS.some((p) => p.test(result.name))) return true;

  return false;
}

// City-based geographic filter (applied after Place Details fetch)
function isCityAllowed(city) {
  if (!city) return false;
  return ALLOWED_CITIES.has(city.toLowerCase().trim());
}

// ─── Location Matching ───────────────────────────────────────────────────────

const LOCATION_MAP = {
  springdale: 1,
  virgin: 2,
  hurricane: 3,
  kanab: 4,
  "st. george": 5,
  "saint george": 5,
  orderville: 6,
  "zion national park": 7,
  "la verkin": null,   // Valid area but no location record yet
  "rockville": null,
  "ivins": null,
  "santa clara": null,
  "glendale": null,
  "mount carmel": null,
  "fredonia": null,
  "toquerville": null,
  "leeds": null,
};

function matchLocation(addressComponents) {
  if (!addressComponents) return { city: null, state: "UT", zip: null, locationId: null };

  let city = null;
  let state = "UT";
  let zip = null;

  for (const comp of addressComponents) {
    if (comp.types.includes("locality")) city = comp.long_name;
    if (comp.types.includes("administrative_area_level_1")) state = comp.short_name;
    if (comp.types.includes("postal_code")) zip = comp.long_name;
  }

  const locationId = city ? LOCATION_MAP[city.toLowerCase()] || null : null;

  return { city, state, zip, locationId };
}

// ─── Price Level Mapping ─────────────────────────────────────────────────────

function mapPriceLevel(level) {
  switch (level) {
    case 0: return "$";
    case 1: return "$";
    case 2: return "$$";
    case 3: return "$$$";
    case 4: return "$$$$";
    default: return null;
  }
}

// ─── Slug Generation ─────────────────────────────────────────────────────────

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Business Hours Parsing ──────────────────────────────────────────────────

const DAY_MAP = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

function parseBusinessHours(weekdayText) {
  if (!weekdayText) return [];

  return weekdayText.map((text) => {
    // "Monday: 8:00 AM – 8:00 PM" or "Monday: Closed"
    const [dayName, ...timeParts] = text.split(": ");
    const day = DAY_MAP[dayName];
    if (!day) return null;

    const timeStr = timeParts.join(": ");
    if (timeStr === "Closed") {
      return { day, open_time: null, close_time: null, is_closed: true };
    }

    // Handle "Open 24 hours"
    if (timeStr.includes("24 hours")) {
      return { day, open_time: "12:00 AM", close_time: "11:59 PM", is_closed: false };
    }

    // Parse "8:00 AM – 8:00 PM"
    const match = timeStr.match(/(.+?)\s*[–—-]\s*(.+)/);
    if (match) {
      return { day, open_time: match[1].trim(), close_time: match[2].trim(), is_closed: false };
    }

    return { day, open_time: null, close_time: null, is_closed: false };
  }).filter(Boolean);
}

// ─── Google API Helpers ──────────────────────────────────────────────────────

async function textSearch(query, apiKey, pageToken) {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  if (pageToken) {
    url = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${pageToken}&key=${apiKey}`;
  }

  const res = await fetch(url);
  return res.json();
}

async function getPlaceDetails(placeId, apiKey) {
  const fields = [
    "name", "place_id", "formatted_address", "address_components",
    "formatted_phone_number", "website", "opening_hours",
    "rating", "user_ratings_total", "types", "geometry",
    "price_level", "editorial_summary", "url", "business_status",
  ].join(",");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
  const res = await fetch(url);
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     ZION TRAVEL — Automated Listing Population Script      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  if (DRY_RUN) console.log("🏃 DRY RUN MODE — no database writes\n");

  // Get API key
  const [{ value: apiKey }] = await sql`SELECT value FROM settings WHERE key = 'google_places_api_key'`;
  if (!apiKey) {
    console.error("❌ No Google Places API key found in settings!");
    process.exit(1);
  }
  console.log("✅ API key loaded\n");

  // Get existing listings for deduplication
  const existingListings = await sql`SELECT name, city, google_place_id FROM listings`;
  const existingNames = new Set(existingListings.map((l) => `${l.name.toLowerCase().trim()}|${(l.city || "").toLowerCase().trim()}`));
  const existingPlaceIds = new Set(existingListings.filter((l) => l.google_place_id).map((l) => l.google_place_id));
  console.log(`📋 ${existingListings.length} existing listings loaded for dedup\n`);

  // Filter queries by type if specified
  const queries = typeFilter
    ? SEARCH_QUERIES.filter((q) => q.type === typeFilter)
    : SEARCH_QUERIES;

  console.log(`🔍 Running ${queries.length} search queries...\n`);

  // Collect all unique place IDs from search results
  const placeIdMap = new Map(); // placeId → { type, defaultCategoryId }

  for (const searchQuery of queries) {
    console.log(`\n🔎 "${searchQuery.query}" (${searchQuery.type})`);

    let pageToken = null;
    let page = 0;

    do {
      const data = await textSearch(searchQuery.query, apiKey, pageToken);

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.log(`   ⚠️  API status: ${data.status} — ${data.error_message || ""}`);
        break;
      }

      const results = data.results || [];
      let added = 0;

      for (const result of results) {
        // Skip if blocked
        if (shouldSkip(result)) continue;

        // Skip if we already have this place
        if (existingPlaceIds.has(result.place_id)) continue;

        // Skip if already collected
        if (placeIdMap.has(result.place_id)) continue;

        placeIdMap.set(result.place_id, {
          type: searchQuery.type,
          defaultCategoryId: searchQuery.defaultCategoryId,
        });
        added++;
      }

      console.log(`   Page ${page + 1}: ${results.length} results, ${added} new candidates`);
      page++;

      pageToken = data.next_page_token || null;
      if (pageToken) {
        // Google requires a short delay before using next_page_token
        await sleep(SEARCH_DELAY_MS);
      }
    } while (pageToken);

    await sleep(500); // Pause between queries
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`📊 Found ${placeIdMap.size} new unique businesses to process\n`);

  // Fetch details and create listings
  let created = 0;
  let skipped = 0;
  let errors = 0;
  let i = 0;

  for (const [placeId, meta] of placeIdMap) {
    i++;
    process.stdout.write(`  [${i}/${placeIdMap.size}] Fetching details...`);

    try {
      const detailData = await getPlaceDetails(placeId, apiKey);

      if (detailData.status !== "OK") {
        console.log(` ⚠️  ${detailData.status}`);
        errors++;
        continue;
      }

      const p = detailData.result;

      // Skip non-operational
      if (p.business_status && p.business_status !== "OPERATIONAL") {
        console.log(` ⏭️  ${p.name} — not operational`);
        skipped++;
        continue;
      }

      // Parse location
      const { city, state, zip, locationId } = matchLocation(p.address_components);

      // Geographic filter: skip businesses outside our target area
      if (!isCityAllowed(city)) {
        console.log(` ⏭️  ${p.name} — outside area (${city || "unknown city"})`);
        skipped++;
        continue;
      }

      // Skip generic/placeholder names
      if (!p.name || p.name.length < 3 || /^restaurant$/i.test(p.name.trim())) {
        console.log(` ⏭️  ${p.name || "(no name)"} — generic name`);
        skipped++;
        continue;
      }

      // Cross-type filter: skip lodging results in dining searches, etc.
      const pTypes = p.types || [];
      if (meta.type === "dining" && pTypes.includes("lodging") && !pTypes.includes("restaurant")) {
        console.log(` ⏭️  ${p.name} — lodging, not a restaurant`);
        skipped++;
        continue;
      }

      // Dedup by name + city
      const dedupKey = `${p.name.toLowerCase().trim()}|${(city || "").toLowerCase().trim()}`;
      if (existingNames.has(dedupKey)) {
        console.log(` ⏭️  ${p.name} — already exists`);
        skipped++;
        continue;
      }

      // Refine category
      const editorialText = p.editorial_summary?.overview || "";
      const refinedCategoryId = refineCategory(meta.type, p.name, p.types || [], editorialText);
      const categoryId = refinedCategoryId || meta.defaultCategoryId;

      // Build slug (ensure unique)
      let baseSlug = slugify(p.name);
      const slugCheck = await sql`SELECT id FROM listings WHERE slug = ${baseSlug} AND type = ${meta.type}`;
      if (slugCheck.length > 0) baseSlug = baseSlug + "-" + (city ? slugify(city) : "zion");

      // Map price level
      const priceRange = mapPriceLevel(p.price_level);

      // Parse hours
      const hours = parseBusinessHours(p.opening_hours?.weekday_text);

      // Build tagline from editorial summary
      const tagline = editorialText || null;

      const listing = {
        type: meta.type,
        name: p.name,
        slug: baseSlug,
        tagline: tagline,
        description: null, // User will fill in
        category_id: categoryId,
        location_id: locationId,
        address: p.formatted_address?.replace(/, United States$/, "") || null,
        city: city,
        state: state || "UT",
        zip: zip,
        lat: p.geometry?.location?.lat || null,
        lng: p.geometry?.location?.lng || null,
        phone: p.formatted_phone_number || null,
        email: null, // Not available from Google
        website: p.website || null,
        price_range: priceRange,
        google_place_id: placeId,
        avg_rating: p.rating || 0,
        review_count: p.user_ratings_total || 0,
        status: "draft",
        is_featured: false,
      };

      if (DRY_RUN) {
        console.log(` ✅ ${listing.name} (${listing.city}) — ${meta.type} [DRY RUN]`);
        created++;
        existingNames.add(dedupKey);
        continue;
      }

      // Insert listing
      const [inserted] = await sql`
        INSERT INTO listings (
          type, name, slug, tagline, description, category_id, location_id,
          address, city, state, zip, lat, lng, phone, email, website,
          price_range, google_place_id, avg_rating, review_count, status, is_featured
        ) VALUES (
          ${listing.type}, ${listing.name}, ${listing.slug}, ${listing.tagline}, ${listing.description},
          ${listing.category_id}, ${listing.location_id},
          ${listing.address}, ${listing.city}, ${listing.state}, ${listing.zip},
          ${listing.lat}, ${listing.lng}, ${listing.phone}, ${listing.email}, ${listing.website},
          ${listing.price_range}, ${listing.google_place_id},
          ${listing.avg_rating}, ${listing.review_count}, ${listing.status}, ${listing.is_featured}
        ) RETURNING id
      `;

      // Insert business hours
      if (hours.length > 0) {
        for (const h of hours) {
          await sql`
            INSERT INTO business_hours (listing_id, day, open_time, close_time, is_closed)
            VALUES (${inserted.id}, ${h.day}, ${h.open_time}, ${h.close_time}, ${h.is_closed})
          `;
        }
      }

      console.log(` ✅ ${listing.name} (${listing.city}) — ${meta.type}`);
      created++;
      existingNames.add(dedupKey);
      existingPlaceIds.add(placeId);

    } catch (err) {
      console.log(` ❌ Error: ${err.message}`);
      errors++;
    }

    await sleep(DETAIL_DELAY_MS);
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors:  ${errors}`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  if (!DRY_RUN && created > 0) {
    console.log(`🎉 ${created} new draft listings created!`);
    console.log(`   Go to zion.travel/admin/listings to review and publish them.\n`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  sql.end();
  process.exit(1);
});
