import sql from "./db.server";
import { getSettings } from "./queries.server";
import { generateListingContent, generateHikingContent, inferTrailAttributes } from "./claude-ai.server";
import type { InferredTrailAttributes } from "./claude-ai.server";
import { fetchNpsThingsToDo, fetchNpsAlerts, parseNpsTrailSpecs } from "./nps-api.server";
import { fetchTrailFromOverpass } from "./overpass-api.server";
import { fetchPermitInfo } from "./recreation-gov.server";
import { fetchBlmTrailData } from "./blm-gtlf.server";
import { fetchUsfsTrailData } from "./usfs-trails.server";
import { fetchElevationData } from "./usgs-elevation.server";
import { fetchWikidataTrailInfo, fetchWikipediaExtract } from "./wikidata-trails.server";
import { siteConfig } from "./site-config";

// ============================================
// GOOGLE PLACES API — Review Fetching
// Uses legacy Place Details endpoint for broad
// API key compatibility.
// ============================================

export interface GoogleReview {
  author_name: string;
  author_photo: string;
  author_url: string;
  rating: number;
  text: string;
  time: string;
  language: string;
  relative_time: string;
}

export interface GoogleReviewsData {
  rating: number;
  reviewCount: number;
  reviews: GoogleReview[];
}

export interface CachedGoogleReviews {
  listing_id: string;
  google_place_id: string;
  place_rating: number | null;
  place_review_count: number | null;
  reviews: GoogleReview[];
  fetched_at: string;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Get the Google Places API key from settings or environment variable.
 */
export async function getGoogleApiKey(): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (settings.google_places_api_key) {
      return settings.google_places_api_key;
    }
  } catch {
    // Fall through to env var
  }
  return process.env.GOOGLE_PLACES_API_KEY || null;
}

/**
 * Fetch reviews from Google Places API (legacy Place Details endpoint).
 */
export async function fetchGoogleReviews(
  placeId: string,
  apiKey: string
): Promise<GoogleReviewsData | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&reviews_sort=newest&key=${apiKey}&language=en`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `Google Places API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();

    if (data.status !== "OK") {
      console.error(`Google Places API status: ${data.status}`, data.error_message || "");
      return null;
    }

    const result = data.result;
    const reviews: GoogleReview[] = (result.reviews || []).map((r: any) => ({
      author_name: r.author_name || "Anonymous",
      author_photo: r.profile_photo_url || "",
      author_url: r.author_url || "",
      rating: r.rating || 0,
      text: r.text || "",
      time: r.time ? new Date(r.time * 1000).toISOString() : "",
      language: r.language || "en",
      relative_time: r.relative_time_description || "",
    }));

    return {
      rating: result.rating || 0,
      reviewCount: result.user_ratings_total || 0,
      reviews,
    };
  } catch (error) {
    console.error("Failed to fetch Google Reviews:", error);
    return null;
  }
}

/**
 * Get Google Reviews for a listing, using cache with 12-hour TTL.
 * Returns cached data if fresh, otherwise fetches from API.
 * Falls back to stale cache if API fails.
 */
