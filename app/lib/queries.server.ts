import sql from "./db.server";
import type {
  Listing,
  Category,
  Location,
  BusinessHours,
  HikingDetails,
  Amenity,
} from "./types";
import { getNewsArticlePath } from "./news-url";
import { siteConfig } from "./site-config";

// ============================================
// LISTINGS
// ============================================

export async function getListings(options: {
  type?: string;
  search?: string;
  category?: string | string[];
  location?: string;
  city?: string;
  popular?: string;
  priceRange?: string[];
  sort?: string;
  page?: number;
  perPage?: number;
  status?: string;
}) {
  const {
    type,
    search,
    category,
    location,
    city,
    popular,
    priceRange,
    sort = "default",
    page = 1,
    perPage = 12,
    status = "published",
  } = options;

  const conditions: string[] = [];
  const values: Array<string | string[]> = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`l.status = $${paramIndex++}`);
    values.push(status);
  }
  if (type) {
    conditions.push(`l.type = $${paramIndex++}`);
    values.push(type);
  }
  if (category) {
    if (Array.isArray(category) && category.length > 0) {
      conditions.push(`c.slug = ANY($${paramIndex++})`);
      values.push(category);
    } else if (typeof category === "string") {
      conditions.push(`c.slug = $${paramIndex++}`);
      values.push(category);
    }
  }
  if (location) {
    conditions.push(`loc.slug = $${paramIndex++}`);
    values.push(location);
  }
  if (city) {
    conditions.push(`l.city = $${paramIndex++}`);
    values.push(city);
  }
  if (popular === "popular") {
    conditions.push(`COALESCE(l.is_popular, false) = true`);
  } else if (popular === "not_popular") {
    conditions.push(`COALESCE(l.is_popular, false) = false`);
  }
  if (priceRange && priceRange.length > 0) {
    conditions.push(`l.price_range = ANY($${paramIndex++})`);
    values.push(priceRange);
  }
  if (search) {
    conditions.push(
      `(l.name ILIKE $${paramIndex} OR l.tagline ILIKE $${paramIndex} OR l.city ILIKE $${paramIndex})`
    );
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderClause: string;
  switch (sort) {
    case "rating":
    case "rating_desc":
      orderClause = "ORDER BY l.avg_rating DESC NULLS LAST, l.name ASC";
      break;
    case "rating_asc":
      orderClause = "ORDER BY l.avg_rating ASC NULLS LAST, l.name ASC";
      break;
    case "reviews":
      orderClause = "ORDER BY l.review_count DESC, l.name ASC";
      break;
    case "newest":
      orderClause = "ORDER BY l.created_at DESC";
      break;
    case "name":
    case "name_asc":
      orderClause = "ORDER BY l.name ASC";
      break;
    case "name_desc":
      orderClause = "ORDER BY l.name DESC";
      break;
    case "type_asc":
      orderClause = "ORDER BY l.type ASC, l.name ASC";
      break;
    case "type_desc":
      orderClause = "ORDER BY l.type DESC, l.name ASC";
      break;
    case "city_asc":
      orderClause = "ORDER BY l.city ASC NULLS LAST, l.name ASC";
      break;
    case "city_desc":
      orderClause = "ORDER BY l.city DESC NULLS LAST, l.name ASC";
      break;
    case "status_asc":
      orderClause = "ORDER BY l.status ASC, l.name ASC";
      break;
    case "status_desc":
      orderClause = "ORDER BY l.status DESC, l.name ASC";
      break;
    case "price_low":
      orderClause = "ORDER BY l.price_range ASC NULLS LAST, l.name ASC";
      break;
    case "price_high":
      orderClause = "ORDER BY l.price_range DESC NULLS LAST, l.name ASC";
      break;
    case "featured":
      orderClause = "ORDER BY l.is_featured DESC, l.avg_rating DESC NULLS LAST, l.name ASC";
      break;
    case "popular_desc":
      orderClause = "ORDER BY l.is_popular DESC, l.views_30d DESC, l.name ASC";
      break;
    case "popular_asc":
      orderClause = "ORDER BY l.is_popular ASC, l.views_30d ASC, l.name ASC";
      break;
    default:
      orderClause = "ORDER BY l.is_featured DESC, l.avg_rating DESC NULLS LAST, l.name ASC";
  }

  const offset = (page - 1) * perPage;

  // Count query
  const countResult = await sql.unsafe(
    `SELECT COUNT(*) as total FROM listings l
     LEFT JOIN categories c ON l.category_id = c.id
     LEFT JOIN locations loc ON l.location_id = loc.id
     ${whereClause}`,
    values
  );
  const totalCount = parseInt(countResult[0].total, 10);

  // Data query
  const listings = await sql.unsafe(
    `SELECT
       l.*,
       c.name as category_name,
       c.slug as category_slug,
       loc.name as location_name,
       loc.slug as location_slug
     FROM listings l
     LEFT JOIN categories c ON l.category_id = c.id
     LEFT JOIN locations loc ON l.location_id = loc.id
     ${whereClause}
     ${orderClause}
     LIMIT ${perPage} OFFSET ${offset}`,
    values
  );

  return {
    listings: listings as unknown as Listing[],
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
    currentPage: page,
  };
}

export async function getListingBySlug(type: string, slug: string) {
  const results = await sql`
    SELECT
      l.*,
      c.name as category_name,
      c.slug as category_slug,
      loc.name as location_name,
      loc.slug as location_slug
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE l.type = ${type} AND l.slug = ${slug}
    LIMIT 1
  `;

  if (results.length === 0) return null;

  const listing = results[0] as unknown as Listing;

  // Get amenities
  const amenities = await sql`
    SELECT a.* FROM amenities a
    JOIN listing_amenities la ON a.id = la.amenity_id
    WHERE la.listing_id = ${listing.id}
  `;
  listing.amenities = amenities as unknown as Amenity[];

  // Get business hours
  const hours = await sql`
    SELECT * FROM business_hours
    WHERE listing_id = ${listing.id}
    ORDER BY CASE day
      WHEN 'monday' THEN 1
      WHEN 'tuesday' THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday' THEN 4
      WHEN 'friday' THEN 5
      WHEN 'saturday' THEN 6
      WHEN 'sunday' THEN 7
    END
  `;
  listing.business_hours = hours as unknown as BusinessHours[];

  return listing;
}

export async function getHikingDetails(listingId: string) {
  const results = await sql`
    SELECT * FROM hiking_details WHERE listing_id = ${listingId}
  `;
  return results.length > 0 ? (results[0] as unknown as HikingDetails) : null;
}

export async function upsertHikingDetails(
  listingId: string,
  details: Omit<HikingDetails, "listing_id">
) {
  await sql`
    INSERT INTO hiking_details (
      listing_id, difficulty, trail_type, distance_miles, distance_miles_max,
      elevation_gain_ft, estimated_time, trailhead_lat, trailhead_lng,
      trailhead_address, entry_requirement, permit_info, dog_policy,
      season_start, season_end, water_available, shade_level, kid_friendly,
      surface_type, data_sources
    ) VALUES (
      ${listingId},
      ${details.difficulty || null},
      ${details.trail_type || null},
      ${details.distance_miles || null},
      ${details.distance_miles_max || null},
      ${details.elevation_gain_ft || null},
      ${details.estimated_time || null},
      ${details.trailhead_lat || null},
      ${details.trailhead_lng || null},
      ${details.trailhead_address || null},
      ${details.entry_requirement || "none"},
      ${details.permit_info || null},
      ${details.dog_policy || "not_allowed"},
      ${details.season_start || null},
      ${details.season_end || null},
      ${details.water_available ?? false},
      ${details.shade_level || null},
      ${details.kid_friendly ?? false},
      ${details.surface_type || null},
      ${details.data_sources || null}
    )
    ON CONFLICT (listing_id) DO UPDATE SET
      difficulty = EXCLUDED.difficulty,
      trail_type = EXCLUDED.trail_type,
      distance_miles = EXCLUDED.distance_miles,
      distance_miles_max = EXCLUDED.distance_miles_max,
      elevation_gain_ft = EXCLUDED.elevation_gain_ft,
      estimated_time = EXCLUDED.estimated_time,
      trailhead_lat = EXCLUDED.trailhead_lat,
      trailhead_lng = EXCLUDED.trailhead_lng,
      trailhead_address = EXCLUDED.trailhead_address,
      entry_requirement = EXCLUDED.entry_requirement,
      permit_info = EXCLUDED.permit_info,
      dog_policy = EXCLUDED.dog_policy,
      season_start = EXCLUDED.season_start,
      season_end = EXCLUDED.season_end,
      water_available = EXCLUDED.water_available,
      shade_level = EXCLUDED.shade_level,
      kid_friendly = EXCLUDED.kid_friendly,
      surface_type = EXCLUDED.surface_type,
      data_sources = EXCLUDED.data_sources
  `;
}

export async function getListingById(id: string) {
  const results = await sql`
    SELECT
      l.*,
      c.name as category_name,
      c.slug as category_slug,
      loc.name as location_name,
      loc.slug as location_slug
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE l.id = ${id}
    LIMIT 1
  `;
  return results.length > 0 ? (results[0] as unknown as Listing) : null;
}

// ── Submission token queries ──

export async function getListingBySubmissionToken(token: string) {
  const results = await sql`
    SELECT id, name, slug, type, status, submission_token, featured_image
    FROM listings
    WHERE submission_token = ${token}
    LIMIT 1
  `;
  return results.length > 0
    ? (results[0] as { id: string; name: string; slug: string; type: string; status: string; submission_token: string; featured_image: string | null })
    : null;
}

export async function setSubmissionToken(listingId: string, token: string) {
  const result = await sql`
    UPDATE listings
    SET submission_token = ${token}, updated_at = NOW()
    WHERE id = ${listingId}
    RETURNING submission_token
  `;
  return result[0]?.submission_token ?? null;
}

export async function getPublishedListingsForPopularity() {
  const results = await sql`
    SELECT id, type, slug
    FROM listings
    WHERE status = 'published'
  `;
  return results as unknown as { id: string; type: string; slug: string }[];
}

export async function updateListingPopularityMetrics(
  updates: { id: string; views30d: number; isPopular: boolean }[]
) {
  const refreshedAt = new Date().toISOString();
  await sql`
    UPDATE listings
    SET
      views_30d = 0,
      is_popular = false,
      popularity_refreshed_at = ${refreshedAt}
    WHERE status = 'published'
  `;

  for (const update of updates) {
    await sql`
      UPDATE listings
      SET
        views_30d = ${update.views30d},
        is_popular = ${update.isPopular},
        popularity_refreshed_at = ${refreshedAt}
      WHERE id = ${update.id}
    `;
  }
}

function isMissingHasNoPhoneColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? (error as { message?: string }).message : undefined;
  return code === "42703" && typeof message === "string" && message.includes("has_no_phone");
}

export async function createListing(data: Partial<Listing>) {
  try {
    const result = await sql`
      INSERT INTO listings (type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, phone, has_no_phone, email, website, price_range, status, is_featured, google_place_id, featured_image, gallery, meta_title, meta_description, focus_keyphrase, google_maps_uri, google_primary_type, google_types, lat, lng)
      VALUES (${data.type!}, ${data.name!}, ${data.slug!}, ${data.tagline || null}, ${data.description || null}, ${data.category_id || null}, ${data.location_id || null}, ${data.address || null}, ${data.city || null}, ${data.state || "UT"}, ${data.zip || null}, ${data.phone || null}, ${data.has_no_phone ?? false}, ${data.email || null}, ${data.website || null}, ${data.price_range || null}, ${data.status || "draft"}, ${data.is_featured || false}, ${data.google_place_id || null}, ${data.featured_image || null}, ${data.gallery || []}, ${data.meta_title ?? null}, ${data.meta_description ?? null}, ${data.focus_keyphrase ?? null}, ${data.google_maps_uri ?? null}, ${data.google_primary_type ?? null}, ${data.google_types ?? null}, ${data.lat ?? null}, ${data.lng ?? null})
      RETURNING *
    `;
    return result[0] as unknown as Listing;
  } catch (error) {
    if (!isMissingHasNoPhoneColumnError(error)) {
      throw error;
    }
    const legacyResult = await sql`
      INSERT INTO listings (type, name, slug, tagline, description, category_id, location_id, address, city, state, zip, phone, email, website, price_range, status, is_featured, google_place_id, featured_image, gallery, meta_title, meta_description, focus_keyphrase, google_maps_uri, google_primary_type, google_types, lat, lng)
      VALUES (${data.type!}, ${data.name!}, ${data.slug!}, ${data.tagline || null}, ${data.description || null}, ${data.category_id || null}, ${data.location_id || null}, ${data.address || null}, ${data.city || null}, ${data.state || "UT"}, ${data.zip || null}, ${data.phone || null}, ${data.email || null}, ${data.website || null}, ${data.price_range || null}, ${data.status || "draft"}, ${data.is_featured || false}, ${data.google_place_id || null}, ${data.featured_image || null}, ${data.gallery || []}, ${data.meta_title ?? null}, ${data.meta_description ?? null}, ${data.focus_keyphrase ?? null}, ${data.google_maps_uri ?? null}, ${data.google_primary_type ?? null}, ${data.google_types ?? null}, ${data.lat ?? null}, ${data.lng ?? null})
      RETURNING *
    `;
    return legacyResult[0] as unknown as Listing;
  }
}

export async function updateListing(id: string, data: Partial<Listing>) {
  try {
    const result = await sql`
      UPDATE listings SET
        name = COALESCE(${data.name || null}, name),
        slug = COALESCE(${data.slug || null}, slug),
        type = COALESCE(${data.type || null}, type),
        tagline = ${"tagline" in data ? (data.tagline ?? null) : sql`tagline`},
        description = ${"description" in data ? (data.description ?? null) : sql`description`},
        category_id = ${"category_id" in data ? (data.category_id ?? null) : sql`category_id`},
        location_id = ${"location_id" in data ? (data.location_id ?? null) : sql`location_id`},
        address = ${"address" in data ? (data.address ?? null) : sql`address`},
        city = ${"city" in data ? (data.city ?? null) : sql`city`},
        state = ${"state" in data ? (data.state ?? null) : sql`state`},
        zip = ${"zip" in data ? (data.zip ?? null) : sql`zip`},
        phone = ${"phone" in data ? (data.phone ?? null) : sql`phone`},
        has_no_phone = COALESCE(${data.has_no_phone ?? null}, has_no_phone),
        email = ${"email" in data ? (data.email ?? null) : sql`email`},
        website = ${"website" in data ? (data.website ?? null) : sql`website`},
        price_range = ${"price_range" in data ? (data.price_range ?? null) : sql`price_range`},
        status = COALESCE(${data.status || null}, status),
        is_featured = COALESCE(${data.is_featured ?? null}, is_featured),
        google_place_id = ${"google_place_id" in data ? (data.google_place_id ?? null) : sql`google_place_id`},
        featured_image = ${"featured_image" in data ? (data.featured_image ?? null) : sql`featured_image`},
        gallery = ${"gallery" in data ? (data.gallery || []) : sql`gallery`},
        meta_title = ${"meta_title" in data ? (data.meta_title ?? null) : sql`meta_title`},
        meta_description = ${"meta_description" in data ? (data.meta_description ?? null) : sql`meta_description`},
        focus_keyphrase = ${"focus_keyphrase" in data ? (data.focus_keyphrase ?? null) : sql`focus_keyphrase`},
        submission_token = ${"submission_token" in data ? (data.submission_token ?? null) : sql`submission_token`},
        google_maps_uri = COALESCE(${data.google_maps_uri ?? null}, google_maps_uri),
        google_primary_type = COALESCE(${data.google_primary_type ?? null}, google_primary_type),
        google_types = COALESCE(${data.google_types ?? null}, google_types),
        lat = ${"lat" in data ? (data.lat ?? null) : sql`lat`},
        lng = ${"lng" in data ? (data.lng ?? null) : sql`lng`},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] as unknown as Listing;
  } catch (error) {
    if (!isMissingHasNoPhoneColumnError(error)) {
      throw error;
    }
    const legacyResult = await sql`
      UPDATE listings SET
        name = COALESCE(${data.name || null}, name),
        slug = COALESCE(${data.slug || null}, slug),
        type = COALESCE(${data.type || null}, type),
        tagline = ${"tagline" in data ? (data.tagline ?? null) : sql`tagline`},
        description = ${"description" in data ? (data.description ?? null) : sql`description`},
        category_id = ${"category_id" in data ? (data.category_id ?? null) : sql`category_id`},
        location_id = ${"location_id" in data ? (data.location_id ?? null) : sql`location_id`},
        address = ${"address" in data ? (data.address ?? null) : sql`address`},
        city = ${"city" in data ? (data.city ?? null) : sql`city`},
        state = ${"state" in data ? (data.state ?? null) : sql`state`},
        zip = ${"zip" in data ? (data.zip ?? null) : sql`zip`},
        phone = ${"phone" in data ? (data.phone ?? null) : sql`phone`},
        email = ${"email" in data ? (data.email ?? null) : sql`email`},
        website = ${"website" in data ? (data.website ?? null) : sql`website`},
        price_range = ${"price_range" in data ? (data.price_range ?? null) : sql`price_range`},
        status = COALESCE(${data.status || null}, status),
        is_featured = COALESCE(${data.is_featured ?? null}, is_featured),
        google_place_id = ${"google_place_id" in data ? (data.google_place_id ?? null) : sql`google_place_id`},
        featured_image = ${"featured_image" in data ? (data.featured_image ?? null) : sql`featured_image`},
        gallery = ${"gallery" in data ? (data.gallery || []) : sql`gallery`},
        meta_title = ${"meta_title" in data ? (data.meta_title ?? null) : sql`meta_title`},
        meta_description = ${"meta_description" in data ? (data.meta_description ?? null) : sql`meta_description`},
        focus_keyphrase = ${"focus_keyphrase" in data ? (data.focus_keyphrase ?? null) : sql`focus_keyphrase`},
        submission_token = ${"submission_token" in data ? (data.submission_token ?? null) : sql`submission_token`},
        google_maps_uri = COALESCE(${data.google_maps_uri ?? null}, google_maps_uri),
        google_primary_type = COALESCE(${data.google_primary_type ?? null}, google_primary_type),
        google_types = COALESCE(${data.google_types ?? null}, google_types),
        lat = ${"lat" in data ? (data.lat ?? null) : sql`lat`},
        lng = ${"lng" in data ? (data.lng ?? null) : sql`lng`},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return legacyResult[0] as unknown as Listing;
  }
}