export async function getGoogleReviewsForListing(
  listingId: string,
  placeId: string
): Promise<CachedGoogleReviews | null> {
  // Check cache
  const cached = await sql`
    SELECT * FROM google_reviews_cache
    WHERE listing_id = ${listingId}
    LIMIT 1
  `;

  if (cached.length > 0) {
    const row = cached[0] as unknown as CachedGoogleReviews;
    const fetchedAt = new Date(row.fetched_at).getTime();
    const isStale = Date.now() - fetchedAt > CACHE_TTL_MS;

    if (!isStale) {
      return row;
    }

    // Cache is stale — try to refresh
    const apiKey = await getGoogleApiKey();
    if (!apiKey) return row; // No API key, return stale

    const fresh = await fetchGoogleReviews(placeId, apiKey);
    if (!fresh) return row; // API failed, return stale

    // Update cache
    await upsertReviewsCache(listingId, placeId, fresh);
    // Update listing rating
    await updateListingRating(listingId, fresh.rating, fresh.reviewCount);

    return {
      listing_id: listingId,
      google_place_id: placeId,
      place_rating: fresh.rating,
      place_review_count: fresh.reviewCount,
      reviews: fresh.reviews,
      fetched_at: new Date().toISOString(),
    };
  }

  // No cache exists — fetch fresh
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return null;

  const fresh = await fetchGoogleReviews(placeId, apiKey);
  if (!fresh) return null;

  await upsertReviewsCache(listingId, placeId, fresh);
  await updateListingRating(listingId, fresh.rating, fresh.reviewCount);

  return {
    listing_id: listingId,
    google_place_id: placeId,
    place_rating: fresh.rating,
    place_review_count: fresh.reviewCount,
    reviews: fresh.reviews,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Upsert review data into the cache table.
 */
async function upsertReviewsCache(
  listingId: string,
  placeId: string,
  data: GoogleReviewsData
) {
  await sql`
    INSERT INTO google_reviews_cache (listing_id, google_place_id, place_rating, place_review_count, reviews, fetched_at)
    VALUES (${listingId}, ${placeId}, ${data.rating}, ${data.reviewCount}, ${JSON.stringify(data.reviews)}, NOW())
    ON CONFLICT (listing_id)
    DO UPDATE SET
      google_place_id = ${placeId},
      place_rating = ${data.rating},
      place_review_count = ${data.reviewCount},
      reviews = ${JSON.stringify(data.reviews)},
      fetched_at = NOW()
  `;
}

/**
 * Update listing avg_rating and review_count from Google data.
 */
async function updateListingRating(
  listingId: string,
  rating: number,
  reviewCount: number
) {
  await sql`
    UPDATE listings
    SET avg_rating = ${rating}, review_count = ${reviewCount}, updated_at = NOW()
    WHERE id = ${listingId}
  `;
}

/**
 * Force refresh reviews for a single listing.
 */
export async function refreshGoogleReviews(
  listingId: string,
  placeId: string
): Promise<CachedGoogleReviews | null> {
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return null;

  const fresh = await fetchGoogleReviews(placeId, apiKey);
  if (!fresh) return null;

  await upsertReviewsCache(listingId, placeId, fresh);
  await updateListingRating(listingId, fresh.rating, fresh.reviewCount);

  return {
    listing_id: listingId,
    google_place_id: placeId,
    place_rating: fresh.rating,
    place_review_count: fresh.reviewCount,
    reviews: fresh.reviews,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Get all listings with Google Reviews data (for admin overview).
 */
export async function getGoogleReviewsOverview() {
  return sql`
    SELECT
      l.id,
      l.name,
      l.type,
      l.google_place_id,
      g.place_rating,
      g.place_review_count,
      g.fetched_at,
      g.reviews
    FROM listings l
    LEFT JOIN google_reviews_cache g ON l.id = g.listing_id
    WHERE l.google_place_id IS NOT NULL AND l.google_place_id != ''
    ORDER BY l.name
  `;
}

/**
 * Get aggregate stats for Google Reviews across all listings.
 */
export async function getGoogleReviewsStats() {
  const [result] = await sql`
    SELECT
      COUNT(*)::int as linked_count,
      COALESCE(AVG(g.place_rating), 0)::numeric(2,1) as avg_rating,
      COALESCE(SUM(g.place_review_count), 0)::int as total_reviews
    FROM listings l
    LEFT JOIN google_reviews_cache g ON l.id = g.listing_id
    WHERE l.google_place_id IS NOT NULL AND l.google_place_id != ''
  `;
  return result;
}

/**
 * Get the most recent Google Reviews across all listings (for dashboard widget).
 */
export async function getRecentGoogleReviews(limit = 5) {
  const rows = await sql`
    SELECT
      g.listing_id,
      g.reviews,
      g.place_rating,
      l.name as listing_name,
      l.type as listing_type
    FROM google_reviews_cache g
    JOIN listings l ON g.listing_id = l.id
    WHERE jsonb_array_length(g.reviews) > 0
    ORDER BY g.fetched_at DESC
    LIMIT ${limit}
  `;

  // Flatten: pick the most recent review from each listing
  const recentReviews: Array<GoogleReview & { listing_name: string; listing_type: string }> = [];
  for (const row of rows as any[]) {
    const reviews = typeof row.reviews === "string" ? JSON.parse(row.reviews) : row.reviews;
    if (reviews.length > 0) {
      recentReviews.push({
        ...reviews[0],
        listing_name: row.listing_name,
        listing_type: row.listing_type,
      });
    }
  }
  return recentReviews.slice(0, limit);
}

// ============================================
// AUTO-POPULATE — Fetch full Place Details
// ============================================

export interface GooglePhotoRef {
  name: string;       // "places/{id}/photos/{ref}" — for photo download API
  widthPx: number;
  heightPx: number;
}

export interface PlaceDetailsData {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  priceRange: string | null;
  priceRangeSource: "google" | "ai_estimate" | null;
  rating: number;
  reviewCount: number;
  tagline: string | null;
  description: string | null;
  businessHours: { day: string; open_time: string | null; close_time: string | null; is_closed: boolean }[];
  types: string[];
  editorialSummary: string | null;
  reviewSnippets: string[];
  suggestedCategorySlug: string | null;
  // New Places API fields
  googleMapsUri: string | null;
  googlePrimaryType: string | null;
  generativeSummary: string | null;
  autoAmenities: string[];             // amenity slugs to auto-link
  photoReferences: GooglePhotoRef[];
  serviceSignals: Record<string, boolean>;  // raw booleans for AI content enrichment
  apiSource: "new" | "legacy";         // which Google API was used
  newApiError?: string;                // debug: error from New API attempt (if fell back to legacy)
  // Hiking enrichment (from NPS, OSM, RIDB, BLM, USFS, USGS, Wikidata — only present for hiking/parks listings)
  hikingEnrichment?: {
    // ── Resolved trickle-down fields (best available from any source) ──
    distanceMiles?: number;
    difficulty?: string;          // "easy" | "moderate" | "hard" | "expert"
    surface?: string;
    surfaceType?: string;         // detailed surface for DB: "rock", "paved", "native", etc.
    trailType?: string;           // "loop" | "out_and_back" | "point_to_point"
    estimatedTime?: string;
    elevationGainFt?: number;     // best available elevation gain
    seasonStart?: string;         // resolved month name
    seasonEnd?: string;           // resolved month name
    dogsAllowed?: boolean;        // resolved dog policy
    waterAvailable?: boolean;     // resolved water availability

    // ── Source-specific fields (for AI content + special handling) ──
    osmDistanceMiles?: number;
    osmDifficulty?: string;
    osmSurface?: string;
    osmTrailType?: string;
    osmDogPolicy?: string;        // "yes" | "no" | "leashed"
    osmDrinkingWater?: string;    // "yes" | "no"
    osmWheelchair?: string;       // "yes" | "no" | "limited"
    osmAccess?: string;           // "yes" | "permissive" | "private"
    osmElevationGainFt?: number;  // from node ele tags
    npsDescription?: string;
    npsDuration?: string;
    npsSeason?: string[];
    npsPetsPermitted?: string;
    npsFeesApply?: boolean;
    npsAccessibility?: string;       // raw accessibilityInformation text
    npsDistanceMiles?: number;       // parsed from accessibilityInformation
    npsElevationGainFt?: number;     // parsed from accessibilityInformation
    permitRequired?: boolean;
    permitInfo?: string;
    permitFee?: string;
    npsAlerts?: { title: string; description: string; category: string }[];

    // ── BLM-specific fields ──
    blmDistanceMiles?: number;
    blmSurface?: string;
    blmTransportMode?: string;
    blmSeasonRestriction?: string;

    // ── USFS-specific fields ──
    usfsDistanceMiles?: number;
    usfsDifficulty?: string;
    usfsSurface?: string;
    usfsTrailClass?: string;      // "TC1"-"TC5"
    usfsTypicalGrade?: number;    // percentage
    usfsAccessibility?: string;
    usfsDesignation?: string;     // national trail designation
    usfsSeasonStart?: string;
    usfsSeasonEnd?: string;

    // ── USGS-specific fields ──
    usgsTrailheadElevationFt?: number;
    usgsEstimatedGainFt?: number;
    usgsPeakElevationFt?: number;
    usgsSamplePoints?: number;

    // ── Wikidata-specific fields ──
    wikidataDescription?: string;
    wikidataDistanceMiles?: number;
    wikidataElevationMeters?: number;
    wikidataManagingAgency?: string;
    wikidataWikipediaUrl?: string;
    wikidataImageUrl?: string;
    wikidataId?: string;
    wikipediaExtract?: string; // Full article extract from Wikipedia REST API

    // ── AI-inferred attributes (from Google reviews + context) ──
    aiInferred?: InferredTrailAttributes;

    dataSources?: string[];       // which APIs returned data, e.g. ["NPS", "OSM", "RIDB", "BLM", "USFS", "USGS", "Wikidata", "AI"]
  };
}

/**
 * Map Google Places types to our predefined category slugs.
 * Returns the best-matching category slug, or null if no match.
 *
 * Category slugs must match what's in the `categories` table:
 * DINING: american-restaurant, mexican, pizza, cafe-bakery, fine-dining,
 *         asian-restaurant, italian, brewery-bar, fast-food, dessert-ice-cream,
 *         seafood, bbq-smokehouse, grocery-market, food-truck, steakhouse
 * LODGING: hotel, motel, vacation-rental, glamping, campground, bb-inn,
 *          rv-park, resort, cabin
 * EXPERIENCES: tour-operator, gear-rental, canyoneering, horseback-riding,
 *              photography-tour, recreation, atv-off-road, ebike-tour, winery,
 *              guide-service, rock-climbing, river-activity, spa-wellness, art-gallery
 * TRANSPORTATION: shuttle-service, car-rental, bike-rental, e-bike-rental, airport
 */
function mapGoogleTypesToCategorySlug(types: string[], primaryType?: string | null): string | null {
  const t = new Set(types);
  const pt = primaryType || null;

  // --- HIKING --- (check before dining/experiences so hiking_area is caught)
  if (t.has("hiking_area") || pt === "hiking_area") return "day-hike";

  // --- LANDMARKS & VIEWPOINTS → experiences ---
  if (t.has("historical_landmark") || pt === "historical_landmark") return "points-of-interest";
  if (t.has("observation_deck") || pt === "observation_deck") return "points-of-interest";

  // --- DINING ---
  // Asian cuisines (Japanese, Chinese, Thai, Vietnamese, Korean, Indian, etc.)
  if (t.has("japanese_restaurant") || t.has("chinese_restaurant") || t.has("thai_restaurant") ||
      t.has("vietnamese_restaurant") || t.has("korean_restaurant") || t.has("indian_restaurant") ||
      t.has("ramen_restaurant") || t.has("sushi_restaurant")) {
    return "asian-restaurant";
  }
  // Mexican
  if (t.has("mexican_restaurant")) return "mexican";
  // Italian
  if (t.has("italian_restaurant")) return "italian";
  // Pizza
  if (t.has("pizza_restaurant")) return "pizza";
  // Cafe / Coffee / Bakery
  if (t.has("cafe") || t.has("coffee_shop") || t.has("bakery")) return "cafe-bakery";
  // Bar / Brewery — check BEFORE generic restaurant types to prevent
  // bars that also have "restaurant" or "american_restaurant" from falling through
  if (t.has("bar") || t.has("night_club") || t.has("brewery")) return "brewery-bar";
  // Ice cream / Dessert
  if (t.has("ice_cream_shop") || t.has("dessert_shop") || t.has("dessert_restaurant")) return "dessert-ice-cream";
  // Fast food
  if (t.has("fast_food_restaurant") || t.has("hamburger_restaurant")) return "fast-food";
  // Seafood
  if (t.has("seafood_restaurant")) return "seafood";
  // Steakhouse
  if (t.has("steak_house")) return "steakhouse";
  // Winery
  if (t.has("winery")) return "winery";
  // Grocery / Market / Supermarket
  if (t.has("supermarket") || t.has("grocery_or_supermarket") || t.has("convenience_store")) return "grocery-market";
  // American / specific restaurant subtypes
  if (t.has("american_restaurant") ||
      t.has("sandwich_shop") || t.has("brunch_restaurant") || t.has("breakfast_restaurant")) {
    return "american-restaurant";
  }
  // Generic restaurant fallback — return null to let admin pick the correct category
  // instead of dumping everything into american-restaurant
  if (t.has("restaurant") || t.has("food") || t.has("meal_delivery") || t.has("meal_takeaway")) {
    return null;
  }

  // --- LODGING ---
  if (t.has("resort_hotel")) return "resort";
  if (t.has("motel")) return "motel";
  if (t.has("hotel") || t.has("extended_stay_hotel")) return "hotel";
  if (t.has("bed_and_breakfast") || t.has("inn")) return "bb-inn";
  if (t.has("rv_park")) return "rv-park";
  if (t.has("campground")) return "campground";
  if (t.has("lodging") || t.has("guest_house")) return "vacation-rental";

  // --- PARKS --- (use primaryType to distinguish actual parks from things inside parks)
  if (pt === "national_park") return "national-park";
  if (pt === "state_park") return "state-park";
  if (pt === "national_monument") return "national-monument";
  if (pt === "national_forest") return "national-forest";
  if (pt === "wilderness_area") return "wilderness-area";
  if (pt === "conservation_area" || pt === "nature_reserve") return "national-conservation-area";
  if (pt === "city_park" || pt === "park") return "city-community-park";

  // --- GOLF ---
  if (t.has("golf_course") || pt === "golf_course") return "golf-courses";

  // --- EXPERIENCES ---
  if (t.has("travel_agency") || t.has("tour_agency")) return "tour-operator";
  if (t.has("bicycle_store") || t.has("bicycle_rental")) return "ebike-tour";
  if (t.has("art_gallery")) return "art-gallery";
  if (t.has("museum")) return "points-of-interest";
  if (t.has("visitor_center")) return "points-of-interest";
  if (t.has("spa") || t.has("hot_spring")) return "spa-wellness";
  if (t.has("marina")) return "river-activity";
  if (t.has("adventure_sports_center")) return "canyoneering";
  if (t.has("amusement_park") || t.has("water_park") ||
      t.has("swimming_pool") || t.has("ski_resort") || t.has("playground")) {
    return "recreation";
  }
  if (t.has("tourist_attraction")) return "points-of-interest";

  // --- TRANSPORTATION ---
  if (t.has("airport")) return "airport";
  if (t.has("car_rental")) return "car-rental";
  if (t.has("bus_station") || t.has("transit_station")) return "shuttle-service";

  return null;
}

/**
 * Map Google Places boolean fields to our amenity slugs.
 * Returns an array of amenity slugs that should be auto-linked.
 */
function mapGoogleFieldsToAmenities(p: any): string[] {
  const slugs: string[] = [];

  // Dining service booleans
  if (p.outdoorSeating) slugs.push("outdoor-seating");
  if (p.servesBeer || p.servesWine || p.servesCocktails) slugs.push("full-bar");
  if (p.takeout) slugs.push("takeout");
  if (p.delivery) slugs.push("delivery");
  if (p.dineIn) slugs.push("dine-in");
  if (p.curbsidePickup) slugs.push("curbside-pickup");
  if (p.reservable) slugs.push("reservations");
  if (p.servesVegetarianFood) slugs.push("vegan-options");
  if (p.liveMusic) slugs.push("live-entertainment");
  if (p.menuForChildren) slugs.push("kids-menu");

  // General
  if (p.allowsDogs) slugs.push("pet-friendly");
  if (p.goodForChildren || p.menuForChildren) slugs.push("family-friendly");
  if (p.restroom) slugs.push("restrooms");

  // Accessibility
  if (p.accessibilityOptions?.wheelchairAccessibleEntrance) slugs.push("wheelchair-accessible");

  // Parking
  if (p.parkingOptions?.freeParkingLot || p.parkingOptions?.freeStreetParking || p.parkingOptions?.freeGarageParking) {
    slugs.push("free-parking");
  }

  // EV charging
  if (p.evChargeOptions && Object.keys(p.evChargeOptions).length > 0) slugs.push("ev-charging");

  // Payment
  if (p.paymentOptions?.acceptsCreditCards) slugs.push("accepts-credit-cards");

  // Deduplicate (family-friendly may be added twice via goodForChildren + menuForChildren)
  return [...new Set(slugs)];
}

/**
 * Collect all Google boolean service/attribute signals into a flat record.
 * These get passed to AI content generation for richer descriptions.
 */
function collectServiceSignals(p: any): Record<string, boolean> {
  const signals: Record<string, boolean> = {};
  const boolFields = [
    "servesBreakfast", "servesLunch", "servesDinner", "servesBrunch",
    "servesBeer", "servesWine", "servesCocktails", "servesCoffee",
    "servesDessert", "servesVegetarianFood",
    "outdoorSeating", "liveMusic", "restroom",
    "allowsDogs", "goodForChildren", "menuForChildren",
    "goodForGroups", "goodForWatchingSports",
    "dineIn", "takeout", "delivery", "curbsidePickup", "reservable",
  ];

  for (const field of boolFields) {
    if (p[field] === true) signals[field] = true;
  }

  // Nested objects
  if (p.accessibilityOptions) {
    for (const [k, v] of Object.entries(p.accessibilityOptions)) {
      if (v === true) signals[`accessibility_${k}`] = true;
    }
  }
  if (p.parkingOptions) {
    for (const [k, v] of Object.entries(p.parkingOptions)) {
      if (v === true) signals[`parking_${k}`] = true;
    }
  }

  return signals;
}

/**
 * Fetch full Place Details from Google Places API (New) for auto-populating a listing.
 * Uses the New Places API (places.googleapis.com/v1/) for comprehensive data extraction.
 */
export async function fetchPlaceDetailsForAutoPopulate(
  placeId: string,
  options?: { skipAI?: boolean; skipContent?: boolean; skipHiking?: boolean; listingType?: string; trailName?: string }
): Promise<PlaceDetailsData | null> {
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return null;

  // Try New Places API first, fall back to legacy if not enabled
  let p: any = null;
  let usedNewApi = false;
  let newApiError: string | undefined;

  // --- Attempt 1: New Places API (v1) ---
  try {
    const fieldMask = [
      "displayName", "formattedAddress", "addressComponents", "nationalPhoneNumber",
      "websiteUri", "regularOpeningHours", "rating", "userRatingCount", "types",
      "primaryType", "primaryTypeDisplayName", "location", "priceLevel", "priceRange",
      "editorialSummary", "reviews", "generativeSummary", "googleMapsUri",
      "businessStatus", "photos",
      "servesBreakfast", "servesLunch", "servesDinner", "servesBrunch",
      "servesBeer", "servesWine", "servesCocktails", "servesCoffee",
      "servesDessert", "servesVegetarianFood",
      "outdoorSeating", "liveMusic", "restroom",
      "allowsDogs", "goodForChildren", "menuForChildren",
      "goodForGroups", "goodForWatchingSports",
      "dineIn", "takeout", "delivery", "curbsidePickup", "reservable",
      "accessibilityOptions", "parkingOptions", "paymentOptions", "evChargeOptions",
    ].join(",");

    const newUrl = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(newUrl, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
    });

    if (res.ok) {
      p = await res.json();
      usedNewApi = true;
    } else {
      const errorBody = await res.text();
      newApiError = `HTTP ${res.status}: ${errorBody}`;
      console.error(`New Places API error: ${newApiError}`);
    }
  } catch (err: any) {
    newApiError = `Network error: ${err.message || String(err)}`;
    console.warn("New Places API request failed, falling back to legacy:", err);
  }

  // --- Attempt 2: Legacy Place Details API ---
  if (!p) {
    try {
      const legacyFields = [
        "name", "formatted_address", "address_components", "formatted_phone_number",
        "website", "opening_hours", "rating", "user_ratings_total", "types",
        "geometry", "price_level", "editorial_summary", "reviews", "url",
        "business_status", "photos",
      ].join(",");

      const legacyUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${legacyFields}&key=${apiKey}&language=en`;
      const res = await fetch(legacyUrl);
      if (!res.ok) {
        console.error(`Legacy Places API HTTP error ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (data.status !== "OK" || !data.result) {
        console.error(`Legacy Places API error: ${data.status} — ${data.error_message || ""}`);
        return null;
      }

      // Normalize legacy response into same shape as New API for shared processing
      const r = data.result;
      p = {
        displayName: { text: r.name || "" },
        formattedAddress: r.formatted_address || "",
        addressComponents: (r.address_components || []).map((c: any) => ({
          longText: c.long_name,
          shortText: c.short_name,
          types: c.types,
        })),
        nationalPhoneNumber: r.formatted_phone_number || null,
        websiteUri: r.website || null,
        regularOpeningHours: r.opening_hours ? {
          weekdayDescriptions: r.opening_hours.weekday_text || [],
        } : null,
        rating: r.rating || 0,
        userRatingCount: r.user_ratings_total || 0,
        types: r.types || [],
        primaryType: null, // Not available in legacy
        location: r.geometry?.location ? {
          latitude: r.geometry.location.lat,
          longitude: r.geometry.location.lng,
        } : null,
        priceLevel: r.price_level != null ? (
          ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE",
           "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"][r.price_level] || null
        ) : null,
        editorialSummary: r.editorial_summary ? { text: r.editorial_summary.overview || "" } : null,
        reviews: (r.reviews || []).map((rev: any) => ({
          text: { text: rev.text || "" },
          rating: rev.rating,
          authorAttribution: { displayName: rev.author_name },
        })),
        generativeSummary: null, // Not available in legacy
        googleMapsUri: r.url || null,
        businessStatus: r.business_status || null,
        photos: (r.photos || []).map((ph: any) => ({
          name: ph.photo_reference || "",
          widthPx: ph.width || 0,
          heightPx: ph.height || 0,
        })),
      };
      console.log(`Auto-populate using legacy Places API for ${r.name}`);
    } catch (err) {
      console.error("Legacy Places API request failed:", err);
      return null;
    }
  }

  try {
    // Parse address components
    const components = p.addressComponents || [];
    let city = "", state = "", zip = "";
    for (const c of components) {
      if (c.types?.includes("locality")) city = c.longText || "";
      if (c.types?.includes("administrative_area_level_1")) state = c.shortText || "";
      if (c.types?.includes("postal_code")) zip = c.longText || "";
    }

    // Parse hours
    const businessHours = parseWeekdayText(p.regularOpeningHours?.weekdayDescriptions);

    // Map price level
    const priceLevelMap: Record<string, string> = {
      PRICE_LEVEL_FREE: "free",
      PRICE_LEVEL_INEXPENSIVE: "$",
      PRICE_LEVEL_MODERATE: "$$",
      PRICE_LEVEL_EXPENSIVE: "$$$",
      PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
    };
    const priceRange = p.priceLevel ? priceLevelMap[p.priceLevel] || null : null;
    const priceLevelNumeric: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    const priceLevelNum = p.priceLevel ? priceLevelNumeric[p.priceLevel] || null : null;

    const editorialSummary = p.editorialSummary?.text || null;
    const generativeSummary = p.generativeSummary?.text || null;

    // Extract review snippets (normalized for both APIs)
    const reviewSnippets = (p.reviews || [])
      .filter((r: any) => r.text?.text && r.text.text.length > 20)
      .map((r: any) => r.text.text as string)
      .slice(0, 10);

    // Service signals & amenities (only meaningful from New API, safe to call on legacy data)
    const serviceSignals = collectServiceSignals(p);
    const autoAmenities = mapGoogleFieldsToAmenities(p);

    // Extract photo references
    const photoReferences: GooglePhotoRef[] = (p.photos || []).slice(0, 10).map((photo: any) => ({
      name: photo.name || "",
      widthPx: photo.widthPx || 0,
      heightPx: photo.heightPx || 0,
    }));

    const placeName = p.displayName?.text || "";
    const types = p.types || [];

    // ── Hiking Enrichment: fetch NPS, OSM, RIDB data for hiking/parks listings ──
    let hikingEnrichment: PlaceDetailsData["hikingEnrichment"] = undefined;
    const isHikingType = options?.listingType === "hiking" || options?.listingType === "parks";

    if (isHikingType && !options?.skipHiking) {
      const trailName = options?.trailName || placeName;
      const trailLat = p.location?.latitude;
      const trailLng = p.location?.longitude;
      const parkCode = detectParkCode(city, state);
      const parkName = detectParkName(city, state);

      console.log(`Hiking enrichment: fetching NPS (${parkCode}), OSM, RIDB, BLM, USFS, Wikidata data for "${trailName}"`);

      // Run all API calls in parallel (NPS, OSM, RIDB, BLM, USFS, Wikidata)
      const [npsThingsResult, npsAlertsResult, osmResult, ridbResult, blmResult, usfsResult, wikidataResult] = await Promise.allSettled([
        fetchNpsThingsToDo(trailName, parkCode),
        fetchNpsAlerts(parkCode),
        trailLat && trailLng ? fetchTrailFromOverpass(trailName, trailLat, trailLng) : Promise.resolve(null),
        fetchPermitInfo(trailName, parkName),
        trailLat && trailLng ? fetchBlmTrailData(trailName, trailLat, trailLng) : Promise.resolve(null),
        trailLat && trailLng ? fetchUsfsTrailData(trailName, trailLat, trailLng) : Promise.resolve(null),
        trailLat && trailLng ? fetchWikidataTrailInfo(trailName, trailLat, trailLng) : Promise.resolve(null),
      ]);

      const npsThings = npsThingsResult.status === "fulfilled" ? npsThingsResult.value : null;
      const npsAlerts = npsAlertsResult.status === "fulfilled" ? npsAlertsResult.value : [];
      // Parse structured distance/elevation from NPS accessibilityInformation
      const npsSpecs = npsThings ? parseNpsTrailSpecs(npsThings) : null;
      const osmData = osmResult.status === "fulfilled" ? osmResult.value : null;
      const ridbData = ridbResult.status === "fulfilled" ? ridbResult.value : null;
      const blmData = blmResult.status === "fulfilled" ? blmResult.value : null;
      const usfsData = usfsResult.status === "fulfilled" ? usfsResult.value : null;
      const wikidataData = wikidataResult.status === "fulfilled" ? wikidataResult.value : null;

      // ── Second-stage calls (depend on first-stage results) ──
      // USGS elevation: depends on OSM polyline data
      // Wikipedia extract: depends on Wikidata Wikipedia URL
      const [usgsData, wikipediaExtract] = await Promise.all([
        (trailLat && trailLng)
          ? fetchElevationData(trailLat, trailLng, osmData?.polylineCoords ?? undefined)
              .catch(err => { console.error("USGS elevation fetch error (non-fatal):", err); return null; })
          : Promise.resolve(null),
        wikidataData?.wikipediaUrl
          ? fetchWikipediaExtract(wikidataData.wikipediaUrl)
              .catch(err => { console.error("Wikipedia extract error (non-fatal):", err); return null; })
          : Promise.resolve(null),
      ]);

      const dataSources: string[] = [];
      if (npsThings) dataSources.push("NPS");
      if (osmData) dataSources.push("OSM");
      if (ridbData) dataSources.push("RIDB");
      if (blmData) dataSources.push("BLM");
      if (usfsData) dataSources.push("USFS");
      if (usgsData) dataSources.push("USGS");
      if (wikidataData) dataSources.push("Wikidata");
      if (wikipediaExtract) dataSources.push("Wikipedia");

      console.log(`Hiking enrichment sources: ${dataSources.length > 0 ? dataSources.join(", ") : "none"}`);

      if (dataSources.length > 0 || npsAlerts.length > 0) {
        // ── Resolved trickle-down fields (best available source wins) ──
        // Official sources first, calculated/community sources last.

        // Distance priority: NPS (parsed) → USFS → BLM → Wikidata → OSM (geometry)
        // NPS one-way distances are doubled to match round-trip convention
        const npsDistanceMiles = npsSpecs?.distanceMiles
          ? (npsSpecs.distanceType === "one-way" ? npsSpecs.distanceMiles * 2 : npsSpecs.distanceMiles)
          : undefined;
        const resolvedDistance = npsDistanceMiles ?? usfsData?.distanceMiles ?? blmData?.distanceMiles ?? wikidataData?.distanceMiles ?? osmData?.distanceMiles ?? undefined;
        const distanceSource = npsDistanceMiles ? "NPS" : usfsData?.distanceMiles ? "USFS" : blmData?.distanceMiles ? "BLM" : wikidataData?.distanceMiles ? "Wikidata" : osmData?.distanceMiles ? "OSM" : "none";
        console.log(`Trickle-down distance: ${resolvedDistance ?? "N/A"} mi (source: ${distanceSource}) | NPS=${npsDistanceMiles ?? "N/A"} (${npsSpecs?.distanceType ?? "N/A"}), OSM=${osmData?.distanceMiles ?? "N/A"}`);
        // Difficulty priority: OSM → USFS (trail_class)
        const resolvedDifficulty = osmData?.difficulty ?? usfsData?.difficulty ?? undefined;
        // Surface priority: OSM → BLM → USFS
        const resolvedSurface = osmData?.surface ?? blmData?.surface ?? usfsData?.surface ?? undefined;
        // Trail type priority: OSM
        const resolvedTrailType = osmData?.trailType ?? undefined;
        // Estimated time: NPS
        const resolvedEstimatedTime = npsThings?.duration || undefined;
        // Elevation gain priority: NPS (parsed) → USGS (calculated) → OSM (ele tags)
        const resolvedElevationGain = npsSpecs?.elevationGainFt ?? usgsData?.estimatedGainFt ?? osmData?.elevationGainFt ?? undefined;
        const elevSource = npsSpecs?.elevationGainFt ? "NPS" : usgsData?.estimatedGainFt ? "USGS" : osmData?.elevationGainFt ? "OSM" : "none";
        console.log(`Trickle-down elevation gain: ${resolvedElevationGain ?? "N/A"} ft (source: ${elevSource})`);
        // Season priority: NPS → USFS (parsed)
        const npsSeasonStart = npsThings?.season && npsThings.season.length > 0 ? npsThings.season[0] : undefined;
        const npsSeasonEnd = npsThings?.season && npsThings.season.length > 1 ? npsThings.season[npsThings.season.length - 1] : undefined;
        const resolvedSeasonStart = npsSeasonStart ?? usfsData?.seasonStart ?? undefined;
        const resolvedSeasonEnd = npsSeasonEnd ?? usfsData?.seasonEnd ?? undefined;
        // Dogs priority: NPS → OSM (dog tag)
        const resolvedDogsAllowed = npsThings?.arePetsPermitted
          ? npsThings.arePetsPermitted.toLowerCase() !== "false" && npsThings.arePetsPermitted.toLowerCase() !== "no"
          : osmData?.dogPolicy
            ? osmData.dogPolicy === "yes" || osmData.dogPolicy === "leashed"
            : undefined;
        // Water priority: OSM (drinking_water)
        const resolvedWaterAvailable = osmData?.drinkingWater
          ? osmData.drinkingWater === "yes"
          : undefined;

        hikingEnrichment = {
          // ── Resolved trickle-down fields ──
          distanceMiles: resolvedDistance,
          difficulty: resolvedDifficulty,
          surface: resolvedSurface,
          surfaceType: resolvedSurface,
          trailType: resolvedTrailType,
          estimatedTime: resolvedEstimatedTime,
          elevationGainFt: resolvedElevationGain,
          seasonStart: resolvedSeasonStart,
          seasonEnd: resolvedSeasonEnd,
          dogsAllowed: resolvedDogsAllowed,
          waterAvailable: resolvedWaterAvailable,

          // ── Source-specific fields (for AI content + special handling) ──
          osmDistanceMiles: osmData?.distanceMiles,
          osmDifficulty: osmData?.difficulty ?? undefined,
          osmSurface: osmData?.surface ?? undefined,
          osmTrailType: osmData?.trailType ?? undefined,
          osmDogPolicy: osmData?.dogPolicy ?? undefined,
          osmDrinkingWater: osmData?.drinkingWater ?? undefined,
          osmWheelchair: osmData?.wheelchair ?? undefined,
          osmAccess: osmData?.access ?? undefined,
          osmElevationGainFt: osmData?.elevationGainFt ?? undefined,
          npsDescription: npsThings?.longDescription || npsThings?.shortDescription,
          npsDuration: npsThings?.duration || undefined,
          npsSeason: npsThings?.season,
          npsPetsPermitted: npsThings?.arePetsPermitted || undefined,
          npsFeesApply: npsThings?.doFeesApply,
          npsAccessibility: npsThings?.accessibilityInformation || undefined,
          npsDistanceMiles: npsDistanceMiles,
          npsElevationGainFt: npsSpecs?.elevationGainFt ?? undefined,
          permitRequired: ridbData?.permitRequired,
          permitInfo: ridbData?.permitDescription,
          permitFee: ridbData?.fee ?? undefined,
          npsAlerts: npsAlerts.length > 0 ? npsAlerts : undefined,

          // ── BLM-specific fields ──
          blmDistanceMiles: blmData?.distanceMiles ?? undefined,
          blmSurface: blmData?.surface ?? undefined,
          blmTransportMode: blmData?.transportMode ?? undefined,
          blmSeasonRestriction: blmData?.seasonRestriction ?? undefined,

          // ── USFS-specific fields ──
          usfsDistanceMiles: usfsData?.distanceMiles ?? undefined,
          usfsDifficulty: usfsData?.difficulty ?? undefined,
          usfsSurface: usfsData?.surface ?? undefined,
          usfsTrailClass: usfsData?.trailClass ?? undefined,
          usfsTypicalGrade: usfsData?.typicalGrade ?? undefined,
          usfsAccessibility: usfsData?.accessibilityStatus ?? undefined,
          usfsDesignation: usfsData?.nationalTrailDesignation ?? undefined,
          usfsSeasonStart: usfsData?.seasonStart ?? undefined,
          usfsSeasonEnd: usfsData?.seasonEnd ?? undefined,

          // ── USGS-specific fields ──
          usgsTrailheadElevationFt: usgsData?.trailheadElevationFt ?? undefined,
          usgsEstimatedGainFt: usgsData?.estimatedGainFt ?? undefined,
          usgsPeakElevationFt: usgsData?.peakElevationFt ?? undefined,
          usgsSamplePoints: usgsData?.samplePoints ?? undefined,

          // ── Wikidata-specific fields ──
          wikidataDescription: wikidataData?.description ?? undefined,
          wikidataDistanceMiles: wikidataData?.distanceMiles ?? undefined,
          wikidataElevationMeters: wikidataData?.elevationMeters ?? undefined,
          wikidataManagingAgency: wikidataData?.managingAgency ?? undefined,
          wikidataWikipediaUrl: wikidataData?.wikipediaUrl ?? undefined,
          wikidataImageUrl: wikidataData?.wikimediaImageUrl ?? undefined,
          wikidataId: wikidataData?.wikidataId ?? undefined,
          wikipediaExtract: wikipediaExtract ?? undefined,

          dataSources,
        };

        // ── AI Attribute Inference: fill gaps using Google reviews ──
        // This runs AFTER the structured APIs so we know which fields are still missing.
        // Uses a fast/cheap model (Haiku) for structured data extraction.
        if (!options?.skipAI && reviewSnippets.length > 0) {
          try {
            const aiAttrs = await inferTrailAttributes({
              trailName,
              city,
              state: state || "UT",
              reviewSnippets,
              editorialSummary,
              generativeSummary,
              knownDistance: hikingEnrichment.distanceMiles ?? null,
              knownDifficulty: hikingEnrichment.difficulty ?? null,
              knownSurface: hikingEnrichment.surface ?? null,
              knownTrailType: hikingEnrichment.trailType ?? null,
              knownEstimatedTime: hikingEnrichment.estimatedTime ?? null,
              knownSeason: npsThings?.season ?? null,
              knownPetsPermitted: npsThings?.arePetsPermitted || null,
              knownPermitRequired: ridbData?.permitRequired ?? null,
              knownElevationGain: hikingEnrichment.elevationGainFt ?? null,
            });

            if (aiAttrs) {
              hikingEnrichment.aiInferred = aiAttrs;
              dataSources.push("AI");

              // Merge AI-inferred values into trickle-down fields (lowest priority)
              // API data always wins; AI fills gaps only
              if (!hikingEnrichment.difficulty && aiAttrs.difficulty) {
                hikingEnrichment.difficulty = aiAttrs.difficulty;
              }
              if (!hikingEnrichment.estimatedTime && aiAttrs.estimatedTime) {
                hikingEnrichment.estimatedTime = aiAttrs.estimatedTime;
              }
              if (!hikingEnrichment.trailType && aiAttrs.trailType) {
                hikingEnrichment.trailType = aiAttrs.trailType;
              }
              if (!hikingEnrichment.elevationGainFt && aiAttrs.elevationGainFt) {
                hikingEnrichment.elevationGainFt = aiAttrs.elevationGainFt;
              }
              if (hikingEnrichment.seasonStart === undefined && aiAttrs.seasonStart) {
                hikingEnrichment.seasonStart = aiAttrs.seasonStart;
              }
              if (hikingEnrichment.seasonEnd === undefined && aiAttrs.seasonEnd) {
                hikingEnrichment.seasonEnd = aiAttrs.seasonEnd;
              }
              if (hikingEnrichment.dogsAllowed === undefined && aiAttrs.dogsAllowed !== undefined) {
                hikingEnrichment.dogsAllowed = aiAttrs.dogsAllowed;
              }
              if (hikingEnrichment.waterAvailable === undefined && aiAttrs.waterAvailable !== undefined) {
                hikingEnrichment.waterAvailable = aiAttrs.waterAvailable;
              }
            }
          } catch (err) {
            console.error("AI trail inference error (non-fatal):", err);
          }
        }
      }
    }

    // Try AI-powered content generation first, fall back to templates
    let description: string | null = null;
    let tagline: string | null = editorialSummary;
    let aiPriceEstimate: string | null = null;

    if (!options?.skipAI && !options?.skipContent) {
      try {
        // Use hiking-specific AI for hiking/parks listings with enrichment data
        if (isHikingType && hikingEnrichment) {
          const hikingResult = await generateHikingContent({
            name: placeName,
            types,
            city,
            state: state || "UT",
            editorialSummary,
            reviewSnippets,
            rating: p.rating || 0,
            reviewCount: p.userRatingCount || 0,
            generativeSummary,
            serviceSignals,
            // NPS data
            npsDescription: hikingEnrichment.npsDescription,
            npsDuration: hikingEnrichment.npsDuration,
            npsSeason: hikingEnrichment.npsSeason,
            npsAlerts: hikingEnrichment.npsAlerts,
            npsPetsPermitted: hikingEnrichment.npsPetsPermitted,
            npsFeesApply: hikingEnrichment.npsFeesApply,
            npsAccessibility: hikingEnrichment.npsAccessibility,
            // OSM data
            osmDistanceMiles: hikingEnrichment.osmDistanceMiles,
            osmDifficulty: hikingEnrichment.osmDifficulty,
            osmSurface: hikingEnrichment.osmSurface,
            osmTrailType: hikingEnrichment.osmTrailType,
            // RIDB data
            permitRequired: hikingEnrichment.permitRequired,
            permitDescription: hikingEnrichment.permitInfo,
            permitFee: hikingEnrichment.permitFee,
            // BLM data (available when OSM/NPS don't cover the trail)
            blmDistanceMiles: hikingEnrichment.blmDistanceMiles,
            blmSurface: hikingEnrichment.blmSurface,
            blmTransportMode: hikingEnrichment.blmTransportMode,
            // USFS data
            usfsTrailClass: hikingEnrichment.usfsTrailClass,
            usfsTypicalGrade: hikingEnrichment.usfsTypicalGrade,
            usfsAccessibility: hikingEnrichment.usfsAccessibility,
            usfsDesignation: hikingEnrichment.usfsDesignation,
            // USGS data
            usgsElevationGainFt: hikingEnrichment.usgsEstimatedGainFt,
            usgsTrailheadElevationFt: hikingEnrichment.usgsTrailheadElevationFt,
            // Wikidata + Wikipedia data
            wikidataDescription: hikingEnrichment.wikidataDescription,
            wikidataManagingAgency: hikingEnrichment.wikidataManagingAgency,
            wikipediaExtract: hikingEnrichment.wikipediaExtract,
            // Enhanced OSM data
            osmDogPolicy: hikingEnrichment.osmDogPolicy,
            osmDrinkingWater: hikingEnrichment.osmDrinkingWater,
            osmAccess: hikingEnrichment.osmAccess,
          });
          if (hikingResult) {
            description = hikingResult.description;
            tagline = hikingResult.tagline;
            aiPriceEstimate = hikingResult.suggestedPriceRange;
          }
        }

        // Fall back to standard AI for non-hiking or if hiking AI failed
        if (!description) {
          const aiResult = await generateListingContent({
            name: placeName,
            types,
            city,
            state: state || "UT",
            editorialSummary,
            reviewSnippets,
            priceLevel: priceLevelNum,
            rating: p.rating || 0,
            reviewCount: p.userRatingCount || 0,
            serviceSignals,
            generativeSummary,
          });
          if (aiResult) {
            description = aiResult.description;
            tagline = aiResult.tagline;
            aiPriceEstimate = aiResult.suggestedPriceRange;
          }
        }
      } catch (err) {
        console.error("AI generation failed, falling back to templates:", err);
      }

      if (!description) {
        description = generateDescription({
          name: placeName,
          type: types,
          city,
          editorialSummary,
          reviewSnippets,
          priceLevel: priceLevelNum,
          rating: p.rating || 0,
          reviewCount: p.userRatingCount || 0,
        });
      }

      if (!tagline) {
        tagline = generateTagline({
          name: placeName,
          type: types,
          city,
          editorialSummary,
          rating: p.rating || 0,
          reviewCount: p.userRatingCount || 0,
        });
      }
    }

    return {
      name: placeName,
      phone: p.nationalPhoneNumber || null,
      website: p.websiteUri || null,
      address: p.formattedAddress?.replace(/, United States$/, "").replace(/, USA$/, "") || null,
      city: city || null,
      state: state || "UT",
      zip: zip || null,
      lat: p.location?.latitude || null,
      lng: p.location?.longitude || null,
      priceRange: priceRange || aiPriceEstimate,
      priceRangeSource: priceRange ? "google" : aiPriceEstimate ? "ai_estimate" : null,
      rating: p.rating || 0,
      reviewCount: p.userRatingCount || 0,
      tagline,
      description,
      businessHours,
      types,
      editorialSummary,
      reviewSnippets,
      suggestedCategorySlug: mapGoogleTypesToCategorySlug(types),
      googleMapsUri: p.googleMapsUri || null,
      googlePrimaryType: p.primaryType || null,
      generativeSummary,
      autoAmenities,
      photoReferences,
      serviceSignals,
      apiSource: usedNewApi ? "new" : "legacy",
      ...(newApiError ? { newApiError } : {}),
      ...(hikingEnrichment ? { hikingEnrichment } : {}),
    };
  } catch (error) {
    console.error("Failed to fetch Place Details:", error);
    return null;
  }
}

// ── Standalone AI Content Generation ──

/**
 * Generate AI content (description + tagline) independently of data fetching.
 * Used in the two-stage workflow: Stage 1 fetches data, user reviews/corrects,
 * then Stage 2 calls this to generate content using the verified data.
 *
 * Accepts a Google Place ID to fetch review context, plus the hikingEnrichment
 * data that was cached from Stage 1 (with any user corrections applied).
 */
export async function generateContentOnly(input: {
  placeId: string;
  listingName: string;
  listingType: string;
  city?: string;
  state?: string;
  hikingEnrichment?: any;
  // Optional form field overrides (user-corrected values)
  distanceMiles?: number | null;
  elevationGainFt?: number | null;
  difficulty?: string | null;
  estimatedTime?: string | null;
  trailType?: string | null;
  seasonStart?: string | null;
  seasonEnd?: string | null;
  dogsAllowed?: boolean;
  waterAvailable?: boolean;
  permitRequired?: boolean;
  surfaceType?: string | null;
}): Promise<{
  description: string | null;
  tagline: string | null;
  priceRange: string | null;
  priceRangeSource: string | null;
} | null> {
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return null;

  try {
    // Fetch fresh Google review data for AI context
    let p: any = null;
    try {
      const fieldMask = [
        "displayName", "formattedAddress", "addressComponents",
        "rating", "userRatingCount", "types", "primaryType",
        "editorialSummary", "reviews", "generativeSummary",
        "priceLevel",
      ].join(",");

      const res = await fetch(`https://places.googleapis.com/v1/places/${input.placeId}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
      });

      if (res.ok) {
        p = await res.json();
      }
    } catch (err) {
      console.error("Failed to fetch Google data for content generation:", err);
    }

    // Fall back to legacy API if needed
    if (!p) {
      try {
        const legacyUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${input.placeId}&fields=name,editorial_summary,reviews,types,rating,user_ratings_total,price_level,address_components&key=${apiKey}`;
        const res = await fetch(legacyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "OK") p = data.result;
        }
      } catch (err) {
        console.error("Legacy API also failed:", err);
      }
    }

    if (!p) return null;

    const placeName = input.listingName || p.displayName?.text || p.name || "";
    const types = p.types || [];
    const city = input.city || "";
    const state = input.state || "UT";
    const editorialSummary = p.editorialSummary?.text || p.editorial_summary?.overview || null;
    const generativeSummary = p.generativeSummary?.overview?.text || null;
    const serviceSignals = collectServiceSignals(p);

    // Extract review snippets
    const reviews = p.reviews || [];
    const reviewSnippets = reviews
      .filter((r: any) => (r.text?.text || r.text || "").length > 30)
      .slice(0, 10)
      .map((r: any) => r.text?.text || r.text || "");

    const isHikingType = input.listingType === "hiking" || input.listingType === "parks";
    const h = input.hikingEnrichment;

    let description: string | null = null;
    let tagline: string | null = editorialSummary;
    let aiPriceEstimate: string | null = null;

    // Apply user-corrected form field values over the enrichment data
    const enrichWithOverrides = h ? {
      ...h,
      distanceMiles: input.distanceMiles ?? h.distanceMiles,
      elevationGainFt: input.elevationGainFt ?? h.elevationGainFt,
      difficulty: input.difficulty ?? h.difficulty,
      estimatedTime: input.estimatedTime ?? h.estimatedTime,
      trailType: input.trailType ?? h.trailType,
      seasonStart: input.seasonStart ?? h.seasonStart,
      seasonEnd: input.seasonEnd ?? h.seasonEnd,
      dogsAllowed: input.dogsAllowed !== undefined ? input.dogsAllowed : h.dogsAllowed,
      waterAvailable: input.waterAvailable !== undefined ? input.waterAvailable : h.waterAvailable,
      surfaceType: input.surfaceType ?? h.surfaceType,
    } : null;

    try {
      if (isHikingType && enrichWithOverrides) {
        const hikingResult = await generateHikingContent({
          name: placeName,
          types,
          city,
          state,
          editorialSummary,
          reviewSnippets,
          rating: p.rating || p.userRatingCount ? p.rating : 0,
          reviewCount: p.userRatingCount || p.user_ratings_total || 0,
          generativeSummary,
          serviceSignals,
          npsDescription: enrichWithOverrides.npsDescription,
          npsDuration: enrichWithOverrides.npsDuration,
          npsSeason: enrichWithOverrides.npsSeason,
          npsAlerts: enrichWithOverrides.npsAlerts,
          npsPetsPermitted: enrichWithOverrides.npsPetsPermitted,
          npsFeesApply: enrichWithOverrides.npsFeesApply,
          npsAccessibility: enrichWithOverrides.npsAccessibility,
          osmDistanceMiles: enrichWithOverrides.osmDistanceMiles,
          osmDifficulty: enrichWithOverrides.osmDifficulty,
          osmSurface: enrichWithOverrides.osmSurface,
          osmTrailType: enrichWithOverrides.osmTrailType,
          permitRequired: enrichWithOverrides.permitRequired,
          permitDescription: enrichWithOverrides.permitInfo,
          permitFee: enrichWithOverrides.permitFee,
          blmDistanceMiles: enrichWithOverrides.blmDistanceMiles,
          blmSurface: enrichWithOverrides.blmSurface,
          blmTransportMode: enrichWithOverrides.blmTransportMode,
          usfsTrailClass: enrichWithOverrides.usfsTrailClass,
          usfsTypicalGrade: enrichWithOverrides.usfsTypicalGrade,
          usfsAccessibility: enrichWithOverrides.usfsAccessibility,
          usfsDesignation: enrichWithOverrides.usfsDesignation,
          usgsElevationGainFt: enrichWithOverrides.usgsEstimatedGainFt,
          usgsTrailheadElevationFt: enrichWithOverrides.usgsTrailheadElevationFt,
          wikidataDescription: enrichWithOverrides.wikidataDescription,
          wikidataManagingAgency: enrichWithOverrides.wikidataManagingAgency,
          wikipediaExtract: enrichWithOverrides.wikipediaExtract,
          osmDogPolicy: enrichWithOverrides.osmDogPolicy,
          osmDrinkingWater: enrichWithOverrides.osmDrinkingWater,
          osmAccess: enrichWithOverrides.osmAccess,
        });
        if (hikingResult) {
          description = hikingResult.description;
          tagline = hikingResult.tagline;
          aiPriceEstimate = hikingResult.suggestedPriceRange;
        }
      }

      // Fall back to standard AI for non-hiking or if hiking AI failed
      if (!description) {
        const priceLevelNum = p.priceLevel
          ? typeof p.priceLevel === "number" ? p.priceLevel : ({ PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 }[p.priceLevel as string] ?? null)
          : p.price_level ?? null;

        const aiResult = await generateListingContent({
          name: placeName,
          types,
          city,
          state,
          editorialSummary,
          reviewSnippets,
          priceLevel: priceLevelNum,
          rating: p.rating || 0,
          reviewCount: p.userRatingCount || p.user_ratings_total || 0,
          serviceSignals,
          generativeSummary,
        });
        if (aiResult) {
          description = aiResult.description;
          tagline = aiResult.tagline;
          aiPriceEstimate = aiResult.suggestedPriceRange;
        }
      }
    } catch (err) {
      console.error("AI content generation failed:", err);
    }

    // Template fallback
    if (!description) {
      description = generateDescription({
        name: placeName,
        type: types,
        city,
        editorialSummary,
        reviewSnippets,
        priceLevel: null,
        rating: p.rating || 0,
        reviewCount: p.userRatingCount || p.user_ratings_total || 0,
      });
    }
    if (!tagline) {
      tagline = generateTagline({
        name: placeName,
        type: types,
        city,
        editorialSummary,
        rating: p.rating || 0,
        reviewCount: p.userRatingCount || p.user_ratings_total || 0,
      });
    }

    return {
      description,
      tagline,
      priceRange: aiPriceEstimate,
      priceRangeSource: aiPriceEstimate ? "ai_estimate" : null,
    };
  } catch (error) {
    console.error("Content generation failed:", error);
    return null;
  }
}

// ── Hiking Enrichment Helpers ──

/**
 * Map a listing's city/state to a NPS park code.
 * Used to query the NPS API for the correct park.
 */
function detectParkCode(city: string | null, state: string | null): string {
  const c = (city || "").toLowerCase().trim();

  // Primary park area (gateway + nearby towns from siteConfig)
  const primaryTowns = [...siteConfig.gatewayTowns, ...siteConfig.nearbyTowns].map((t) => t.toLowerCase());
  if (primaryTowns.includes(c)) return siteConfig.parkCode.toLowerCase();

  // Bryce Canyon area
  if (["tropic", "cannonville", "bryce", "bryce canyon", "panguitch", "hatch"].includes(c)) return "brca";

  // Capitol Reef area
  if (["torrey", "boulder", "teasdale", "bicknell", "grover"].includes(c)) return "care";

  // Arches / Canyonlands area
  if (["moab"].includes(c)) return "arch"; // could also be "cany" but Arches is more common

  // Grand Canyon North Rim
  if (["marble canyon", "north rim", "fredonia"].includes(c)) return "grca";

  // Cedar Breaks
  if (["brian head"].includes(c)) return "cebr";

  // Default to the configured park for the configured state
  if (state?.toUpperCase() === siteConfig.stateAbbrev) return siteConfig.parkCode.toLowerCase();

  return siteConfig.parkCode.toLowerCase();
}

/**
 * Map a listing's city/state to a park name for RIDB queries.
 */
function detectParkName(city: string | null, state: string | null): string {
  const parkCode = detectParkCode(city, state);
  const parkNames: Record<string, string> = {
    [siteConfig.parkCode.toLowerCase()]: siteConfig.parkName,
    brca: "Bryce Canyon National Park",
    care: "Capitol Reef National Park",
    arch: "Arches National Park",
    cany: "Canyonlands National Park",
    grca: "Grand Canyon National Park",
    cebr: "Cedar Breaks National Monument",
  };
  return parkNames[parkCode] || siteConfig.parkName;
}

/**
 * Parse Google's weekday_text array into structured hours.
 */
function parseWeekdayText(
  weekdayText?: string[]
): { day: string; open_time: string | null; close_time: string | null; is_closed: boolean }[] {
  if (!weekdayText || weekdayText.length === 0) return [];

  const dayMap: Record<string, string> = {
    Monday: "monday", Tuesday: "tuesday", Wednesday: "wednesday",
    Thursday: "thursday", Friday: "friday", Saturday: "saturday", Sunday: "sunday",
  };

  return weekdayText.map((line) => {
    const [dayPart, ...timeParts] = line.split(": ");
    const day = dayMap[dayPart.trim()] || dayPart.trim().toLowerCase();
    const timeStr = timeParts.join(": ").trim();

    if (timeStr === "Closed" || timeStr === "closed") {
      return { day, open_time: null, close_time: null, is_closed: true };
    }
    if (timeStr.includes("Open 24 hours")) {
      return { day, open_time: "00:00", close_time: "23:59", is_closed: false };
    }

    // Parse "8:00 AM – 9:00 PM"
    const match = timeStr.match(
      /(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–\-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
    );
    if (match) {
      const openH = convertTo24(parseInt(match[1]), match[3].toUpperCase());
      const openM = match[2];
      const closeH = convertTo24(parseInt(match[4]), match[6].toUpperCase());
      const closeM = match[5];
      return {
        day,
        open_time: `${openH}:${openM}`,
        close_time: `${closeH}:${closeM}`,
        is_closed: false,
      };
    }

    return { day, open_time: null, close_time: null, is_closed: false };
  });
}

function convertTo24(hour: number, period: string): string {
  let h = hour;
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h.toString().padStart(2, "0");
}

/**
 * Fetch ONLY business hours from Google Places API for a given Place ID.
 * This is a lightweight call used by the monthly cron refresh — no reviews, no AI.
 */
export async function fetchBusinessHoursFromGoogle(
  placeId: string
): Promise<{ day: string; open_time: string | null; close_time: string | null; is_closed: boolean }[] | null> {
  const settings = await getSettings();
  const apiKey = settings.google_places_api_key || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.result;
    if (!p) return null;

    return parseWeekdayText(p.opening_hours?.weekday_text);
  } catch (err) {
    console.error(`Failed to fetch hours for ${placeId}:`, err);
    return null;
  }
}

/**
 * Generate a 3rd-person description from Google Places data.
 * Targets 150-230 words across 5 paragraphs for SEO quality.
 */
/**
 * Generate a template-based tagline for a listing.
 * Used as fallback when AI content generation is not available.
 * Taglines should be concise (under 160 characters) and capture the business essence.
 */
function generateTagline(input: {
  name: string;
  type: string[];
  city: string;
  editorialSummary: string | null;
  rating: number;
  reviewCount: number;
}): string {
  const { name, type, city, editorialSummary, rating, reviewCount } = input;

  // If we have an editorial summary, use it directly — it's already a concise description
  if (editorialSummary) {
    // Trim to ~155 chars if it's too long
    if (editorialSummary.length <= 155) return editorialSummary;
    return editorialSummary.slice(0, 152).replace(/\s+\S*$/, "") + "...";
  }

  const isRestaurant = type.some(t => ["restaurant", "food", "meal_delivery", "meal_takeaway", "cafe", "bakery", "bar"].includes(t));
  const isLodging = type.some(t => ["lodging", "hotel", "campground", "rv_park"].includes(t));
  const isTourism = type.some(t => ["travel_agency", "tourist_attraction", "point_of_interest"].includes(t));
  const isTransport = type.some(t => ["car_rental", "transit_station", "bus_station"].includes(t));

  const locationPhrase = city ? `in ${city}` : `near ${siteConfig.parkName}`;
  const ratingPhrase = rating >= 4.5 && reviewCount > 50
    ? "highly rated "
    : rating >= 4.0 && reviewCount > 20
    ? "well-reviewed "
    : "";

  if (isRestaurant) {
    return `${name} is a ${ratingPhrase}dining destination ${locationPhrase}, serving visitors exploring ${siteConfig.parkName}.`;
  }
  if (isLodging) {
    return `${name} offers ${ratingPhrase}accommodations ${locationPhrase}, providing a comfortable base for ${siteConfig.parkName} adventures.`;
  }
  if (isTourism) {
    return `${name} provides ${ratingPhrase}outdoor experiences ${locationPhrase} for visitors exploring the ${siteConfig.parkName} area.`;
  }
  if (isTransport) {
    return `${name} offers ${ratingPhrase}transportation services ${locationPhrase} for ${siteConfig.parkName} visitors.`;
  }

  return `${name} is a ${ratingPhrase}local favorite ${locationPhrase}, serving visitors to the ${siteConfig.parkName} area.`;
}

function generateDescription(input: {
  name: string;
  type: string[];
  city: string;
  editorialSummary: string | null;
  reviewSnippets: string[];
  priceLevel: number | null;
  rating: number;
  reviewCount: number;
}): string {
  const { name, type, city, editorialSummary, reviewSnippets, priceLevel, rating, reviewCount } = input;

  // Determine business category for description framing
  const isRestaurant = type.some(t => ["restaurant", "food", "meal_delivery", "meal_takeaway", "cafe", "bakery", "bar"].includes(t));
  const isLodging = type.some(t => ["lodging", "hotel", "campground", "rv_park"].includes(t));
  const isTourism = type.some(t => ["travel_agency", "tourist_attraction", "point_of_interest"].includes(t));
  const isTransport = type.some(t => ["car_rental", "transit_station", "bus_station"].includes(t));

  const locationPhrase = city ? `in ${city}` : `near ${siteConfig.parkName}`;
  const paragraphs: string[] = [];

  // ── P1: Opening (2 sentences) ──
  if (editorialSummary) {
    const rewritten = rewriteToThirdPerson(editorialSummary, name);
    const followUp = getEditorialFollowUp(name, locationPhrase, isRestaurant, isLodging, isTourism, isTransport);
    paragraphs.push(`${rewritten} ${followUp}`);
  } else if (isRestaurant) {
    paragraphs.push(
      `${name} is a popular dining destination ${locationPhrase}, serving visitors and locals exploring the ${siteConfig.parkName} area. Whether fueling up before a day on the trails or winding down after a canyon adventure, ${name} provides a welcome spot to relax and enjoy a satisfying meal.`
    );
  } else if (isLodging) {
    paragraphs.push(
      `${name} offers comfortable accommodations ${locationPhrase}, providing a convenient base for exploring ${siteConfig.parkName} and the surrounding landscape. With the park's iconic terrain just minutes away, guests can settle in and enjoy easy access to some of the region's most spectacular scenery.`
    );
  } else if (isTourism) {
    paragraphs.push(
      `${name} provides memorable outdoor experiences ${locationPhrase}, helping visitors make the most of the stunning natural beauty surrounding ${siteConfig.parkName}. The area offers a dramatic backdrop that makes every outing unforgettable.`
    );
  } else if (isTransport) {
    paragraphs.push(
      `${name} offers transportation services ${locationPhrase}, making it easy for visitors to get around and access ${siteConfig.parkName} and nearby destinations. Navigating ${siteConfig.aiLocale} is part of the adventure, and reliable transport helps visitors focus on the scenery rather than the logistics.`
    );
  } else {
    paragraphs.push(
      `${name} is a well-regarded business ${locationPhrase}, serving visitors exploring the ${siteConfig.parkName} region. Located in ${siteConfig.aiLocale}, ${name} is well-positioned to help travelers make the most of their time near the park.`
    );
  }

  // ── P2: Review themes + concrete detail ──
  if (reviewSnippets.length >= 2) {
    const themes = extractReviewThemes(reviewSnippets, name, isRestaurant, isLodging);
    const detail = extractReviewDetail(reviewSnippets, name, isRestaurant, isLodging);
    if (themes) {
      paragraphs.push(detail ? `${themes} ${detail}` : themes);
    }
  }

  // ── P3: Practical details (price/rating) ──
  const details: string[] = [];
  if (priceLevel) {
    const priceDesc = ["", "budget-friendly", "moderately priced", "upscale", "premium"][priceLevel] || "";
    if (priceDesc) details.push(priceDesc);
  }
  if (rating >= 4.5 && reviewCount > 100) {
    details.push(`highly rated with ${rating} stars across ${reviewCount.toLocaleString()} Google reviews`);
  } else if (rating >= 4.0 && reviewCount > 50) {
    details.push(`well-reviewed with a ${rating}-star rating on Google`);
  }

  if (details.length > 0) {
    const detailStr = details.join(" and ");
    if (isRestaurant) {
      paragraphs.push(
        `Known for being ${detailStr}, ${name} is a worthwhile stop for anyone visiting the ${siteConfig.parkName} area.`
      );
    } else if (isLodging) {
      paragraphs.push(
        `With ${detailStr} credentials, ${name} is a solid choice for travelers looking to stay near ${siteConfig.parkName}.`
      );
    } else {
      paragraphs.push(
        `Recognized as ${detailStr}, ${name} is a trusted choice for visitors to the ${siteConfig.parkName} region.`
      );
    }
  }

  // ── P4: Location context ──
  paragraphs.push(generateLocationContext(city, name));

  // ── P5: What visitors can expect ──
  paragraphs.push(generateVisitorExpectation(name, isRestaurant, isLodging, isTourism, isTransport, priceLevel));

  return paragraphs.join("\n\n");
}

/**
 * Follow-up sentence after an editorial summary rewrite.
 */
function getEditorialFollowUp(
  name: string,
  locationPhrase: string,
  isRestaurant: boolean,
  isLodging: boolean,
  isTourism: boolean,
  isTransport: boolean
): string {
  if (isRestaurant) return `Situated ${locationPhrase}, it has become a go-to stop for park visitors looking for a satisfying meal after a day of exploring.`;
  if (isLodging) return `Situated ${locationPhrase}, it serves as a comfortable home base for travelers exploring the canyons and trails nearby.`;
  if (isTourism) return `Situated ${locationPhrase}, it helps visitors discover the area's most remarkable landscapes and outdoor activities.`;
  if (isTransport) return `Situated ${locationPhrase}, it helps travelers navigate the scenic corridors of ${siteConfig.aiLocale} with ease.`;
  return `Situated ${locationPhrase}, it is a valued resource for those visiting the ${siteConfig.parkName} area.`;
}

/**
 * Generate a location context paragraph based on the city.
 */
function generateLocationContext(city: string, _name: string): string {
  if (city && siteConfig.cityDescriptions[city]) {
    return siteConfig.cityDescriptions[city];
  }

  return siteConfig.cityDescriptionFallback;
}

/**
 * Generate a closing "what visitors can expect" paragraph by business type.
 */
function generateVisitorExpectation(
  name: string,
  isRestaurant: boolean,
  isLodging: boolean,
  isTourism: boolean,
  isTransport: boolean,
  priceLevel: number | null
): string {
  if (isRestaurant) {
    const priceTip = priceLevel && priceLevel <= 2
      ? "Pricing is approachable, making it a practical choice for families and groups."
      : priceLevel && priceLevel >= 3
      ? "The menu reflects a more upscale dining experience, suited for a special evening out."
      : "";
    return `Visitors to ${name} can expect a dining experience shaped by the flavors and hospitality of the ${siteConfig.parkName} area. ${priceTip} It is a good idea to check hours seasonally, as many local restaurants adjust their schedules during the quieter winter months.`.replace(/  /g, " ").trim();
  }
  if (isLodging) {
    return `Guests checking in to ${name} can expect accommodations geared toward travelers seeking both comfort and easy park access. Booking ahead is recommended, especially during peak season from March through October when ${siteConfig.parkName} sees its highest visitor numbers.`;
  }
  if (isTourism) {
    return `Those booking with ${name} can expect a guided or self-directed adventure tailored to the unique terrain around ${siteConfig.parkName}. Many experiences are seasonal, so visitors are encouraged to confirm availability and any gear or fitness requirements in advance.`;
  }
  if (isTransport) {
    return `Travelers using ${name} can expect reliable service designed around the needs of park visitors and ${siteConfig.aiLocale} explorers. During peak season, advance reservations are strongly recommended as demand for transportation in the ${siteConfig.parkName} corridor increases significantly.`;
  }
  return `Visitors to ${name} can look forward to an experience rooted in the natural beauty and outdoor culture of the ${siteConfig.parkName} region. Conditions and availability can vary by season, so checking ahead for current hours or trail conditions is always a wise step before visiting.`;
}

/**
 * Rewrite text to 3rd person, replacing "our/we/my" with the business name / "their/they".
 */
function rewriteToThirdPerson(text: string, businessName: string): string {
  let result = text;
  // Replace first-person possessives
  result = result.replace(/\bOur\b/g, "Their");
  result = result.replace(/\bour\b/g, "their");
  result = result.replace(/\bWe\b/g, businessName);
  result = result.replace(/\bwe\b/g, "they");
  result = result.replace(/\bMy\b/g, "Their");
  result = result.replace(/\bmy\b/g, "their");
  result = result.replace(/\bUs\b/g, "Them");
  result = result.replace(/\bus\b(?=[\s,.\!])/g, "them");
  return result;
}

/**
 * Extract common themes from review snippets and compose a paragraph.
 */
function extractReviewThemes(
  snippets: string[],
  name: string,
  isRestaurant: boolean,
  isLodging: boolean
): string | null {
  const allText = snippets.join(" ").toLowerCase();
  const highlights: string[] = [];

  if (isRestaurant) {
    if (/friendly|welcoming|warm/.test(allText)) highlights.push("friendly service");
    if (/view|scenic|patio|outdoor/.test(allText)) highlights.push("scenic dining atmosphere");
    if (/fresh|quality|delicious|amazing food/.test(allText)) highlights.push("high-quality cuisine");
    if (/portion|generous|hearty/.test(allText)) highlights.push("generous portions");
    if (/vegan|vegetarian|gluten.?free|healthy/.test(allText)) highlights.push("dietary-friendly options");
    if (/local|craft|brew|beer/.test(allText)) highlights.push("local craft beverages");
    if (/family|kids|children/.test(allText)) highlights.push("a family-friendly atmosphere");
    if (/fast|quick|efficient/.test(allText)) highlights.push("efficient service");
    if (/breakfast|brunch|morning/.test(allText)) highlights.push("a popular breakfast and brunch spot");
  } else if (isLodging) {
    if (/clean|spotless|tidy/.test(allText)) highlights.push("well-maintained accommodations");
    if (/view|scenic|beautiful/.test(allText)) highlights.push("scenic views");
    if (/staff|helpful|friendly/.test(allText)) highlights.push("attentive staff");
    if (/quiet|peaceful|relax/.test(allText)) highlights.push("a peaceful atmosphere");
    if (/pool|hot tub|spa/.test(allText)) highlights.push("resort-style amenities");
    if (/location|close|convenient|walking/.test(allText)) highlights.push("a convenient location");
    if (/kitchen|cook|kitchenette/.test(allText)) highlights.push("self-catering facilities");
  } else {
    if (/guide|knowledgeable|expert/.test(allText)) highlights.push("knowledgeable guides");
    if (/safe|safety|professional/.test(allText)) highlights.push("a strong focus on safety");
    if (/fun|exciting|thrill|adventure/.test(allText)) highlights.push("exciting experiences");
    if (/family|kids|all ages/.test(allText)) highlights.push("options for all ages");
    if (/view|scenery|beautiful|stunning/.test(allText)) highlights.push("breathtaking scenery");
    if (/gear|equipment|provided/.test(allText)) highlights.push("all necessary equipment provided");
  }

  if (highlights.length === 0) return null;

  // Take up to 4 highlights
  const picked = highlights.slice(0, 4);
  const joined =
    picked.length === 1
      ? picked[0]
      : picked.slice(0, -1).join(", ") + " and " + picked[picked.length - 1];

  return `Guests frequently praise ${name} for ${joined}. These consistent themes across multiple reviews paint a picture of a business that values the visitor experience.`;
}

/**
 * Extract a concrete detail sentence from review snippets for added specificity.
 */
function extractReviewDetail(
  snippets: string[],
  name: string,
  isRestaurant: boolean,
  isLodging: boolean
): string | null {
  // Find short-to-medium snippets that might contain useful specifics
  const candidates = snippets
    .filter(s => s.length >= 50 && s.length <= 400)
    .slice(0, 3);

  if (candidates.length === 0) return null;

  for (const snippet of candidates) {
    const sentences = snippet.match(/[^.!?]+[.!?]+/g) || [];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const wordCount = trimmed.split(/\s+/).length;
      if (wordCount < 6 || wordCount > 25) continue;
      // Skip first-person sentences
      if (/\b(I|we|my|our|me)\b/i.test(trimmed)) continue;
      // Look for sentences with concrete nouns
      if (isRestaurant && /menu|dish|burger|pizza|steak|breakfast|coffee|salad|sandwich|taco|BBQ|brew|sauce|ribs/i.test(trimmed)) {
        return `Reviewers have noted specific highlights such as the menu offerings and overall dining experience at ${name}.`;
      }
      if (isLodging && /room|bed|suite|cabin|pool|shower|balcony|patio|lobby|view/i.test(trimmed)) {
        return `Reviewers have called attention to the property's accommodations and on-site amenities at ${name}.`;
      }
    }
  }

  // Generic fallback for experiences/other if reviews mention anything positive
  if (candidates.some(s => /recommend|amazing|great|excellent|love/i.test(s))) {
    return `Many reviewers recommend ${name} as a standout option in the area.`;
  }

  return null;
}