export async function updateListingStatus(id: string, status: string) {
  const result = await sql`
    UPDATE listings SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0] as unknown as Listing;
}

export async function deleteListing(id: string) {
  await sql`DELETE FROM media_usage WHERE entity_type = 'listing' AND entity_id = ${id}`;
  await sql`DELETE FROM listings WHERE id = ${id}`;
}

// ============================================
// BUSINESS HOURS
// ============================================

/**
 * Upsert business hours for a listing.
 * Deletes existing hours and inserts fresh data from Google Places.
 */
export async function upsertBusinessHours(
  listingId: string,
  hours: { day: string; open_time: string | null; close_time: string | null; is_closed: boolean }[]
) {
  if (!hours || hours.length === 0) return;

  // Delete existing hours for this listing
  await sql`DELETE FROM business_hours WHERE listing_id = ${listingId}`;

  // Insert new hours
  for (const h of hours) {
    await sql`
      INSERT INTO business_hours (listing_id, day, open_time, close_time, is_closed)
      VALUES (${listingId}, ${h.day}, ${h.open_time}, ${h.close_time}, ${h.is_closed})
    `;
  }
}

/**
 * Auto-link amenities to a listing by slug.
 * Looks up amenity IDs and inserts into listing_amenities, skipping duplicates.
 * Returns the number of amenities newly linked.
 */
export async function autoLinkAmenities(listingId: string, amenitySlugs: string[]): Promise<number> {
  if (!amenitySlugs || amenitySlugs.length === 0) return 0;

  const amenities = await sql`
    SELECT id, slug FROM amenities WHERE slug = ANY(${amenitySlugs})
  `;

  let linked = 0;
  for (const a of amenities as any[]) {
    try {
      await sql`
        INSERT INTO listing_amenities (listing_id, amenity_id)
        VALUES (${listingId}, ${a.id})
        ON CONFLICT DO NOTHING
      `;
      linked++;
    } catch {
      // Skip on any error (e.g. FK violation)
    }
  }
  return linked;
}

/**
 * Get all listings that have a Google Place ID (for batch hours refresh).
 */
export async function getDistinctCities() {
  const results = await sql`
    SELECT DISTINCT city FROM listings
    WHERE city IS NOT NULL AND city != ''
    ORDER BY city ASC
  `;
  return results.map((r: any) => r.city as string);
}

export async function getListingsWithGooglePlaceId() {
  const results = await sql`
    SELECT l.id, l.name, l.google_place_id, l.type, c.name as category_name
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.google_place_id IS NOT NULL AND l.google_place_id != ''
    ORDER BY l.name
  `;
  return results as unknown as { id: string; name: string; google_place_id: string; type: string; category_name: string | null }[];
}

export async function getExistingGooglePlaceIds(): Promise<Set<string>> {
  const results = await sql`
    SELECT google_place_id FROM listings
    WHERE google_place_id IS NOT NULL AND google_place_id != ''
  `;
  return new Set((results as any[]).map((r) => r.google_place_id));
}

/**
 * Batch-enrich a listing from Google data.
 * Uses COALESCE(existing, new) for contact/price fields (preserve existing),
 * and COALESCE(new, existing) for Google metadata fields (prefer fresh data).
 */
export async function batchEnrichListing(id: string, data: Partial<Listing>) {
  const result = await sql`
    UPDATE listings SET
      phone = COALESCE(phone, ${data.phone ?? null}),
      website = COALESCE(website, ${data.website ?? null}),
      address = COALESCE(address, ${data.address ?? null}),
      city = COALESCE(city, ${data.city ?? null}),
      state = COALESCE(state, ${data.state ?? null}),
      zip = COALESCE(zip, ${data.zip ?? null}),
      lat = COALESCE(lat, ${(data as any).lat ?? null}),
      lng = COALESCE(lng, ${(data as any).lng ?? null}),
      price_range = COALESCE(price_range, ${data.price_range ?? null}),
      avg_rating = COALESCE(${data.avg_rating ?? null}, avg_rating),
      review_count = COALESCE(${data.review_count ?? null}, review_count),
      google_maps_uri = COALESCE(${data.google_maps_uri ?? null}, google_maps_uri),
      google_primary_type = COALESCE(${data.google_primary_type ?? null}, google_primary_type),
      google_types = COALESCE(${data.google_types ?? null}, google_types),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name
  `;
  return result[0];
}

// ============================================
// CATEGORIES
// ============================================

export async function getCategories(type?: string) {
  if (type) {
    return sql`SELECT * FROM categories WHERE listing_type = ${type} ORDER BY name` as unknown as Category[];
  }
  return sql`SELECT * FROM categories ORDER BY listing_type, name` as unknown as Category[];
}

export async function getCategoriesWithCounts() {
  return sql`
    SELECT c.*, COUNT(l.id)::int as listing_count
    FROM categories c
    LEFT JOIN listings l ON l.category_id = c.id AND l.status = 'published'
    GROUP BY c.id
    ORDER BY c.listing_type, c.name
  `;
}

export async function createCategory(data: { name: string; slug: string; listing_type: string; parent_id?: number; description?: string }) {
  const result = await sql`
    INSERT INTO categories (name, slug, listing_type, parent_id, description)
    VALUES (${data.name}, ${data.slug}, ${data.listing_type}, ${data.parent_id || null}, ${data.description || null})
    RETURNING *
  `;
  return result[0];
}

export async function deleteCategory(id: number) {
  await sql`DELETE FROM categories WHERE id = ${id}`;
}

// ============================================
// LOCATIONS
// ============================================

export async function getLocations() {
  return sql`SELECT * FROM locations ORDER BY name` as unknown as Location[];
}

// ============================================
// GOOGLE REVIEWS CACHE
// ============================================

export async function getGoogleReviewsCache(listingId: string) {
  const results = await sql`
    SELECT * FROM google_reviews_cache
    WHERE listing_id = ${listingId}
    LIMIT 1
  `;
  return results.length > 0 ? results[0] : null;
}

// ============================================
// BLOG POSTS
// ============================================

type BlogPostJoinedRow = {
  [key: string]: any;
  category_name_join?: string | null;
  category_slug_join?: string | null;
  category_description_join?: string | null;
  category_meta_title_join?: string | null;
  category_meta_description_join?: string | null;
};

function normalizeBlogPostRow(row: BlogPostJoinedRow) {
  const {
    category_name_join,
    category_slug_join,
    category_description_join,
    category_meta_title_join,
    category_meta_description_join,
    ...rest
  } = row;
  return {
    ...rest,
    category: category_name_join || rest.category || null,
    category_slug: category_slug_join || rest.category_slug || null,
    category_description: category_description_join || null,
    category_meta_title: category_meta_title_join || null,
    category_meta_description: category_meta_description_join || null,
  };
}

function slugifyBlogCategory(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCaseFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isMissingBlogCategorySchemaError(error: unknown) {
  const message = String((error as any)?.message || "").toLowerCase();
  return message.includes("blog_categories")
    || message.includes("category_id")
    || message.includes("column \"meta_title\"")
    || message.includes("column \"meta_description\"")
    || message.includes("column \"is_popular\"")
    || message.includes("column \"views_30d\"");
}

let blogCategorySchemaReady = false;
let blogCategorySchemaPromise: Promise<void> | null = null;

async function ensureBlogCategorySchema() {
  if (blogCategorySchemaReady) return;
  if (blogCategorySchemaPromise) return blogCategorySchemaPromise;

  blogCategorySchemaPromise = (async () => {
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
    await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_id INTEGER`;
    await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS focus_keyphrase TEXT`;
    await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS views_30d INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS popularity_refreshed_at TIMESTAMPTZ`;
    await sql`ALTER TABLE blog_posts DROP COLUMN IF EXISTS meta_keywords`;
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'blog_posts'
            AND column_name = 'status'
            AND data_type <> 'text'
        ) THEN
          ALTER TABLE blog_posts ALTER COLUMN status DROP DEFAULT;
          ALTER TABLE blog_posts ALTER COLUMN status TYPE TEXT USING status::text;
          ALTER TABLE blog_posts ALTER COLUMN status SET DEFAULT 'draft';
        END IF;
      END $$;
    `;
    await sql`
      DO $$
      DECLARE current_status_constraint TEXT;
      BEGIN
        SELECT pg_get_constraintdef(oid)
        INTO current_status_constraint
        FROM pg_constraint
        WHERE conname = 'blog_posts_status_check'
          AND conrelid = 'blog_posts'::regclass;

        IF current_status_constraint IS NULL THEN
          ALTER TABLE blog_posts
            ADD CONSTRAINT blog_posts_status_check
            CHECK (status = ANY (ARRAY['draft', 'pending', 'published', 'scheduled', 'archived']));
        ELSIF position('scheduled' in current_status_constraint) = 0 THEN
          ALTER TABLE blog_posts DROP CONSTRAINT blog_posts_status_check;
          ALTER TABLE blog_posts
            ADD CONSTRAINT blog_posts_status_check
            CHECK (status = ANY (ARRAY['draft', 'pending', 'published', 'scheduled', 'archived']));
        END IF;
      END $$;
    `;
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
    await sql`
      CREATE INDEX IF NOT EXISTS idx_blog_posts_is_popular_true
      ON blog_posts (is_popular)
      WHERE is_popular = TRUE
    `;

    // Backfill categories from legacy denormalized blog_post fields.
    const distinctRows = await sql`
      SELECT DISTINCT
        NULLIF(TRIM(category), '') AS category,
        NULLIF(TRIM(category_slug), '') AS category_slug
      FROM blog_posts
      WHERE (category IS NOT NULL AND TRIM(category) <> '')
         OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
    `;

    for (const row of distinctRows as any[]) {
      const slug = slugifyBlogCategory(row.category_slug || row.category || "");
      if (!slug) continue;
      const name = row.category || titleCaseFromSlug(slug);
      await sql`
        INSERT INTO blog_categories (name, slug, updated_at)
        VALUES (${name}, ${slug}, NOW())
        ON CONFLICT (slug)
        DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      `;
    }

    const categories = await sql`SELECT id, name, slug FROM blog_categories`;
    const categoryBySlug = new Map<string, { id: number; name: string; slug: string }>();
    for (const category of categories as any[]) {
      categoryBySlug.set(category.slug, category);
    }

    const posts = await sql`
      SELECT id, category_id, category, category_slug
      FROM blog_posts
      WHERE (category IS NOT NULL AND TRIM(category) <> '')
         OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
         OR category_id IS NOT NULL
    `;
    for (const post of posts as any[]) {
      const slug = slugifyBlogCategory(post.category_slug || post.category || "");
      if (!slug) continue;
      const category = categoryBySlug.get(slug);
      if (!category) continue;
      if (
        Number(post.category_id) === Number(category.id)
        && post.category === category.name
        && post.category_slug === category.slug
      ) {
        continue;
      }
      await sql`
        UPDATE blog_posts
        SET
          category_id = ${category.id},
          category = ${category.name},
          category_slug = ${category.slug},
          updated_at = NOW()
        WHERE id = ${post.id}
      `;
    }

    blogCategorySchemaReady = true;
  })().finally(() => {
    blogCategorySchemaPromise = null;
  });

  return blogCategorySchemaPromise;
}

export async function getBlogCategories() {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    return await sql`
      SELECT *
      FROM blog_categories
      ORDER BY name
    `;
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const rows = await sql`
      SELECT DISTINCT
        NULLIF(TRIM(category), '') AS name,
        NULLIF(TRIM(category_slug), '') AS slug
      FROM blog_posts
      WHERE (category IS NOT NULL AND TRIM(category) <> '')
         OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
      ORDER BY name
    `;
    return (rows as any[])
      .map((row, index) => {
        const slug = slugifyBlogCategory(row.slug || row.name || "");
        if (!slug) return null;
        return {
          id: index + 1,
          name: row.name || titleCaseFromSlug(slug),
          slug,
          description: null,
          meta_title: null,
          meta_description: null,
          created_at: null,
          updated_at: null,
        };
      })
      .filter(Boolean);
  }
}

export async function getBlogCategoriesWithPostCounts(options?: {
  includeEmpty?: boolean;
  status?: string;
}) {
  const { includeEmpty = true, status = "published" } = options || {};
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    const rows = await sql`
      SELECT bc.*, COUNT(bp.id)::int AS post_count
      FROM blog_categories bc
      LEFT JOIN blog_posts bp
        ON bp.category_id = bc.id
       AND bp.status = ${status}
      GROUP BY bc.id
      ORDER BY bc.name
    `;
    return includeEmpty ? rows : (rows as any[]).filter((row) => row.post_count > 0);
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;

    const rows = await sql`
      SELECT
        COALESCE(NULLIF(TRIM(category_slug), ''), NULLIF(TRIM(category), '')) AS key_slug,
        MAX(NULLIF(TRIM(category), '')) AS name,
        COUNT(*)::int AS post_count
      FROM blog_posts
      WHERE status = ${status}
        AND (
          (category IS NOT NULL AND TRIM(category) <> '')
          OR (category_slug IS NOT NULL AND TRIM(category_slug) <> '')
        )
      GROUP BY COALESCE(NULLIF(TRIM(category_slug), ''), NULLIF(TRIM(category), ''))
      ORDER BY name
    `;

    const mapped = (rows as any[])
      .map((row, index) => {
        const slug = slugifyBlogCategory(row.key_slug || "");
        if (!slug) return null;
        return {
          id: index + 1,
          name: row.name || titleCaseFromSlug(slug),
          slug,
          description: null,
          meta_title: null,
          meta_description: null,
          post_count: row.post_count || 0,
        };
      })
      .filter(Boolean);

    return includeEmpty ? mapped : mapped.filter((row: any) => row.post_count > 0);
  }
}

export async function getBlogCategoryBySlug(slug: string) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    const results = await sql`
      SELECT bc.*, COUNT(bp.id)::int AS post_count
      FROM blog_categories bc
      LEFT JOIN blog_posts bp
        ON bp.category_id = bc.id
       AND bp.status = 'published'
      WHERE bc.slug = ${slug}
      GROUP BY bc.id
      LIMIT 1
    `;
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const categories = await getBlogCategoriesWithPostCounts({
      includeEmpty: true,
      status: "published",
    });
    return (categories as any[]).find((category) => category.slug === slug) || null;
  }
}

export async function getBlogCategoryById(id: number | string) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    const results = await sql`
      SELECT *
      FROM blog_categories
      WHERE id = ${numericId}
      LIMIT 1
    `;
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    return null;
  }
}

export async function createBlogCategory(data: {
  name: string;
  slug: string;
  description?: string;
  meta_title?: string;
  meta_description?: string;
}) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Continue and let insert query below surface any real schema issue.
  }
  const results = await sql`
    INSERT INTO blog_categories (
      name,
      slug,
      description,
      meta_title,
      meta_description,
      updated_at
    )
    VALUES (
      ${data.name},
      ${data.slug},
      ${data.description || null},
      ${data.meta_title || null},
      ${data.meta_description || null},
      NOW()
    )
    RETURNING *
  `;
  return results[0];
}

export async function updateBlogCategory(id: number, data: Partial<{
  name: string;
  slug: string;
  description: string;
  meta_title: string;
  meta_description: string;
}>) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Continue and let update query below surface any real schema issue.
  }
  const results = await sql`
    UPDATE blog_categories
    SET
      name = COALESCE(${data.name || null}, name),
      slug = COALESCE(${data.slug || null}, slug),
      description = ${data.description || null},
      meta_title = ${data.meta_title || null},
      meta_description = ${data.meta_description || null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  const updated = results[0];
  if (!updated) return null;

  // Keep denormalized category fields on blog_posts in sync.
  await sql`
    UPDATE blog_posts
    SET
      category = ${updated.name},
      category_slug = ${updated.slug},
      updated_at = NOW()
    WHERE category_id = ${id}
  `;
  return updated;
}

export async function deleteBlogCategory(id: number) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Continue and let delete query below surface any real schema issue.
  }
  await sql`
    UPDATE blog_posts
    SET
      category_id = NULL,
      category = NULL,
      category_slug = NULL,
      updated_at = NOW()
    WHERE category_id = ${id}
  `;
  await sql`DELETE FROM blog_categories WHERE id = ${id}`;
}

export async function getPublishedBlogPostsForPopularity() {
  await ensureBlogCategorySchema();
  const results = await sql`
    SELECT id, slug
    FROM blog_posts
    WHERE status = 'published'
      AND slug IS NOT NULL
      AND TRIM(slug) <> ''
  `;
  return results as unknown as { id: string; slug: string }[];
}

export async function updateBlogPostPopularityMetrics(
  updates: { id: string; views30d: number; isPopular: boolean }[]
) {
  await ensureBlogCategorySchema();
  const refreshedAt = new Date().toISOString();
  await sql`
    UPDATE blog_posts
    SET
      views_30d = 0,
      is_popular = false,
      popularity_refreshed_at = ${refreshedAt}
    WHERE status = 'published'
  `;

  for (const update of updates) {
    await sql`
      UPDATE blog_posts
      SET
        views_30d = ${update.views30d},
        is_popular = ${update.isPopular},
        popularity_refreshed_at = ${refreshedAt}
      WHERE id = ${update.id}
    `;
  }
}