// ============================================
// BUSINESS DISCOVERY — Text Search API
// ============================================

export interface DiscoveredPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string | null;
  rating: number;
  reviewCount: number;
  priceLevel: string | null;
  googleMapsUri: string | null;
  website: string | null;
  phone: string | null;
  businessStatus: string | null;
  suggestedListingType: string | null;
  suggestedCategorySlug: string | null;
  relevance: "include" | "exclude" | "review";
  town: string;
}

const TOURISM_INCLUDE_TYPES = new Set([
  // Dining
  "restaurant", "cafe", "bakery", "bar", "brewery", "winery", "coffee_shop",
  "fast_food_restaurant", "ice_cream_shop", "pizza_restaurant", "steak_house",
  "seafood_restaurant", "mexican_restaurant", "italian_restaurant", "american_restaurant",
  "japanese_restaurant", "chinese_restaurant", "thai_restaurant", "indian_restaurant",
  "korean_restaurant", "vietnamese_restaurant", "greek_restaurant", "french_restaurant",
  "mediterranean_restaurant", "barbecue_restaurant", "brunch_restaurant", "breakfast_restaurant",
  "sandwich_shop", "deli", "food_court", "hamburger_restaurant", "sushi_restaurant",
  "ramen_restaurant", "taco_restaurant", "dessert_restaurant", "dessert_shop",
  "wine_bar", "beer_garden", "gastropub", "pub", "cocktail_bar", "sports_bar",
  "fine_dining_restaurant", "family_restaurant", "buffet_restaurant", "diner",
  "tea_house", "juice_shop", "acai_shop", "donut_shop", "candy_store", "chocolate_shop",
  "meal_delivery", "meal_takeaway", "supermarket", "grocery_or_supermarket", "convenience_store",
  "food_truck", "bagel_shop", "pastry_shop", "confectionery",
  // Lodging
  "hotel", "motel", "resort_hotel", "bed_and_breakfast", "campground", "rv_park",
  "hostel", "inn", "guest_house", "lodging", "extended_stay_hotel", "farmstay",
  "camping_cabin", "cottage", "mobile_home_park",
  // Experiences & Attractions
  "tourist_attraction", "visitor_center", "art_gallery", "museum", "spa",
  "hiking_area", "national_park", "state_park", "adventure_sports_center",
  "amusement_park", "aquarium", "zoo", "marina", "vineyard", "live_music_venue",
  "movie_theater", "bowling_alley", "golf_course", "casino", "amphitheatre",
  "botanical_garden", "water_park", "historical_landmark", "city_park", "park",
  "dog_park", "picnic_ground", "skateboard_park", "wildlife_park", "wildlife_refuge",
  "observation_deck", "planetarium", "off_roading_area", "concert_hall",
  "comedy_club", "event_venue", "wedding_venue", "community_center",
  "travel_agency", "tour_agency",
  // Transportation
  "car_rental", "taxi_service", "bus_station", "airport", "transit_station",
  "bicycle_store", "bicycle_rental", "bike_sharing_station",
  // Other travel-relevant
  "gas_station", "gift_shop", "swimming_pool",
  "hot_spring", "ski_resort", "playground",
]);

const TOURISM_EXCLUDE_TYPES = new Set([
  "dentist", "doctor", "hospital", "pharmacy", "veterinary_care", "physiotherapist",
  "nail_salon", "hair_salon", "barber_shop", "beauty_salon", "hair_care",
  "lawyer", "accounting", "insurance_agency", "real_estate_agency",
  "school", "university", "primary_school", "secondary_school",
  "bank", "atm", "post_office",
  "funeral_home", "cemetery", "prison", "police", "fire_station", "courthouse",
  "electrician", "plumber", "locksmith", "moving_company", "storage",
  "car_repair", "car_wash", "car_dealer", "dry_cleaner", "laundry",
  "roofing_contractor", "painter", "hvac_contractor",
  // Retail & services not tourism-relevant
  "liquor_store", "convenience_store", "general_store", "supermarket", "grocery_store",
  "department_store", "discount_store", "wholesaler",
  "clothing_store", "shoe_store", "jewelry_store", "furniture_store", "hardware_store",
  "electronics_store", "pet_store", "sporting_goods_store", "book_store",
  "auto_parts_store", "tire_shop", "cell_phone_store",
  "florist", "tailor", "pawn_shop", "thrift_store",
  "church", "mosque", "synagogue", "hindu_temple", "place_of_worship",
  "child_care", "preschool", "daycare",
  "gym", "fitness_center", "yoga_studio", "martial_arts_school",
  "tax_preparation", "notary", "consultant",
]);