export async function getBlogPosts(options?: {
  status?: string;
  category?: string;
  popular?: string;
  sort?: string;
  limit?: number;
}) {
  const { status = "published", category, popular, sort = "newest", limit = 50 } = options || {};
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }

  try {
    const conditions: string[] = ["bp.status = $1"];
    const values: string[] = [status];
    let paramIndex = 2;

    if (category) {
      conditions.push(`COALESCE(bc.slug, bp.category_slug) = $${paramIndex++}`);
      values.push(category);
    }
    if (popular === "popular") {
      conditions.push(`COALESCE(bp.is_popular, false) = true`);
    } else if (popular === "not_popular") {
      conditions.push(`COALESCE(bp.is_popular, false) = false`);
    }

    let orderClause = "ORDER BY COALESCE(bp.published_at, bp.created_at) DESC";
    if (sort === "oldest") {
      orderClause = "ORDER BY COALESCE(bp.published_at, bp.created_at) ASC";
    } else if (sort === "popular_desc") {
      orderClause = "ORDER BY bp.is_popular DESC, bp.views_30d DESC, COALESCE(bp.published_at, bp.created_at) DESC";
    } else if (sort === "popular_asc") {
      orderClause = "ORDER BY bp.is_popular ASC, bp.views_30d ASC, COALESCE(bp.published_at, bp.created_at) DESC";
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const rows = await sql.unsafe(
      `
        SELECT
          bp.*,
          bc.name AS category_name_join,
          bc.slug AS category_slug_join,
          bc.description AS category_description_join,
          bc.meta_title AS category_meta_title_join,
          bc.meta_description AS category_meta_description_join
        FROM blog_posts bp
        LEFT JOIN blog_categories bc ON bp.category_id = bc.id
        ${whereClause}
        ${orderClause}
        LIMIT ${Math.max(limit, 1)}
      `,
      values
    );

    return (rows as BlogPostJoinedRow[]).map(normalizeBlogPostRow);
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const conditions: string[] = ["status = $1"];
    const values: string[] = [status];
    let paramIndex = 2;

    if (category) {
      conditions.push(`category_slug = $${paramIndex++}`);
      values.push(category);
    }
    if (popular === "popular") {
      conditions.push(`COALESCE(is_popular, false) = true`);
    } else if (popular === "not_popular") {
      conditions.push(`COALESCE(is_popular, false) = false`);
    }

    let orderClause = "ORDER BY COALESCE(published_at, created_at) DESC";
    if (sort === "oldest") {
      orderClause = "ORDER BY COALESCE(published_at, created_at) ASC";
    } else if (sort === "popular_desc") {
      orderClause = "ORDER BY is_popular DESC, views_30d DESC, COALESCE(published_at, created_at) DESC";
    } else if (sort === "popular_asc") {
      orderClause = "ORDER BY is_popular ASC, views_30d ASC, COALESCE(published_at, created_at) DESC";
    }

    const legacyRows = await sql.unsafe(
      `
        SELECT *
        FROM blog_posts
        WHERE ${conditions.join(" AND ")}
        ${orderClause}
        LIMIT ${Math.max(limit, 1)}
      `,
      values
    );
    return legacyRows;
  }
}

export async function getBlogPostBySlug(slug: string) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    const results = await sql`
      SELECT
        bp.*,
        bc.name AS category_name_join,
        bc.slug AS category_slug_join,
        bc.description AS category_description_join,
        bc.meta_title AS category_meta_title_join,
        bc.meta_description AS category_meta_description_join
      FROM blog_posts bp
      LEFT JOIN blog_categories bc ON bp.category_id = bc.id
      WHERE bp.slug = ${slug}
      LIMIT 1
    `;
    return results.length > 0 ? normalizeBlogPostRow(results[0] as BlogPostJoinedRow) : null;
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const results = await sql`
      SELECT *
      FROM blog_posts
      WHERE slug = ${slug}
      LIMIT 1
    `;
    return results.length > 0 ? results[0] : null;
  }
}

export async function getBlogPostById(id: string) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Fallback query below will handle legacy schema.
  }
  try {
    const results = await sql`
      SELECT
        bp.*,
        bc.name AS category_name_join,
        bc.slug AS category_slug_join,
        bc.description AS category_description_join,
        bc.meta_title AS category_meta_title_join,
        bc.meta_description AS category_meta_description_join
      FROM blog_posts bp
      LEFT JOIN blog_categories bc ON bp.category_id = bc.id
      WHERE bp.id = ${id}
      LIMIT 1
    `;
    return results.length > 0 ? normalizeBlogPostRow(results[0] as BlogPostJoinedRow) : null;
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const results = await sql`
      SELECT *
      FROM blog_posts
      WHERE id = ${id}
      LIMIT 1
    `;
    return results.length > 0 ? results[0] : null;
  }
}