function classifyTourismRelevance(types: string[]): "include" | "exclude" | "review" {
  for (const t of types) {
    if (TOURISM_INCLUDE_TYPES.has(t)) return "include";
  }
  for (const t of types) {
    if (TOURISM_EXCLUDE_TYPES.has(t)) return "exclude";
  }
  return "review";
}

function inferListingType(types: string[], primaryType?: string | null): string | null {
  const t = new Set(types);
  const pt = primaryType || null;

  // Dining signals — check first since restaurants are unambiguous
  const diningTypes = ["restaurant", "cafe", "bakery", "bar", "brewery", "winery",
    "coffee_shop", "fast_food_restaurant", "ice_cream_shop", "pizza_restaurant",
    "steak_house", "seafood_restaurant", "food_court", "meal_delivery", "meal_takeaway",
    "pub", "wine_bar", "beer_garden", "gastropub", "diner", "food_truck"];
  if (diningTypes.some(dt => t.has(dt) || types.some(tt => tt.includes("restaurant")))) return "dining";

  // Lodging signals
  const lodgingTypes = ["hotel", "motel", "resort_hotel", "bed_and_breakfast", "campground",
    "rv_park", "hostel", "inn", "guest_house", "lodging", "extended_stay_hotel", "farmstay",
    "camping_cabin", "cottage"];
  if (lodgingTypes.some(lt => t.has(lt))) return "lodging";

  // Transportation signals
  const transTypes = ["car_rental", "taxi_service", "bus_station", "airport", "transit_station",
    "bicycle_rental", "bicycle_store"];
  if (transTypes.some(tt => t.has(tt))) return "transportation";

  // Hiking signals — check BEFORE parks and experiences.
  // hiking_area is the clearest signal. Also check primaryType for precision.
  if (t.has("hiking_area") || pt === "hiking_area") return "hiking";

  // Parks — ONLY actual parks (the place itself is a park, not something inside a park).
  // Use primaryType to distinguish: if Google says the primaryType IS a park type, it's a park.
  // But if primaryType is something else (observation_deck, tourist_attraction, etc.) and
  // "park" is just in the types array because it's located inside a park, it's NOT a park listing.
  const parkPrimaryTypes = new Set([
    "national_park", "state_park", "national_forest", "wilderness_area",
    "national_monument", "conservation_area", "nature_reserve",
    "national_wildlife_refuge", "city_park", "park",
  ]);
  if (pt && parkPrimaryTypes.has(pt)) return "parks";

  // Golf signals — check BEFORE experiences so golf_course doesn't get swallowed
  if (t.has("golf_course") || pt === "golf_course") return "golf";

  // Experiences — everything else tourism-relevant
  const expTypes = ["tourist_attraction", "visitor_center", "art_gallery", "museum", "spa",
    "adventure_sports_center", "amusement_park", "aquarium", "zoo", "marina", "vineyard",
    "tour_agency", "travel_agency", "casino", "live_music_venue",
    "movie_theater", "bowling_alley", "water_park", "ski_resort", "swimming_pool",
    "hot_spring", "historical_landmark", "observation_deck", "scenic_spot",
    "geological_formation", "picnic_ground", "off_roading_area", "wildlife_park",
    "wildlife_refuge", "botanical_garden", "amphitheatre", "concert_hall",
    "comedy_club", "planetarium", "event_venue"];
  if (expTypes.some(et => t.has(et))) return "experiences";

  return null;
}