export async function createBlogPost(data: { title: string; slug: string; excerpt?: string; content?: string; author?: string; category_id?: number | null; category?: string; category_slug?: string; read_time?: string; featured_image?: string; meta_title?: string; meta_description?: string; focus_keyphrase?: string; status?: string; published_at?: string }) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Ignore schema bootstrap failures and continue with legacy fallback.
  }

  const pubAt = data.published_at
    ? sql`${data.published_at}::timestamptz`
    : data.status === "published"
      ? sql`NOW()`
      : sql`NULL`;
  try {
    const result = await sql`
      INSERT INTO blog_posts (
        title,
        slug,
        excerpt,
        content,
        author,
        category_id,
        category,
        category_slug,
        read_time,
        featured_image,
        meta_title,
        meta_description,
        focus_keyphrase,
        status,
        published_at
      )
      VALUES (
        ${data.title},
        ${data.slug},
        ${data.excerpt || null},
        ${data.content || null},
        ${data.author || siteConfig.defaults.defaultAuthor},
        ${data.category_id || null},
        ${data.category || null},
        ${data.category_slug || null},
        ${data.read_time || null},
        ${data.featured_image || null},
        ${data.meta_title || null},
        ${data.meta_description || null},
        ${data.focus_keyphrase ?? null},
        ${data.status || "draft"},
        ${pubAt}
      )
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const result = await sql`
      INSERT INTO blog_posts (
        title,
        slug,
        excerpt,
        content,
        author,
        category,
        category_slug,
        read_time,
        featured_image,
        meta_title,
        meta_description,
        focus_keyphrase,
        status,
        published_at
      )
      VALUES (
        ${data.title},
        ${data.slug},
        ${data.excerpt || null},
        ${data.content || null},
        ${data.author || siteConfig.defaults.defaultAuthor},
        ${data.category || null},
        ${data.category_slug || null},
        ${data.read_time || null},
        ${data.featured_image || null},
        ${data.meta_title || null},
        ${data.meta_description || null},
        ${data.focus_keyphrase ?? null},
        ${data.status || "draft"},
        ${pubAt}
      )
      RETURNING *
    `;
    return result[0];
  }
}

export async function updateBlogPost(id: string, data: Partial<{ title: string; slug: string; excerpt: string; content: string; author: string; category_id: number | null; category: string; category_slug: string; read_time: string; featured_image: string; meta_title: string; meta_description: string; focus_keyphrase: string; status: string; published_at: string }>) {
  try {
    await ensureBlogCategorySchema();
  } catch {
    // Ignore schema bootstrap failures and continue with legacy fallback.
  }

  const pubAt = data.published_at
    ? sql`${data.published_at}::timestamptz`
    : data.status === "published"
      ? sql`CASE WHEN published_at IS NULL THEN NOW() ELSE published_at END`
      : sql`published_at`;
  try {
    const result = await sql`
      UPDATE blog_posts SET
        title = COALESCE(${data.title || null}, title),
        slug = COALESCE(${data.slug || null}, slug),
        excerpt = ${data.excerpt ?? null},
        content = ${data.content ?? null},
        category_id = ${"category_id" in data ? (data.category_id ?? null) : sql`category_id`},
        category = ${data.category ?? null},
        category_slug = ${data.category_slug ?? null},
        read_time = ${data.read_time ?? null},
        featured_image = ${data.featured_image ?? null},
        meta_title = ${data.meta_title ?? null},
        meta_description = ${data.meta_description ?? null},
        focus_keyphrase = ${data.focus_keyphrase ?? null},
        status = COALESCE(${data.status || null}, status),
        published_at = ${pubAt},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    if (!isMissingBlogCategorySchemaError(error)) throw error;
    const result = await sql`
      UPDATE blog_posts SET
        title = COALESCE(${data.title || null}, title),
        slug = COALESCE(${data.slug || null}, slug),
        excerpt = ${data.excerpt ?? null},
        content = ${data.content ?? null},
        category = ${data.category ?? null},
        category_slug = ${data.category_slug ?? null},
        read_time = ${data.read_time ?? null},
        featured_image = ${data.featured_image ?? null},
        meta_title = ${data.meta_title ?? null},
        meta_description = ${data.meta_description ?? null},
        focus_keyphrase = ${data.focus_keyphrase ?? null},
        status = COALESCE(${data.status || null}, status),
        published_at = ${pubAt},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0];
  }
}

export async function deleteBlogPost(id: string) {
  await sql`DELETE FROM media_usage WHERE entity_type = 'blog_post' AND entity_id = ${id}`;
  await sql`DELETE FROM blog_posts WHERE id = ${id}`;
}

export async function publishScheduledPosts() {
  await sql`
    UPDATE blog_posts
    SET status = 'published', updated_at = NOW()
    WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= NOW()
  `;
}

// ============================================
// KEYPHRASE TRACKING
// ============================================

export async function findDuplicateKeyphrases(
  keyphrase: string,
  excludeId: string | null,
  excludeType: string | null,
): Promise<{ id: string; title: string; type: "blog_post" | "listing"; editUrl: string }[]> {
  const kpLower = keyphrase.toLowerCase().trim();
  if (!kpLower) return [];

  const results: { id: string; title: string; type: "blog_post" | "listing"; editUrl: string }[] = [];

  // Search listings
  const listings = await sql`
    SELECT id, name, type FROM listings
    WHERE LOWER(TRIM(focus_keyphrase)) = ${kpLower}
  `;
  for (const l of listings as any[]) {
    if (excludeType === "listing" && excludeId && l.id === excludeId) continue;
    results.push({
      id: l.id,
      title: l.name,
      type: "listing",
      editUrl: `/admin/listings/${l.id}/edit`,
    });
  }

  // Search blog posts
  const posts = await sql`
    SELECT id, title FROM blog_posts
    WHERE LOWER(TRIM(focus_keyphrase)) = ${kpLower}
  `;
  for (const p of posts as any[]) {
    if (excludeType === "blog_post" && excludeId && p.id === excludeId) continue;
    results.push({
      id: p.id,
      title: p.title,
      type: "blog_post",
      editUrl: `/admin/posts/${p.id}/edit`,
    });
  }

  return results;
}

/**
 * Get all focus keyphrases currently in use across listings and blog posts,
 * along with their usage counts. Optionally exclude a specific content item.
 * Returns a map of keyphrase → count, sorted by count descending.
 */
export async function getKeyphraseUsageCounts(
  excludeId?: string,
  excludeType?: "listing" | "blog_post",
): Promise<{ keyphrase: string; count: number }[]> {
  const [listings, posts] = await Promise.all([
    sql`
      SELECT LOWER(TRIM(focus_keyphrase)) AS kp
      FROM listings
      WHERE focus_keyphrase IS NOT NULL AND TRIM(focus_keyphrase) != ''
      ${excludeType === "listing" && excludeId ? sql`AND id != ${excludeId}` : sql``}
    `,
    sql`
      SELECT LOWER(TRIM(focus_keyphrase)) AS kp
      FROM blog_posts
      WHERE focus_keyphrase IS NOT NULL AND TRIM(focus_keyphrase) != ''
      ${excludeType === "blog_post" && excludeId ? sql`AND id != ${excludeId}` : sql``}
    `,
  ]);

  const counts = new Map<string, number>();
  for (const row of [...(listings as any[]), ...(posts as any[])]) {
    if (row.kp) counts.set(row.kp, (counts.get(row.kp) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([keyphrase, count]) => ({ keyphrase, count }))
    .sort((a, b) => b.count - a.count);
}

// ============================================
// MEDIA
// ============================================

export async function getMedia(options?: { limit?: number; search?: string; folderId?: number | "unfiled" | null } | number) {
  // Support legacy call: getMedia(100) or new call: getMedia({ limit: 100, search: "...", folderId: 1 })
  const { limit = 50, search = "", folderId = null } = typeof options === "number" ? { limit: options } : (options || {});

  if (search && folderId === "unfiled") {
    const pattern = `%${search}%`;
    return sql`
      SELECT * FROM media
      WHERE folder_id IS NULL
        AND (filename ILIKE ${pattern} OR alt_text ILIKE ${pattern} OR title ILIKE ${pattern})
      ORDER BY uploaded_at DESC LIMIT ${limit}
    `;
  }
  if (search && typeof folderId === "number") {
    const pattern = `%${search}%`;
    return sql`
      SELECT * FROM media
      WHERE folder_id = ${folderId}
        AND (filename ILIKE ${pattern} OR alt_text ILIKE ${pattern} OR title ILIKE ${pattern})
      ORDER BY uploaded_at DESC LIMIT ${limit}
    `;
  }
  if (search) {
    const pattern = `%${search}%`;
    return sql`
      SELECT * FROM media
      WHERE filename ILIKE ${pattern} OR alt_text ILIKE ${pattern} OR title ILIKE ${pattern}
      ORDER BY uploaded_at DESC LIMIT ${limit}
    `;
  }
  if (folderId === "unfiled") {
    return sql`SELECT * FROM media WHERE folder_id IS NULL ORDER BY uploaded_at DESC LIMIT ${limit}`;
  }
  if (typeof folderId === "number") {
    return sql`SELECT * FROM media WHERE folder_id = ${folderId} ORDER BY uploaded_at DESC LIMIT ${limit}`;
  }
  return sql`SELECT * FROM media ORDER BY uploaded_at DESC LIMIT ${limit}`;
}

export async function createMedia(data: { filename: string; url: string; mime_type?: string; size_bytes?: number; width?: number; height?: number; alt_text?: string; title?: string; caption?: string; description?: string; folder_id?: number | null }) {
  const result = await sql`
    INSERT INTO media (filename, url, mime_type, size_bytes, width, height, alt_text, title, caption, description, folder_id)
    VALUES (${data.filename}, ${data.url}, ${data.mime_type || null}, ${data.size_bytes || null}, ${data.width || null}, ${data.height || null}, ${data.alt_text || null}, ${data.title || null}, ${data.caption || null}, ${data.description || null}, ${data.folder_id ?? null})
    RETURNING *
  `;
  return result[0];
}

export async function updateMedia(id: string, data: { filename?: string; alt_text?: string; title?: string; caption?: string; description?: string; folder_id?: number | null }) {
  const result = await sql`
    UPDATE media SET
      filename = ${"filename" in data ? (data.filename || sql`filename`) : sql`filename`},
      alt_text = ${data.alt_text ?? null},
      title = ${data.title ?? null},
      caption = ${data.caption ?? null},
      description = ${data.description ?? null},
      folder_id = ${"folder_id" in data ? (data.folder_id ?? null) : sql`folder_id`},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result.length > 0 ? result[0] : null;
}

export async function getMediaByUrls(urls: string[]) {
  if (!urls || urls.length === 0) return [];
  return sql`SELECT * FROM media WHERE url = ANY(${urls})`;
}

export async function deleteMedia(id: string) {
  await sql`DELETE FROM media WHERE id = ${id}`;
}

export async function deleteMediaUsageByUrl(mediaUrl: string) {
  await sql`DELETE FROM media_usage WHERE media_url = ${mediaUrl}`;
}

// ============================================
// MEDIA FOLDERS
// ============================================

export async function getMediaFolders() {
  return sql`SELECT * FROM media_folders ORDER BY sort_order ASC, name ASC`;
}

export async function findMediaFolderBySlug(slug: string) {
  const results = await sql`SELECT * FROM media_folders WHERE slug = ${slug} LIMIT 1`;
  return results.length > 0 ? (results[0] as { id: number; name: string; slug: string; parent_id: number | null; sort_order: number }) : null;
}

export async function countMediaInFolder(folderId: number): Promise<number> {
  const [row] = await sql`SELECT COUNT(*)::int AS count FROM media WHERE folder_id = ${folderId}`;
  return (row as any)?.count ?? 0;
}

export interface MediaFolderTreeNode {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  sort_order: number;
  media_count: number;
  total_count: number;
  children: MediaFolderTreeNode[];
}

export async function getMediaFolderTree(): Promise<{
  tree: MediaFolderTreeNode[];
  flatFolders: any[];
  unfiledCount: number;
  totalCount: number;
}> {
  const folders = await sql`
    SELECT mf.*,
      COALESCE((SELECT COUNT(*)::int FROM media WHERE folder_id = mf.id), 0) as media_count
    FROM media_folders mf
    ORDER BY mf.sort_order ASC, mf.name ASC
  `;

  const [{ unfiled_count, total_count }] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM media WHERE folder_id IS NULL) as unfiled_count,
      (SELECT COUNT(*)::int FROM media) as total_count
  `;

  const flatFolders = folders as any[];
  const nodeMap = new Map<number, MediaFolderTreeNode>();

  for (const f of flatFolders) {
    nodeMap.set(f.id, {
      id: f.id,
      name: f.name,
      slug: f.slug,
      parent_id: f.parent_id,
      sort_order: f.sort_order,
      media_count: f.media_count,
      total_count: f.media_count,
      children: [],
    });
  }

  const roots: MediaFolderTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function computeTotals(node: MediaFolderTreeNode): number {
    let total = node.media_count;
    for (const child of node.children) {
      total += computeTotals(child);
    }
    node.total_count = total;
    return total;
  }
  for (const root of roots) {
    computeTotals(root);
  }

  return { tree: roots, flatFolders, unfiledCount: unfiled_count, totalCount: total_count };
}

export async function moveMediaToFolder(mediaIds: string[], folderId: number | null) {
  if (mediaIds.length === 0) return;
  await sql`
    UPDATE media SET folder_id = ${folderId}, updated_at = NOW()
    WHERE id = ANY(${mediaIds})
  `;
}

export async function createMediaFolder(data: { name: string; slug: string; parent_id?: number | null }) {
  const result = await sql`
    INSERT INTO media_folders (name, slug, parent_id)
    VALUES (${data.name}, ${data.slug}, ${data.parent_id ?? null})
    RETURNING *
  `;
  return result[0];
}

export async function renameMediaFolder(id: number, name: string, slug: string) {
  const result = await sql`
    UPDATE media_folders SET name = ${name}, slug = ${slug}
    WHERE id = ${id}
    RETURNING *
  `;
  return result.length > 0 ? result[0] : null;
}

export async function deleteMediaFolder(id: number) {
  // Reparent child folders to the deleted folder's parent
  const [folder] = await sql`SELECT parent_id FROM media_folders WHERE id = ${id}`;
  if (folder) {
    await sql`UPDATE media_folders SET parent_id = ${folder.parent_id} WHERE parent_id = ${id}`;
  }
  // Orphan media to unfiled
  await sql`UPDATE media SET folder_id = NULL WHERE folder_id = ${id}`;
  await sql`DELETE FROM media_folders WHERE id = ${id}`;
}

// ============================================
// MEDIA USAGE TRACKING
// ============================================

/**
 * Replace-all strategy: delete existing usage for an entity, then insert new records.
 */
export async function syncMediaUsage(
  entityType: "listing" | "blog_post",
  entityId: string,
  usages: { url: string; usage_type: string }[]
) {
  await sql`DELETE FROM media_usage WHERE entity_type = ${entityType} AND entity_id = ${entityId}`;
  for (const u of usages) {
    await sql`
      INSERT INTO media_usage (media_url, entity_type, entity_id, usage_type)
      VALUES (${u.url}, ${entityType}, ${entityId}, ${u.usage_type})
    `;
  }
}

/**
 * Get all usage records for a given media URL (with entity names via JOIN).
 */
export async function getMediaUsage(mediaUrl: string) {
  return sql`
    SELECT mu.*,
      CASE mu.entity_type
        WHEN 'listing' THEN (SELECT name FROM listings WHERE id::text = mu.entity_id LIMIT 1)
        WHEN 'blog_post' THEN (SELECT title FROM blog_posts WHERE id::text = mu.entity_id LIMIT 1)
      END as entity_name
    FROM media_usage mu
    WHERE mu.media_url = ${mediaUrl}
    ORDER BY mu.entity_type, mu.created_at
  `;
}

/**
 * Batch query returning { url: count } map for media grid badges.
 */
export async function getMediaUsageCounts(urls: string[]) {
  if (!urls || urls.length === 0) return {};
  const rows = await sql`
    SELECT media_url, COUNT(*)::int as usage_count
    FROM media_usage
    WHERE media_url = ANY(${urls})
    GROUP BY media_url
  `;
  const counts: Record<string, number> = {};
  for (const row of rows as any[]) {
    counts[row.media_url] = row.usage_count;
  }
  return counts;
}

/**
 * Delete usage records for an entity (called when listing/post is deleted).
 */
export async function deleteMediaUsageByEntity(entityType: "listing" | "blog_post", entityId: string) {
  await sql`DELETE FROM media_usage WHERE entity_type = ${entityType} AND entity_id = ${entityId}`;
}

// ============================================
// SETTINGS
// ============================================

export async function getSettings() {
  const rows = await sql`SELECT key, value FROM settings`;
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function updateSetting(key: string, value: string) {
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

// ============================================
// RAG DOCUMENTS (Keyword / SEO reference docs)
// ============================================

export async function getRagDocuments() {
  return sql`SELECT * FROM rag_documents ORDER BY created_at DESC`;
}

export async function getRagDocumentById(id: string) {
  const results = await sql`SELECT * FROM rag_documents WHERE id = ${id} LIMIT 1`;
  return results.length > 0 ? results[0] : null;
}

export async function getActiveRagDocuments() {
  return sql`SELECT * FROM rag_documents WHERE is_active = true ORDER BY created_at ASC`;
}

export async function createRagDocument(data: { title: string; content: string; source_url?: string; created_by?: string }) {
  const result = await sql`
    INSERT INTO rag_documents (title, content, source_url, created_by)
    VALUES (${data.title}, ${data.content}, ${data.source_url || null}, ${data.created_by || null})
    RETURNING *
  `;
  return result[0];
}

export async function updateRagDocument(id: string, data: { title?: string; content?: string; is_active?: boolean }) {
  const result = await sql`
    UPDATE rag_documents SET
      title = COALESCE(${data.title || null}, title),
      content = COALESCE(${data.content ?? null}, content),
      is_active = COALESCE(${data.is_active ?? null}, is_active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result.length > 0 ? result[0] : null;
}