/** Discovery towns sourced from site-config (re-exported for admin-discover-listings) */
export const DISCOVERY_TOWNS = siteConfig.discoveryTowns;

export const DISCOVERY_QUERIES = [
  { template: "restaurants dining cafes food in {town} {state}", suggestedType: "dining" },
  { template: "hotels motels lodging accommodation in {town} {state}", suggestedType: "lodging" },
  { template: "tours activities attractions things to do near {town} {state}", suggestedType: "experiences" },
  { template: "car rental shuttle transportation in {town} {state}", suggestedType: "transportation" },
  { template: "breweries wineries bars nightlife in {town} {state}", suggestedType: "dining" },
  { template: "state park national park monument scenic area near {town} {state}", suggestedType: "parks" },
  { template: "golf course driving range indoor golf in {town} {state}", suggestedType: "golf", includedType: "golf_course" },
] as const;

/** Haversine distance between two lat/lng points, returns meters */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function discoverPlaces(
  textQuery: string,
  center: { lat: number; lng: number },
  radius: number,
  pageToken?: string,
  includedType?: string
): Promise<{ places: DiscoveredPlace[]; nextPageToken: string | null; town: string; debug?: string }> {
  const apiKey = await getGoogleApiKey();
  if (!apiKey) return { places: [], nextPageToken: null, town: "", debug: "No API key found" };

  // Try New Places API first, fall back to legacy Text Search
  let rawPlaces: any[] = [];
  let nextPageToken: string | null = null;
  let debug = "";

  // --- Attempt 1: New Places API (v1) Text Search ---
  try {
    const fieldMask = [
      "places.id", "places.displayName", "places.formattedAddress",
      "places.types", "places.primaryType", "places.location",
      "places.rating", "places.userRatingCount", "places.businessStatus",
      "places.priceLevel", "places.googleMapsUri", "places.websiteUri",
      "places.nationalPhoneNumber",
    ].join(",");

    // locationRestriction requires a rectangle, not a circle.
    // Convert center + radius to a bounding box.
    const latDelta = radius / 111_320; // ~111.32 km per degree latitude
    const lngDelta = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
    const body: any = {
      textQuery,
      locationRestriction: {
        rectangle: {
          low: { latitude: center.lat - latDelta, longitude: center.lng - lngDelta },
          high: { latitude: center.lat + latDelta, longitude: center.lng + lngDelta },
        },
      },
      pageSize: 20,
    };
    if (pageToken) body.pageToken = pageToken;
    if (includedType) body.includedType = includedType;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      rawPlaces = (data.places || []).map((p: any) => ({
        placeId: p.id || p.name?.replace("places/", "") || "",
        name: p.displayName?.text || "",
        address: p.formattedAddress || "",
        lat: p.location?.latitude || 0,
        lng: p.location?.longitude || 0,
        types: p.types || [],
        primaryType: p.primaryType || null,
        rating: p.rating || 0,
        reviewCount: p.userRatingCount || 0,
        priceLevel: p.priceLevel || null,
        googleMapsUri: p.googleMapsUri || null,
        website: p.websiteUri || null,
        phone: p.nationalPhoneNumber || null,
        businessStatus: p.businessStatus || null,
      }));
      nextPageToken = data.nextPageToken || null;
      debug = `New API OK: ${rawPlaces.length} results`;
    } else {
      const errorBody = await res.text();
      debug = `New API HTTP ${res.status}: ${errorBody.substring(0, 200)}`;
      console.error(`New Text Search API error ${res.status}: ${errorBody}`);
    }
  } catch (err: any) {
    debug = `New API exception: ${err.message || String(err)}`;
    console.warn("New Text Search API failed, falling back to legacy:", err);
  }

  // --- Attempt 2: Legacy Text Search API ---
  if (rawPlaces.length === 0 && !pageToken) {
    try {
      const legacyUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}&location=${center.lat},${center.lng}&radius=${radius}&key=${apiKey}`;
      const res = await fetch(legacyUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "OK" && data.results) {
          rawPlaces = data.results.map((r: any) => ({
            placeId: r.place_id || "",
            name: r.name || "",
            address: r.formatted_address || "",
            lat: r.geometry?.location?.lat || 0,
            lng: r.geometry?.location?.lng || 0,
            types: r.types || [],
            primaryType: null,
            rating: r.rating || 0,
            reviewCount: r.user_ratings_total || 0,
            priceLevel: r.price_level != null ? (
              ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE",
               "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"][r.price_level] || null
            ) : null,
            googleMapsUri: null,
            website: null,
            phone: null,
            businessStatus: r.business_status || null,
          }));
          nextPageToken = data.next_page_token || null;
          debug += ` | Legacy OK: ${rawPlaces.length} results`;
          console.log(`Discovery using legacy Text Search: ${rawPlaces.length} results`);
        } else {
          debug += ` | Legacy status: ${data.status}`;
        }
      }
    } catch (err: any) {
      debug += ` | Legacy exception: ${err.message || String(err)}`;
      console.error("Legacy Text Search failed:", err);
    }
  }

  // Filter out results that are outside the search radius.
  // Google's text search treats locationRestriction as a bias, not a strict boundary,
  // so it can return results hundreds of miles away in sparse areas.
  const maxDistanceMeters = radius * 1.5; // Allow 50% buffer beyond the specified radius
  const filteredPlaces = rawPlaces.filter((p: any) => {
    if (!p.lat || !p.lng) return false;
    const dist = haversineDistance(center.lat, center.lng, p.lat, p.lng);
    return dist <= maxDistanceMeters;
  });

  const filtered = rawPlaces.length - filteredPlaces.length;
  if (filtered > 0) {
    debug += ` | Filtered ${filtered} out-of-range results`;
  }

  const places: DiscoveredPlace[] = filteredPlaces.map((p: any) => ({
    placeId: p.placeId,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    types: p.types,
    primaryType: p.primaryType,
    rating: p.rating,
    reviewCount: p.reviewCount,
    priceLevel: p.priceLevel,
    googleMapsUri: p.googleMapsUri,
    website: p.website,
    phone: p.phone,
    businessStatus: p.businessStatus,
    suggestedListingType: inferListingType(p.types, p.primaryType),
    suggestedCategorySlug: mapGoogleTypesToCategorySlug(p.types, p.primaryType),
    relevance: classifyTourismRelevance(p.types),
    town: "",
  }));

  return { places, nextPageToken, town: "", debug };
}