export async function deleteRagDocument(id: string) {
  await sql`DELETE FROM rag_documents WHERE id = ${id}`;
}

// ============================================
// STATS (for admin dashboard)
// ============================================

export async function getAdminStats() {
  const [listingStats] = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'published')::int as published,
      COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
      COUNT(*) FILTER (WHERE status = 'draft')::int as draft
    FROM listings
  `;

  const [blogStats] = await sql`
    SELECT COUNT(*)::int as total FROM blog_posts
  `;

  const [reviewStats] = await sql`
    SELECT
      COUNT(*)::int as linked_count,
      COALESCE(AVG(g.place_rating), 0)::numeric(2,1) as avg_rating,
      COALESCE(SUM(g.place_review_count), 0)::int as total_reviews
    FROM listings l
    LEFT JOIN google_reviews_cache g ON l.id = g.listing_id
    WHERE l.google_place_id IS NOT NULL AND l.google_place_id != ''
  `;

  return {
    listings: listingStats,
    blogPosts: blogStats.total,
    reviews: reviewStats,
  };
}

export async function getRecentListings(limit = 5) {
  return sql`
    SELECT l.*, c.name as category_name
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    ORDER BY l.updated_at DESC
    LIMIT ${limit}
  `;
}

export async function getRecentBlogPosts(limit = 5) {
  return sql`
    SELECT * FROM blog_posts
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
}

export async function getRecentReviews(limit = 5) {
  const rows = await sql`
    SELECT
      g.listing_id,
      g.reviews,
      g.place_rating,
      g.fetched_at,
      l.name as listing_name,
      l.type as listing_type
    FROM google_reviews_cache g
    JOIN listings l ON g.listing_id = l.id
    WHERE g.reviews IS NOT NULL AND jsonb_typeof(g.reviews) = 'array' AND g.reviews != '[]'::jsonb
    ORDER BY g.fetched_at DESC
    LIMIT ${limit}
  `;

  // Flatten: pick the first (most relevant) review from each listing
  const recentReviews: any[] = [];
  for (const row of rows as any[]) {
    const reviews = typeof row.reviews === "string" ? JSON.parse(row.reviews) : row.reviews;
    if (reviews.length > 0) {
      recentReviews.push({
        ...reviews[0],
        listing_name: row.listing_name,
        listing_type: row.listing_type,
        listing_id: row.listing_id,
        place_rating: row.place_rating,
      });
    }
  }
  return recentReviews.slice(0, limit);
}

// ── Orphaned Content Detection ──────────────────
// Finds published content with no inbound internal links from other content.

export async function detectOrphanedContent(): Promise<{
  orphanedListings: { id: string; name: string; type: string; slug: string }[];
  orphanedPosts: { id: string; title: string; slug: string }[];
}> {
  // 1. Fetch all published listings and blog posts
  const [allListings, allPosts] = await Promise.all([
    sql`SELECT id, name, type, slug, description FROM listings WHERE status = 'published'`,
    sql`SELECT id, title, slug, content FROM blog_posts WHERE status = 'published'`,
  ]);

  const listings = allListings as any[];
  const posts = allPosts as any[];

  // 2. Extract all internal links from every piece of content
  const linkedPaths = new Set<string>();
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;

  function extractLinks(html: string | null | undefined) {
    if (!html) return;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];
      // Normalize: keep only internal links
      if (href.startsWith(siteConfig.siteUrl)) {
        try { href = new URL(href).pathname; } catch { continue; }
      } else if (!href.startsWith("/")) {
        continue; // external link
      }
      // Normalize trailing slashes
      linkedPaths.add(href.replace(/\/$/, "") || "/");
    }
  }

  // Extract links from all listing descriptions
  for (const l of listings) {
    extractLinks(l.description);
  }
  // Extract links from all blog post content
  for (const p of posts) {
    extractLinks(p.content);
  }

  // 3. Check which published content URLs have zero inbound links
  const orphanedListings: { id: string; name: string; type: string; slug: string }[] = [];
  for (const l of listings) {
    const url = `/listing/${l.type}/${l.slug}`;
    if (!linkedPaths.has(url)) {
      orphanedListings.push({ id: l.id, name: l.name, type: l.type, slug: l.slug });
    }
  }

  const orphanedPosts: { id: string; title: string; slug: string }[] = [];
  for (const p of posts) {
    const canonicalUrl = getNewsArticlePath(p.slug);
    const legacyUrl = `/${p.slug}`;
    if (!linkedPaths.has(canonicalUrl) && !linkedPaths.has(legacyUrl)) {
      orphanedPosts.push({ id: p.id, title: p.title, slug: p.slug });
    }
  }

  return { orphanedListings, orphanedPosts };
}

// ── Redirects CRUD ──────────────────────────────

export interface Redirect {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  hit_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getRedirects(): Promise<Redirect[]> {
  const rows = await sql`SELECT * FROM redirects ORDER BY created_at DESC`;
  return rows as unknown as Redirect[];
}

export async function getRedirectByFromPath(fromPath: string): Promise<Redirect | null> {
  const rows = await sql`SELECT * FROM redirects WHERE from_path = ${fromPath} LIMIT 1`;
  return (rows as any[])[0] || null;
}

export async function createRedirect(data: { from_path: string; to_path: string; status_code?: number; notes?: string }): Promise<Redirect> {
  const rows = await sql`
    INSERT INTO redirects (from_path, to_path, status_code, notes)
    VALUES (${data.from_path}, ${data.to_path}, ${data.status_code || 301}, ${data.notes || null})
    RETURNING *
  `;
  return (rows as any[])[0] as Redirect;
}

export async function updateRedirect(id: string, data: { from_path?: string; to_path?: string; status_code?: number; notes?: string }): Promise<void> {
  await sql`
    UPDATE redirects SET
      from_path = COALESCE(${data.from_path ?? null}, from_path),
      to_path = COALESCE(${data.to_path ?? null}, to_path),
      status_code = COALESCE(${data.status_code ?? null}, status_code),
      notes = COALESCE(${data.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function deleteRedirect(id: string): Promise<void> {
  await sql`DELETE FROM redirects WHERE id = ${id}`;
}

export async function incrementRedirectHitCount(id: string): Promise<void> {
  await sql`UPDATE redirects SET hit_count = hit_count + 1 WHERE id = ${id}`;
}

export async function getAllRedirectsMap(): Promise<Map<string, { id: string; to: string; code: number }>> {
  const rows = await sql`SELECT id, from_path, to_path, status_code FROM redirects`;
  const map = new Map<string, { id: string; to: string; code: number }>();
  for (const r of rows as any[]) {
    map.set(r.from_path, { id: r.id, to: r.to_path, code: r.status_code });
  }
  return map;
}
