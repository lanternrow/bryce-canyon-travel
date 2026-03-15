import { Link, useLoaderData, useActionData, Form, redirect, useFetcher, useRouteLoaderData } from "react-router";
import { useRef, useEffect, useState, useCallback, lazy, Suspense } from "react";
import type { Route } from "./+types/admin-listing-edit";
import type { Listing, ListingStatus, ListingType, PriceRange, DifficultyLevel, TrailType, ParkDetails, EntryRequirement, DogPolicy } from "../lib/types";
import {
  getListingById,
  getCategories,
  getLocations,
  createListing,
  updateListing,
  upsertBusinessHours,
  syncMediaUsage,
  autoLinkAmenities,
  setSubmissionToken,
  findMediaFolderBySlug,
  countMediaInFolder,
  getHikingDetails,
  upsertHikingDetails,
  getParkDetails,
  upsertParkDetails,
} from "../lib/queries.server";
import { fetchPlaceDetailsForAutoPopulate, generateContentOnly } from "../lib/google-places.server";
import { notifySearchEngines } from "../lib/seo-notify.server";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { checkPublishRequirements, countWords } from "../lib/publish-validation";
import { requireAuth } from "../lib/auth.server";
import {
  getListingDeindexPreflight,
  getRecentDeindexRequests,
  submitDeindexRequest,
} from "../lib/deindex.server";
import { getListingPath, getListingUrl } from "../lib/listing-url";
import { siteConfig } from "../lib/site-config";
import ImageUploader from "../components/ImageUploader";
import GalleryUploader from "../components/GalleryUploader";
import SerpPreview from "../components/SerpPreview";
import SocialPreview from "../components/SocialPreview";
import SeoMeter from "../components/SeoMeter";
import SeoScorecard, { type KeyphraseDuplicate } from "../components/SeoScorecard";
import ReadabilityScorecard from "../components/ReadabilityScorecard";
import { applyTitleTemplate } from "../lib/title-template";

const RichTextEditor = lazy(() => import("../components/RichTextEditor"));
const LISTING_TYPES: ListingType[] = ["dining", "lodging", "experiences", "hiking", "transportation", "parks", "golf"];

/**
 * Map NPS season names (e.g., ["Spring", "Summer", "Fall"]) to
 * approximate month values for the season_start/season_end form fields.
 */
function mapSeasonsToMonths(seasons: string[]): { start: string | null; end: string | null } {
  const seasonMonths: Record<string, { start: string; end: string }> = {
    spring: { start: "March", end: "May" },
    summer: { start: "June", end: "August" },
    fall: { start: "September", end: "November" },
    autumn: { start: "September", end: "November" },
    winter: { start: "December", end: "February" },
  };

  const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  let earliest: string | null = null;
  let latest: string | null = null;

  for (const season of seasons) {
    const s = seasonMonths[season.toLowerCase()];
    if (!s) continue;

    if (!earliest || monthOrder.indexOf(s.start) < monthOrder.indexOf(earliest)) {
      earliest = s.start;
    }
    if (!latest || monthOrder.indexOf(s.end) > monthOrder.indexOf(latest)) {
      latest = s.end;
    }
  }

  return { start: earliest, end: latest };
}

export function meta() {
  return [{ title: `Edit Listing | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const isNew = !params.id;
  let listing = null;

  if (!isNew) {
    listing = await getListingById(params.id!);
    if (!listing) {
      throw new Response("Listing not found", { status: 404 });
    }
  }

  const [categories, locations, mediaMeta, recentDeindexRequests] = await Promise.all([
    getCategories(),
    getLocations(),
    listing?.featured_image
      ? buildMediaMetadata([listing.featured_image])
      : Promise.resolve<Record<string, { alt_text?: string; title?: string; caption?: string }>>({}),
    listing
      ? getRecentDeindexRequests("listing", listing.id, 5)
      : Promise.resolve([]),
  ]);

  const featuredImageAlt = listing?.featured_image
    ? mediaMeta[listing.featured_image]?.alt_text || ""
    : "";

  // Fetch hiking details for hiking listings
  const hikingDetails = listing?.type === "hiking"
    ? await getHikingDetails(listing.id)
    : null;
  const parkDetails = listing?.type === "parks"
    ? await getParkDetails(listing.id)
    : null;

  // Count submitted photos for this listing
  let submittedPhotoCount = 0;
  if (listing?.submission_token && listing?.slug) {
    const folderSlug = `submissions-${listing.slug}`;
    const folder = await findMediaFolderBySlug(folderSlug);
    if (folder) {
      submittedPhotoCount = await countMediaInFolder(folder.id);
    }
  }

  return {
    listing,
    categories,
    locations,
    isNew,
    featuredImageAlt,
    deindexPreflight: listing ? getListingDeindexPreflight(listing) : null,
    recentDeindexRequests,
    submittedPhotoCount,
    hikingDetails,
    parkDetails,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "generate-submission-token") {
    if (!params.id) {
      return { submissionToken: { ok: false, message: "Save the listing first." } };
    }
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await setSubmissionToken(params.id, token);
    return { submissionToken: { ok: true, token } };
  }

  if (intent === "request-deindex") {
    if (!params.id) {
      return {
        deindexRequest: {
          ok: false,
          message: "Save the listing before requesting deindex.",
        },
      };
    }

    const listing = await getListingById(params.id);
    if (!listing) {
      throw new Response("Listing not found", { status: 404 });
    }

    const result = await submitDeindexRequest({
      contentType: "listing",
      contentId: listing.id,
      requestedByUserId: user.id,
      requestedByEmail: user.email,
      preflight: getListingDeindexPreflight(listing),
    });

    return { deindexRequest: result };
  }

  // Handle auto-populate request
  if (intent === "auto-populate") {
    const placeId = formData.get("google_place_id") as string;
    const populateScope = (formData.get("populate_scope") as "trail" | "google") || "google";
    if (!placeId) {
      return { error: "No Google Place ID provided", autoPopulate: null };
    }
    const listingType = (formData.get("listing_type") as string) || "";
    const listingName = (formData.get("listing_name") as string) || "";
    // AI inference is disabled — fields stay empty for manual input rather than being AI-guessed.
    const skipAI = true;
    const skipContent = true; // Content is generated separately via "Generate Content" button
    const skipHiking = populateScope === "google";
    const details = await fetchPlaceDetailsForAutoPopulate(placeId, {
      listingType: listingType || undefined,
      trailName: listingName || undefined,
      skipAI,
      skipContent,
      skipHiking,
    });
    if (!details) {
      return { error: "Could not fetch data from Google Places API. Check your API key and Place ID.", autoPopulate: null };
    }

    // Run server-side effects when pulling from Google
    let amenitiesLinked = 0;
    if (populateScope === "google") {
      // Save business hours directly to DB if this is an existing listing
      if (params.id && details.businessHours && details.businessHours.length > 0) {
        try {
          await upsertBusinessHours(params.id, details.businessHours);
        } catch (err) {
          console.error("Failed to save business hours:", err);
        }
      }

      // Auto-link amenities from Google boolean signals
      if (params.id && details.autoAmenities && details.autoAmenities.length > 0) {
        try {
          amenitiesLinked = await autoLinkAmenities(params.id, details.autoAmenities);
        } catch (err) {
          console.error("Failed to auto-link amenities:", err);
        }
      }
    }

    // Always persist Google fields + coordinates (lightweight, always useful)
    if (params.id) {
      try {
        await updateListing(params.id, {
          google_place_id: placeId,
          google_maps_uri: details.googleMapsUri || undefined,
          google_primary_type: details.googlePrimaryType || undefined,
          google_types: details.types || undefined,
          lat: details.lat || undefined,
          lng: details.lng || undefined,
        });
      } catch (err) {
        console.error("Failed to persist Google fields:", err);
      }
    }

    // Resolve suggested category slug to a category_id
    let suggestedCategoryId: number | null = null;
    if (details.suggestedCategorySlug) {
      const allCategories = await getCategories();
      const match = allCategories.find((c) => c.slug === details.suggestedCategorySlug);
      if (match) {
        suggestedCategoryId = match.id;
      }
    }

    return { error: null, autoPopulate: { ...details, suggestedCategoryId, amenitiesLinked } };
  }

  // Handle standalone content generation (Stage 2 of two-stage workflow)
  if (intent === "generate-content") {
    const placeId = formData.get("google_place_id") as string;
    if (!placeId) {
      return { error: "No Google Place ID provided", generatedContent: null };
    }
    const listingName = (formData.get("listing_name") as string) || "";
    const listingType = (formData.get("listing_type") as string) || "";
    const city = (formData.get("city") as string) || "";
    const state = (formData.get("state") as string) || "";

    // Parse hiking enrichment data cached from Stage 1
    let hikingEnrichment: any = null;
    const enrichmentJson = formData.get("hiking_enrichment") as string;
    if (enrichmentJson) {
      try { hikingEnrichment = JSON.parse(enrichmentJson); } catch { /* ignore */ }
    }

    // Parse user-corrected form field values
    const distanceRaw = formData.get("distance_miles") as string;
    const elevationRaw = formData.get("elevation_gain_ft") as string;
    const difficulty = (formData.get("difficulty") as string) || null;
    const estimatedTime = (formData.get("estimated_time") as string) || null;
    const trailType = (formData.get("trail_type") as string) || null;
    const seasonStart = (formData.get("season_start") as string) || null;
    const seasonEnd = (formData.get("season_end") as string) || null;
    const dogPolicyRaw = (formData.get("dog_policy") as string) || "";
    const dogsAllowed = dogPolicyRaw === "on_leash" || dogPolicyRaw === "off_leash" ? true : dogPolicyRaw === "not_allowed" ? false : undefined;
    const waterAvailable = formData.get("water_available") === "true" ? true : formData.get("water_available") === "false" ? false : undefined;
    const entryReqRaw = (formData.get("entry_requirement") as string) || "";
    const permitRequired = entryReqRaw === "permit" ? true : entryReqRaw === "none" ? false : entryReqRaw === "entry_fee" ? false : undefined;
    const surfaceType = (formData.get("surface_type") as string) || null;

    const result = await generateContentOnly({
      placeId,
      listingName,
      listingType,
      city,
      state,
      hikingEnrichment,
      distanceMiles: distanceRaw ? parseFloat(distanceRaw) : null,
      elevationGainFt: elevationRaw ? parseInt(elevationRaw) : null,
      difficulty,
      estimatedTime,
      trailType,
      seasonStart,
      seasonEnd,
      dogsAllowed,
      waterAvailable,
      permitRequired,
      surfaceType,
    });

    if (!result) {
      return { error: "AI content generation failed. Check your Anthropic API key.", generatedContent: null };
    }

    return { error: null, generatedContent: result };
  }

  // Handle normal save
  const isNew = !params.id;
  const existingListing = !isNew ? await getListingById(params.id!) : null;
  if (!isNew && !existingListing) {
    throw new Response("Listing not found", { status: 404 });
  }
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return { error: "Listing name is required." };
  }
  const rawSlug = formData.get("slug");
  const slugInput = typeof rawSlug === "string" ? rawSlug.trim() : "";
  const slug = slugInput || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    return { error: "Please enter a valid slug." };
  }

  const rawType = formData.get("type");
  const type: ListingType =
    rawType === "dining" ||
    rawType === "lodging" ||
    rawType === "experiences" ||
    rawType === "hiking" ||
    rawType === "transportation" ||
    rawType === "parks" ||
    rawType === "golf"
      ? rawType
      : "dining";
  const rawStatus = formData.get("status");
  const status: ListingStatus =
    rawStatus === "draft" || rawStatus === "pending" || rawStatus === "published" || rawStatus === "archived"
      ? rawStatus
      : "draft";
  const rawPriceRange = formData.get("price_range");
  const priceRange: PriceRange | undefined =
    rawPriceRange === "free" || rawPriceRange === "$" || rawPriceRange === "$$" || rawPriceRange === "$$$" || rawPriceRange === "$$$$"
      ? rawPriceRange
      : undefined;

  const data: Partial<Listing> = {
    type,
    name,
    slug,
    tagline: (formData.get("tagline") as string) || undefined,
    description: (formData.get("description") as string) || undefined,
    category_id: formData.get("category_id") ? Number(formData.get("category_id")) : undefined,
    location_id: formData.get("location_id") ? Number(formData.get("location_id")) : undefined,
    address: (formData.get("address") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
    state: (formData.get("state") as string) || "UT",
    zip: (formData.get("zip") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    has_no_phone: formData.get("has_no_phone") === "on",
    has_no_google_place_id: formData.get("has_no_google_place_id") === "on",
    email: (formData.get("email") as string) || undefined,
    website: (formData.get("website") as string) || undefined,
    price_range: priceRange,
    status,
    is_featured: formData.get("is_featured") === "on",
    google_place_id: (formData.get("google_place_id") as string) || undefined,
    featured_image: (formData.get("featured_image") as string) || undefined,
    gallery: formData.get("gallery") ? JSON.parse(formData.get("gallery") as string) : undefined,
    meta_title: (formData.get("meta_title") as string) || undefined,
    meta_description: (formData.get("meta_description") as string) || undefined,
    focus_keyphrase: (formData.get("focus_keyphrase") as string) || undefined,
    lat: formData.get("lat") ? parseFloat(formData.get("lat") as string) : undefined,
    lng: formData.get("lng") ? parseFloat(formData.get("lng") as string) : undefined,
  };

  // ── Publish gate: server-side enforcement ──
  if (data.status === "published") {
    // Look up category slug for publish gate (POI listings skip address/phone)
    let categorySlug: string | null = null;
    if (data.category_id) {
      const allCats = await getCategories();
      const matchedCat = allCats.find((c) => c.id === data.category_id);
      if (matchedCat) categorySlug = matchedCat.slug;
    }

    const check = checkPublishRequirements({
      name: data.name,
      type: data.type,
      description: data.description || null,
      address: data.address || null,
      phone: data.phone || null,
      has_no_phone: data.has_no_phone || false,
      google_place_id: data.google_place_id || null,
      has_no_google_place_id: data.has_no_google_place_id || false,
      city: data.city || null,
      category_id: data.category_id || null,
      location_id: data.location_id || null,
      category_slug: categorySlug,
    });
    if (!check.canPublish) {
      data.status = "draft";
    }
  }

  try {
    if (isNew) {
      const newListing = await createListing(data);
      const newId = (newListing as any).id;

      // Sync media usage tracking
      const mediaUsages: { url: string; usage_type: string }[] = [];
      if (data.featured_image) mediaUsages.push({ url: data.featured_image, usage_type: "featured_image" });
      if (data.gallery && Array.isArray(data.gallery)) {
        for (const gUrl of data.gallery) {
          if (gUrl) mediaUsages.push({ url: gUrl, usage_type: "gallery" });
        }
      }
      await syncMediaUsage("listing", newId, mediaUsages);

      // Save hiking details for hiking listings
      if (type === "hiking") {
        await upsertHikingDetails(newId, {
          difficulty: (formData.get("hiking_difficulty") as DifficultyLevel) || undefined,
          trail_type: (formData.get("hiking_trail_type") as TrailType) || undefined,
          distance_miles: formData.get("hiking_distance_miles")
            ? parseFloat(formData.get("hiking_distance_miles") as string)
            : undefined,
          distance_miles_max: formData.get("hiking_distance_miles_max")
            ? parseFloat(formData.get("hiking_distance_miles_max") as string)
            : undefined,
          elevation_gain_ft: formData.get("hiking_elevation_gain_ft")
            ? parseInt(formData.get("hiking_elevation_gain_ft") as string, 10)
            : undefined,
          estimated_time: (formData.get("hiking_estimated_time") as string) || undefined,
          trailhead_lat: formData.get("hiking_trailhead_lat")
            ? parseFloat(formData.get("hiking_trailhead_lat") as string)
            : undefined,
          trailhead_lng: formData.get("hiking_trailhead_lng")
            ? parseFloat(formData.get("hiking_trailhead_lng") as string)
            : undefined,
          trailhead_address: (formData.get("hiking_trailhead_address") as string) || undefined,
          entry_requirement: ((formData.get("hiking_entry_requirement") as string) || "none") as import("../lib/types").EntryRequirement,
          permit_info: (formData.get("hiking_permit_info") as string) || undefined,
          dog_policy: ((formData.get("hiking_dog_policy") as string) || "not_allowed") as import("../lib/types").DogPolicy,
          season_start: (formData.get("hiking_season_start") as string) || undefined,
          season_end: (formData.get("hiking_season_end") as string) || undefined,
          water_available: formData.get("hiking_water_available") === "on",
          shade_level: (formData.get("hiking_shade_level") as string) || undefined,
          kid_friendly: formData.get("hiking_kid_friendly") === "on",
          surface_type: (formData.get("hiking_surface_type") as string) || undefined,
          data_sources: (formData.get("hiking_data_sources") as string) || undefined,
        });
      }

      // Save park details for parks listings
      if (type === "parks") {
        await upsertParkDetails(newId, {
          entry_fee: (formData.get("park_entry_fee") as string) || undefined,
          annual_pass_accepted: formData.get("park_annual_pass_accepted") === "on",
          fee_free_info: (formData.get("park_fee_free_info") as string) || undefined,
          park_hours: (formData.get("park_park_hours") as string) || undefined,
          visitor_center_hours: (formData.get("park_visitor_center_hours") as string) || undefined,
          seasonal_closure: (formData.get("park_seasonal_closure") as string) || undefined,
          elevation_ft: formData.get("park_elevation_ft") ? parseInt(formData.get("park_elevation_ft") as string, 10) : undefined,
          acreage: formData.get("park_acreage") ? parseInt(formData.get("park_acreage") as string, 10) : undefined,
          year_established: formData.get("park_year_established") ? parseInt(formData.get("park_year_established") as string, 10) : undefined,
          governing_agency: (formData.get("park_governing_agency") as string) || undefined,
          has_visitor_center: formData.get("park_has_visitor_center") === "on",
          has_campgrounds: formData.get("park_has_campgrounds") === "on",
          has_scenic_drives: formData.get("park_has_scenic_drives") === "on",
          has_restrooms: formData.get("park_has_restrooms") === "on",
          has_wheelchair_access: formData.get("park_has_wheelchair_access") === "on",
          has_cell_service: formData.get("park_has_cell_service") === "on",
          notices: (formData.get("park_notices") as string) || undefined,
          entry_requirement: ((formData.get("park_entry_requirement") as string) || "none") as EntryRequirement,
          dog_policy: ((formData.get("park_dog_policy") as string) || "not_allowed") as DogPolicy,
          season_start: (formData.get("park_season_start") as string) || undefined,
          season_end: (formData.get("park_season_end") as string) || undefined,
          water_available: formData.get("park_water_available") === "on",
          kid_friendly: formData.get("park_kid_friendly") === "on",
          data_sources: (formData.get("park_data_sources") as string) || undefined,
        });
      }

      // Notify search engines when newly published (fire-and-forget)
      if (data.status === "published" && data.type) {
        const listingUrl = getListingUrl(data.type, slug);
        notifySearchEngines([listingUrl]).catch(console.error);
      }

      // New listings redirect to their edit page
      return redirect(`/admin/listings/${newId}/edit`);
    } else {
      await updateListing(params.id!, data);

      // Sync media usage tracking
      const mediaUsages: { url: string; usage_type: string }[] = [];
      if (data.featured_image) mediaUsages.push({ url: data.featured_image, usage_type: "featured_image" });
      if (data.gallery && Array.isArray(data.gallery)) {
        for (const gUrl of data.gallery) {
          if (gUrl) mediaUsages.push({ url: gUrl, usage_type: "gallery" });
        }
      }
      await syncMediaUsage("listing", params.id!, mediaUsages);

      // Save hiking details for hiking listings
      if (type === "hiking") {
        await upsertHikingDetails(params.id!, {
          difficulty: (formData.get("hiking_difficulty") as DifficultyLevel) || undefined,
          trail_type: (formData.get("hiking_trail_type") as TrailType) || undefined,
          distance_miles: formData.get("hiking_distance_miles")
            ? parseFloat(formData.get("hiking_distance_miles") as string)
            : undefined,
          distance_miles_max: formData.get("hiking_distance_miles_max")
            ? parseFloat(formData.get("hiking_distance_miles_max") as string)
            : undefined,
          elevation_gain_ft: formData.get("hiking_elevation_gain_ft")
            ? parseInt(formData.get("hiking_elevation_gain_ft") as string, 10)
            : undefined,
          estimated_time: (formData.get("hiking_estimated_time") as string) || undefined,
          trailhead_lat: formData.get("hiking_trailhead_lat")
            ? parseFloat(formData.get("hiking_trailhead_lat") as string)
            : undefined,
          trailhead_lng: formData.get("hiking_trailhead_lng")
            ? parseFloat(formData.get("hiking_trailhead_lng") as string)
            : undefined,
          trailhead_address: (formData.get("hiking_trailhead_address") as string) || undefined,
          entry_requirement: ((formData.get("hiking_entry_requirement") as string) || "none") as import("../lib/types").EntryRequirement,
          permit_info: (formData.get("hiking_permit_info") as string) || undefined,
          dog_policy: ((formData.get("hiking_dog_policy") as string) || "not_allowed") as import("../lib/types").DogPolicy,
          season_start: (formData.get("hiking_season_start") as string) || undefined,
          season_end: (formData.get("hiking_season_end") as string) || undefined,
          water_available: formData.get("hiking_water_available") === "on",
          shade_level: (formData.get("hiking_shade_level") as string) || undefined,
          kid_friendly: formData.get("hiking_kid_friendly") === "on",
          surface_type: (formData.get("hiking_surface_type") as string) || undefined,
          data_sources: (formData.get("hiking_data_sources") as string) || undefined,
        });
      }

      // Save park details for parks listings
      if (type === "parks") {
        await upsertParkDetails(params.id!, {
          entry_fee: (formData.get("park_entry_fee") as string) || undefined,
          annual_pass_accepted: formData.get("park_annual_pass_accepted") === "on",
          fee_free_info: (formData.get("park_fee_free_info") as string) || undefined,
          park_hours: (formData.get("park_park_hours") as string) || undefined,
          visitor_center_hours: (formData.get("park_visitor_center_hours") as string) || undefined,
          seasonal_closure: (formData.get("park_seasonal_closure") as string) || undefined,
          elevation_ft: formData.get("park_elevation_ft") ? parseInt(formData.get("park_elevation_ft") as string, 10) : undefined,
          acreage: formData.get("park_acreage") ? parseInt(formData.get("park_acreage") as string, 10) : undefined,
          year_established: formData.get("park_year_established") ? parseInt(formData.get("park_year_established") as string, 10) : undefined,
          governing_agency: (formData.get("park_governing_agency") as string) || undefined,
          has_visitor_center: formData.get("park_has_visitor_center") === "on",
          has_campgrounds: formData.get("park_has_campgrounds") === "on",
          has_scenic_drives: formData.get("park_has_scenic_drives") === "on",
          has_restrooms: formData.get("park_has_restrooms") === "on",
          has_wheelchair_access: formData.get("park_has_wheelchair_access") === "on",
          has_cell_service: formData.get("park_has_cell_service") === "on",
          notices: (formData.get("park_notices") as string) || undefined,
          entry_requirement: ((formData.get("park_entry_requirement") as string) || "none") as EntryRequirement,
          dog_policy: ((formData.get("park_dog_policy") as string) || "not_allowed") as DogPolicy,
          season_start: (formData.get("park_season_start") as string) || undefined,
          season_end: (formData.get("park_season_end") as string) || undefined,
          water_available: formData.get("park_water_available") === "on",
          kid_friendly: formData.get("park_kid_friendly") === "on",
          data_sources: (formData.get("park_data_sources") as string) || undefined,
        });
      }

      // Notify search engines on publish + unpublish transitions (fire-and-forget).
      // When previously published URLs move to draft/pending/archived, this helps
      // crawlers see the new 404 state and remove stale index entries faster.
      const changedUrls = new Set<string>();
      if (data.status === "published" && data.type) {
        changedUrls.add(getListingUrl(data.type, slug));
      }
      if (
        existingListing?.status === "published" &&
        existingListing.type &&
        existingListing.slug
      ) {
        changedUrls.add(getListingUrl(existingListing.type, existingListing.slug));
      }
      if (changedUrls.size > 0) {
        notifySearchEngines(Array.from(changedUrls)).catch(console.error);
      }

      // Stay on the page and return success
      return { saved: true, savedAt: Date.now() };
    }
  } catch (error: any) {
    console.error("Failed to save listing:", error);
    if (error?.code === "23505" && typeof error?.message === "string" && error.message.includes("listings_type_slug_key")) {
      return { error: `This ${data.type} slug is already in use: "${slug}". Please change the slug and save again.` };
    }
    return { error: "Could not save listing due to a server error. Please try again." };
  }
}

export default function AdminListingEdit() {
  const {
    listing,
    categories,
    locations,
    isNew,
    featuredImageAlt: initialFeaturedImageAlt,
    deindexPreflight,
    recentDeindexRequests,
    submittedPhotoCount,
    hikingDetails,
    parkDetails,
  } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as { settings: Record<string, string> } | undefined;
  const actionData = useActionData<typeof action>();
  const scopedFetcher = useFetcher();
  const contentFetcher = useFetcher();
  const indexFetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const lastProcessedScopedFetcher = useRef<unknown>(null);
  const lastProcessedContentFetcher = useRef<unknown>(null);
  const [cachedHikingEnrichment, setCachedHikingEnrichment] = useState<any>(null);
  const [sectionStatus, setSectionStatus] = useState<Record<string, { message: string; type: "success" | "error" | "warn" | "info" } | null>>({});
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(listing?.description || "");
  const [contentVersion, setContentVersion] = useState(0);
  const [taglineValue, setTaglineValue] = useState(listing?.tagline || "");
  const [featuredImage, setFeaturedImage] = useState<string | null>(listing?.featured_image || null);
  const [gallery, setGallery] = useState<string[]>(() => {
    if (!listing?.gallery) return [];
    if (Array.isArray(listing.gallery)) return listing.gallery;
    try { return JSON.parse(listing.gallery as any); } catch { return []; }
  });
  const [metaTitle, setMetaTitle] = useState(listing?.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(listing?.meta_description || "");
  const [focusKeyphrase, setFocusKeyphrase] = useState((listing as any)?.focus_keyphrase || "");
  const [linkCopied, setLinkCopied] = useState(false);
  const [hikingEntryReq, setHikingEntryReq] = useState<string>(hikingDetails?.entry_requirement || "none");
  const [hikingDataSources, setHikingDataSources] = useState(hikingDetails?.data_sources ?? "");
  const [parkEntryReq, setParkEntryReq] = useState<string>(parkDetails?.entry_requirement || "none");
  const [parkDataSources, setParkDataSources] = useState(parkDetails?.data_sources ?? "");
  const populateScopeRef = useRef<"trail" | "google">("google");
  // SEO section always visible (no twirl-down)
  const [nameValue, setNameValue] = useState(listing?.name || "");
  const [slugValue, setSlugValue] = useState(listing?.slug || "");
  const [typeValue, setTypeValue] = useState<ListingType>(listing?.type || "dining");
  const [websiteValue, setWebsiteValue] = useState(listing?.website || "");
  const [seoAiLoading, setSeoAiLoading] = useState<"title" | "description" | null>(null);
  const [keyphraseAiLoading, setKeyphraseAiLoading] = useState(false);
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initialFeaturedImageAlt || "");
  const [duplicateKeyphrases, setDuplicateKeyphrases] = useState<KeyphraseDuplicate[]>([]);
  const latestDeindexRequest = (recentDeindexRequests as any[])[0] as
    | { request_outcome: string; created_at: string }
    | undefined;
  const hasRecentDeindexRequest =
    latestDeindexRequest?.request_outcome === "requested" &&
    Date.now() - new Date(latestDeindexRequest.created_at).getTime() < 6 * 60 * 60 * 1000;
  const deindexDisabledReason =
    isNew
      ? "Save the listing before requesting deindex."
      : hasRecentDeindexRequest
      ? "A deindex request was already submitted in the last 6 hours."
      : (deindexPreflight as any)?.reasons?.[0] || null;
  // Look up alt text whenever featured image changes (raw fetch to avoid revalidation)
  useEffect(() => {
    if (featuredImage) {
      let cancelled = false;
      fetch(`/api/media-meta?url=${encodeURIComponent(featuredImage)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setFeaturedImageAlt(data.alt_text || "");
        })
        .catch(() => {});
      return () => { cancelled = true; };
    } else {
      setFeaturedImageAlt("");
    }
  }, [featuredImage]);

  // Show save toast when action returns success
  useEffect(() => {
    if (actionData && (actionData as any).saved) {
      setShowSaveToast(true);
      const timer = setTimeout(() => setShowSaveToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  // Check for duplicate keyphrases (debounced)
  useEffect(() => {
    const kp = focusKeyphrase.trim();
    if (!kp) {
      setDuplicateKeyphrases([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ keyphrase: kp });
        if (listing?.id) {
          params.set("excludeId", listing.id);
          params.set("excludeType", "listing");
        }
        const res = await fetch(`/api/check-keyphrase?${params}`);
        const data = await res.json();
        setDuplicateKeyphrases(data.duplicates || []);
      } catch {
        setDuplicateKeyphrases([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [focusKeyphrase]); // eslint-disable-line react-hooks/exhaustive-deps

  const [descWordCount, setDescWordCount] = useState(() => countWords((listing?.description || "").replace(/<[^>]*>/g, " ")));
  const [publishCheck, setPublishCheck] = useState(() => {
    const catSlug = listing?.category_id
      ? (categories as any[]).find((c: any) => c.id === listing.category_id)?.slug || null
      : null;
    return checkPublishRequirements({
      name: listing?.name,
      type: listing?.type,
      description: listing?.description,
      address: listing?.address,
      phone: listing?.phone,
      has_no_phone: listing?.has_no_phone,
      google_place_id: listing?.google_place_id,
      has_no_google_place_id: listing?.has_no_google_place_id,
      city: listing?.city,
      category_id: listing?.category_id,
      location_id: listing?.location_id,
      category_slug: catSlug,
    });
  });

  // Group categories by listing_type
  const categoryGroups: Record<string, any[]> = {};
  const categoryById: Record<string, any> = {};
  (categories as any[]).forEach((cat: any) => {
    if (!categoryGroups[cat.listing_type]) categoryGroups[cat.listing_type] = [];
    categoryGroups[cat.listing_type].push(cat);
    categoryById[String(cat.id)] = cat;
  });

  // Recompute publish requirements from current form state
  const revalidatePublishCheck = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const getVal = (name: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      return el?.value || "";
    };
    const getChecked = (name: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      return Boolean(el?.checked);
    };
    const typeEl = form.elements.namedItem("type") as RadioNodeList | null;
    const typeVal = typeEl?.value || "";

    const desc = getVal("description");
    const descPlain = desc.replace(/<[^>]*>/g, " ");
    setDescWordCount(countWords(descPlain));

    const catId = getVal("category_id");
    const catSlug = catId ? categoryById[catId]?.slug || null : null;

    const result = checkPublishRequirements({
      name: getVal("name"),
      type: typeVal,
      description: desc,
      address: getVal("address"),
      phone: getVal("phone"),
      has_no_phone: getChecked("has_no_phone"),
      google_place_id: getVal("google_place_id"),
      has_no_google_place_id: getChecked("has_no_google_place_id"),
      city: getVal("city"),
      category_id: catId,
      location_id: getVal("location_id"),
      category_slug: catSlug,
    });
    setPublishCheck(result);
  }, [categoryById]);

  // Per-section status updater: routes status messages to the correct pane
  const updateSectionStatus = useCallback((section: string, message: string, type: "success" | "error" | "warn" | "info", autoClears = 30000) => {
    setSectionStatus(prev => ({ ...prev, [section]: { message, type } }));
    if (autoClears > 0) {
      setTimeout(() => {
        setSectionStatus(prev => ({ ...prev, [section]: null }));
      }, autoClears);
    }
  }, []);

  // Reusable status banner — rendered inline in each section
  const SectionStatusBanner = useCallback(({ section }: { section: string }) => {
    const status = sectionStatus[section];
    if (!status) return null;
    const colors: Record<string, string> = {
      error: "bg-red-50 text-red-700 border border-red-200",
      warn: "bg-amber-50 text-amber-700 border border-amber-200",
      info: "bg-blue-50 text-blue-700 border border-blue-200",
      success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
    return (
      <div className={`px-4 py-3 rounded-lg text-sm whitespace-pre-wrap ${colors[status.type]}`}>
        {status.message}
      </div>
    );
  }, [sectionStatus]);

  // Shared handler: process auto-populate response and fill form fields
  const processAutoPopulate = useCallback((data: any) => {
    if (!data?.autoPopulate) {
      if (data?.error) {
        const errorSection = populateScopeRef.current === "google" ? "source" : populateScopeRef.current;
        updateSectionStatus(errorSection, `Error: ${data.error}`, "error", 6000);
      }
      return;
    }
    {
      const d = data.autoPopulate;
      const form = formRef.current;
      if (!form) return;
      const scope = populateScopeRef.current;

      // setField: fill only if currently empty
      const setField = (name: string, value: string | null | undefined) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el && value) {
          if (!el.value || el.value === "" || el.value === "UT") {
            el.value = value;
          }
        }
      };

      // forceField: always overwrite (for scoped refreshes)
      const forceField = (name: string, value: string | null | undefined) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el && value) el.value = value;
      };

      const filled: string[] = [];

      // ── SOURCE & LOCATION (scope "google"): name, slug, category, price, contact, coordinates, Google metadata ──
      if (scope === "google") {
        // Name: fill if empty
        if (d.name && !nameValue) {
          setNameValue(d.name);
          filled.push("name");
          // Auto-generate slug from name if empty
          if (!slugValue) {
            const autoSlug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            setSlugValue(autoSlug);
            const slugEl = form.elements.namedItem("slug") as HTMLInputElement | null;
            if (slugEl) slugEl.value = autoSlug;
            filled.push("slug");
          }
        }
        // Category: set if empty
        if (d.suggestedCategoryId) {
          const catEl = form.elements.namedItem("category_id") as HTMLSelectElement | null;
          if (catEl && (!catEl.value || catEl.value === "")) {
            catEl.value = String(d.suggestedCategoryId);
          }
          filled.push("category");
        }
        // Price range: set if empty
        if (d.priceRange) {
          setField("price_range", d.priceRange);
          filled.push("price range");
        }
        // Contact & location fields: force-overwrite
        if (d.phone) { forceField("phone", d.phone); filled.push("phone"); }
        if (d.website) { setWebsiteValue(d.website); filled.push("website"); }
        if (d.address) { forceField("address", d.address); filled.push("address"); }
        if (d.city) { forceField("city", d.city); forceField("state", d.state); forceField("zip", d.zip); filled.push("city/state/zip"); }
        // Coordinates
        if (d.lat && d.lng) {
          forceField("lat", String(d.lat));
          forceField("lng", String(d.lng));
          filled.push("coordinates");
        }
        // Google metadata
        if (d.googleMapsUri) filled.push("Google Maps link");
        if (d.types?.length) filled.push("Google types");
        if (d.googlePrimaryType) filled.push("primary type");
      }

      // ── TRAIL INFO: trailhead coordinates ──
      if (scope === "trail" && typeValue === "hiking") {
        if (d.lat && d.lng) {
          // Round to 7 decimal places (~1cm accuracy, avoids floating-point noise)
          const latRounded = String(Math.round(d.lat * 1e7) / 1e7);
          const lngRounded = String(Math.round(d.lng * 1e7) / 1e7);
          forceField("hiking_trailhead_lat", latRounded);
          forceField("hiking_trailhead_lng", lngRounded);
          filled.push("trailhead coordinates");
        }

        // ── HIKING ENRICHMENT: fill trail detail fields via trickle-down + AI inference ──
        // Priority: NPS/OSM/BLM API data → AI-inferred from Google reviews → empty
        // Cache enrichment data for Stage 2 content generation
        if (d.hikingEnrichment) {
          setCachedHikingEnrichment(d.hikingEnrichment);
          const h = d.hikingEnrichment;
          const missingFields: string[] = [];

          // Helper: set a <select> element with case-insensitive value matching
          const forceSelect = (name: string, value: string | null | undefined) => {
            if (!value) return false;
            const el = form.elements.namedItem(name) as HTMLSelectElement | null;
            if (!el) return false;
            // Try exact match first
            const options = Array.from(el.options);
            const exact = options.find(o => o.value === value);
            if (exact) { el.value = exact.value; return true; }
            // Try case-insensitive match
            const lower = value.toLowerCase();
            const caseMatch = options.find(o => o.value.toLowerCase() === lower);
            if (caseMatch) { el.value = caseMatch.value; return true; }
            return false;
          };

          // Helper: set a checkbox element
          const forceCheckbox = (name: string, checked: boolean) => {
            const el = form.elements.namedItem(name) as HTMLInputElement | null;
            if (el) { el.checked = checked; return true; }
            return false;
          };

          // ── Distance ──
          if (h.distanceMiles) {
            forceField("hiking_distance_miles", String(h.distanceMiles));
            const distSrc = h.npsDistanceMiles ? "NPS" : h.usfsDistanceMiles ? "USFS" : h.blmDistanceMiles ? "BLM" : h.wikidataDistanceMiles ? "Wikidata" : h.osmDistanceMiles ? "OSM" : "data";
            filled.push(`distance (${distSrc})`);
          } else { missingFields.push("distance"); }

          // ── Elevation Gain (NPS → USGS → OSM ele tags) ──
          if (h.elevationGainFt) {
            forceField("hiking_elevation_gain_ft", String(h.elevationGainFt));
            const src = h.npsElevationGainFt ? "NPS" : h.usgsEstimatedGainFt ? "USGS" : h.osmElevationGainFt ? "OSM" : "data";
            filled.push(`elevation gain (${src})`);
          } else { missingFields.push("elevation gain"); }

          // ── Difficulty (OSM sac_scale) ──
          if (h.difficulty) {
            if (forceSelect("hiking_difficulty", h.difficulty)) {
              filled.push("difficulty");
            } else { missingFields.push("difficulty (value mismatch)"); }
          } else { missingFields.push("difficulty"); }

          // ── Estimated Time (NPS duration) ──
          if (h.estimatedTime) {
            forceField("hiking_estimated_time", h.estimatedTime);
            filled.push("estimated time");
          } else { missingFields.push("estimated time"); }

          // ── Trail Type (OSM geometry) ──
          if (h.trailType) {
            if (forceSelect("hiking_trail_type", h.trailType)) {
              filled.push("trail type");
            } else { missingFields.push("trail type (value mismatch)"); }
          } else { missingFields.push("trail type"); }

          // ── Season (NPS → USFS — resolved in trickle-down) ──
          let seasonFilled = false;
          if (h.seasonStart || h.seasonEnd) {
            if (h.seasonStart) forceSelect("hiking_season_start", h.seasonStart);
            if (h.seasonEnd) forceSelect("hiking_season_end", h.seasonEnd);
            const src = h.npsSeason?.length ? "NPS" : h.usfsSeasonStart ? "USFS" : "data";
            filled.push(`season (${src})`);
            seasonFilled = true;
          } else if (h.npsSeason && h.npsSeason.length > 0) {
            const seasonMonths = mapSeasonsToMonths(h.npsSeason);
            if (seasonMonths.start) forceField("hiking_season_start", seasonMonths.start);
            if (seasonMonths.end) forceField("hiking_season_end", seasonMonths.end);
            if (seasonMonths.start || seasonMonths.end) { filled.push("season (NPS)"); seasonFilled = true; }
          }
          if (!seasonFilled) { missingFields.push("season"); }

          // ── Shade Level — no structured API source, always requires manual input ──
          missingFields.push("shade level");

          // ── Entry Requirement (RIDB) ──
          if (h.permitRequired !== undefined) {
            const entryVal = h.permitRequired ? "permit" : "none";
            forceSelect("hiking_entry_requirement", entryVal);
            setHikingEntryReq(entryVal);
            filled.push("entry requirement");
          } else { missingFields.push("entry requirement"); }

          // ── Permit Info (RIDB description) ──
          if (h.permitInfo) {
            setTimeout(() => {
              const permitInfoEl = form.elements.namedItem("hiking_permit_info") as HTMLTextAreaElement | null;
              if (permitInfoEl) permitInfoEl.value = h.permitInfo!;
            }, 100);
            filled.push("permit details");
          }

          // ── Dog Policy (NPS → OSM dog tag — resolved in trickle-down) ──
          if (h.dogsAllowed !== undefined) {
            // Map the boolean + OSM dog tag to the new policy values
            let dogVal = "not_allowed";
            if (h.dogsAllowed) {
              // Check if OSM provided a specific policy (e.g., "leashed")
              dogVal = h.osmDogPolicy === "no" ? "not_allowed" : h.osmDogPolicy === "yes" ? "off_leash" : "on_leash";
            }
            forceSelect("hiking_dog_policy", dogVal);
            const src = h.npsPetsPermitted ? "NPS" : h.osmDogPolicy ? "OSM" : "data";
            filled.push(`dog policy (${src})`);
          } else { missingFields.push("dog policy"); }

          // ── Water Available (OSM drinking_water) ──
          if (h.waterAvailable !== undefined) {
            forceCheckbox("hiking_water_available", h.waterAvailable);
            const src = h.osmDrinkingWater ? "OSM" : "data";
            filled.push(`water available (${src})`);
          } else { missingFields.push("water available"); }

          // ── Kid Friendly — no structured API source, always requires manual input ──
          missingFields.push("kid friendly");

          // ── Surface Type (OSM → BLM → USFS — resolved in trickle-down) ──
          if (h.surfaceType) {
            forceField("hiking_surface_type", h.surfaceType);
            const src = h.osmSurface ? "OSM" : h.blmSurface ? "BLM" : h.usfsSurface ? "USFS" : "data";
            filled.push(`surface type (${src})`);
          } else { missingFields.push("surface type"); }

          // Persist which data sources contributed
          if (h.dataSources && h.dataSources.length > 0) {
            setHikingDataSources(h.dataSources.join(","));
          }

          // Store missing fields for diagnostic messages
          (d as any)._missingFields = missingFields;
        }
      }

      // ── Per-section status messages ──
      if (scope === "trail") {
        const sources = d.hikingEnrichment?.dataSources?.length > 0
          ? ` (via ${d.hikingEnrichment.dataSources.join(" + ")})`
          : "";
        const missingFields: string[] = (d as any)._missingFields || [];
        let statusMsg = "";
        let statusType: "success" | "warn" | "info" = "success";

        if (filled.length > 0) {
          statusMsg = `✓ Filled: ${filled.join(", ")}${sources}.`;
        }
        if (missingFields.length > 0) {
          const missingNote = `\n⚠ Manual input needed: ${missingFields.join(", ")} — not available from trail databases.`;
          statusMsg += missingNote;
          statusType = filled.length > 0 ? "warn" : "warn";
          if (filled.length === 0) {
            statusMsg = `This trail was not found in NPS, OSM, BLM, USFS, or Wikidata databases.${missingNote}`;
          }
        }
        if (statusMsg) {
          statusMsg += " Review and save.";
        } else {
          statusMsg = "This trail was not found in any trail database. All fields require manual input.";
          statusType = "warn";
        }

        updateSectionStatus("trail", statusMsg, statusType);
      } else if (scope === "google") {
        const amenityNote = d.amenitiesLinked > 0 ? ` + ${d.amenitiesLinked} amenities auto-linked` : "";
        updateSectionStatus("source", filled.length > 0 ? `Pulled from Google: ${filled.join(", ")}${amenityNote}. Review and save.` : "Google data refreshed.", "success");
      }

      // Revalidate publish check after fields are filled
      setTimeout(() => revalidatePublishCheck(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidatePublishCheck, updateSectionStatus]);

  // When auto-populate data comes back from scoped fetcher (google/trail)
  useEffect(() => {
    if (!scopedFetcher.data || scopedFetcher.data === lastProcessedScopedFetcher.current) return;
    lastProcessedScopedFetcher.current = scopedFetcher.data;
    processAutoPopulate(scopedFetcher.data);
  }, [scopedFetcher.data, processAutoPopulate]);

  // When AI-generated content comes back from content fetcher (Stage 2)
  useEffect(() => {
    if (!contentFetcher.data || contentFetcher.data === lastProcessedContentFetcher.current) return;
    lastProcessedContentFetcher.current = contentFetcher.data;

    const data = contentFetcher.data as any;
    if (data?.error) {
      updateSectionStatus("content", `Error: ${data.error}`, "error", 6000);
      return;
    }
    if (data?.generatedContent) {
      const c = data.generatedContent;
      const filled: string[] = [];
      if (c.description) {
        const html = c.description.includes("<p>")
          ? c.description
          : c.description
              .split(/\n\n+/)
              .filter((p: string) => p.trim())
              .map((p: string) => `<p>${p.trim()}</p>`)
              .join("");
        setDescriptionValue(html);
        setContentVersion((v) => v + 1);
        setDescWordCount(countWords(html));
        filled.push("description");
      }
      if (c.tagline) {
        setTaglineValue(c.tagline);
        filled.push("tagline");
      }
      if (c.priceRange) {
        const form = formRef.current;
        if (form) {
          const el = form.elements.namedItem("price_range") as HTMLSelectElement | null;
          if (el && (!el.value || el.value === "")) el.value = c.priceRange;
        }
        filled.push("price range (AI estimate)");
      }
      updateSectionStatus("content", `✨ Generated: ${filled.join(", ")}. Review and save.`, "success");
      setTimeout(() => revalidatePublishCheck(), 100);
    }
  }, [contentFetcher.data, updateSectionStatus, revalidatePublishCheck]);

  const handleAutoPopulate = (scope: "trail" | "google") => {
    const form = formRef.current;
    if (!form) return;

    const placeIdEl = form.elements.namedItem("google_place_id") as HTMLInputElement;
    const placeId = placeIdEl?.value;

    if (!placeId) {
      const errorSection = scope === "google" ? "source" : scope;
      updateSectionStatus(errorSection, "Enter a Google Place ID first.", "warn", 4000);
      return;
    }

    populateScopeRef.current = scope;

    scopedFetcher.submit(
      {
        intent: "auto-populate",
        google_place_id: placeId,
        populate_scope: scope,
        listing_type: typeValue,
        listing_name: nameValue,
      },
      { method: "post" }
    );
  };

  const isPopulatingScoped = scopedFetcher.state !== "idle";
  const isGeneratingContent = contentFetcher.state !== "idle";
  const isPopulating = isPopulatingScoped || isGeneratingContent;

  const handleGenerateContent = () => {
    const form = formRef.current;
    if (!form) return;

    const placeIdEl = form.elements.namedItem("google_place_id") as HTMLInputElement;
    const placeId = placeIdEl?.value;

    if (!placeId) {
      updateSectionStatus("content", "Enter a Google Place ID first.", "warn", 4000);
      return;
    }

    // Read current form field values (user may have corrected them)
    const getVal = (name: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      return el?.value || "";
    };
    const getChecked = (name: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      return el ? String(el.checked) : "";
    };

    const formPayload: Record<string, string> = {
      intent: "generate-content",
      google_place_id: placeId,
      listing_name: nameValue,
      listing_type: typeValue,
      city: getVal("city"),
      state: getVal("state"),
    };

    // Include hiking fields if applicable
    if (typeValue === "hiking") {
      formPayload.distance_miles = getVal("hiking_distance_miles");
      formPayload.elevation_gain_ft = getVal("hiking_elevation_gain_ft");
      formPayload.difficulty = getVal("hiking_difficulty");
      formPayload.estimated_time = getVal("hiking_estimated_time");
      formPayload.trail_type = getVal("hiking_trail_type");
      formPayload.season_start = getVal("hiking_season_start");
      formPayload.season_end = getVal("hiking_season_end");
      const dogPol = getVal("hiking_dog_policy");
      formPayload.dog_policy = dogPol;
      formPayload.dogs_allowed = dogPol === "on_leash" || dogPol === "off_leash" ? "true" : "false";
      formPayload.water_available = getChecked("hiking_water_available");
      const entryReq = getVal("hiking_entry_requirement");
      formPayload.entry_requirement = entryReq;
      formPayload.permit_required = entryReq === "permit" ? "true" : "false";
      formPayload.surface_type = getVal("hiking_surface_type");
      // Include cached hiking enrichment from Stage 1 (for NPS/OSM/API context)
      if (cachedHikingEnrichment) {
        formPayload.hiking_enrichment = JSON.stringify(cachedHikingEnrichment);
      }
    }

    contentFetcher.submit(formPayload, { method: "post" });
  };

  const handleSeoAiGenerate = async (field: "title" | "description") => {
    if (!nameValue) return;
    setSeoAiLoading(field);
    try {
      const form = formRef.current;
      const cityVal = form ? (form.elements.namedItem("city") as HTMLInputElement)?.value : "";
      const catEl = form ? (form.elements.namedItem("category_id") as HTMLSelectElement) : null;
      const catLabel = catEl?.selectedOptions?.[0]?.textContent?.trim() || "";

      const res = await fetch("/api/ai-seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          name: nameValue,
          pageType: "listing",
          slug: slugValue,
          description: descriptionValue,
          tagline: taglineValue,
          category: catLabel,
          city: cityVal,
          listingType: typeValue,
          focusKeyphrase: focusKeyphrase || undefined,
          currentMetaTitle: metaTitle || undefined,
          currentMetaDescription: metaDescription || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        if (field === "title" && data.metaTitle) setMetaTitle(data.metaTitle);
        if (field === "description" && data.metaDescription) setMetaDescription(data.metaDescription);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setSeoAiLoading(null);
    }
  };

  const handleAiKeyphrase = async () => {
    if (!descriptionValue || keyphraseAiLoading) return;
    setKeyphraseAiLoading(true);
    try {
      const res = await fetch("/api/ai-keyphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml: descriptionValue,
          contentType: "listing",
          title: nameValue,
          slug: slugValue,
          excludeId: listing?.id || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.keyphrase) {
        setFocusKeyphrase(data.keyphrase);
      }
    } catch {
      alert("AI keyphrase suggestion failed. Please try again.");
    } finally {
      setKeyphraseAiLoading(false);
    }
  };

  return (
    <div className="max-w-6xl px-6 pt-5 pb-8">
      {/* Save success toast */}
      {showSaveToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Changes saved successfully</span>
        </div>
      )}
      {(actionData as any)?.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {(actionData as any).error}
        </div>
      )}

      <Form method="post" ref={formRef} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
        {/* Hidden listing-level coordinates (for map & ETA on public page) */}
        <input type="hidden" name="lat" defaultValue={listing?.lat ?? ""} />
        <input type="hidden" name="lng" defaultValue={listing?.lng ?? ""} />
        {/* ═══════════════ LEFT COLUMN — Content sections ═══════════════ */}
        <div className="space-y-8 min-w-0">

        {/* Breadcrumb + Back link */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
            <Link to="/admin/dashboard" className="hover:text-primary flex-shrink-0">Admin</Link>
            <span>/</span>
            <Link to="/admin/listings" className="hover:text-primary flex-shrink-0">Listings</Link>
            {!isNew && listing?.type && (
              <>
                <span>/</span>
                <Link to={`/admin/listings?type=${listing.type}`} className="hover:text-primary capitalize flex-shrink-0">{listing.type}</Link>
              </>
            )}
            <span>/</span>
            <span className="truncate max-w-[300px]">{isNew ? "New Listing" : listing?.name || "Edit"}</span>
          </div>
          <Link to="/admin/listings" className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0 whitespace-nowrap">
            &larr; Back to Listings
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-dark min-w-0 truncate">
          {isNew ? "Create New Listing" : `Edit: ${listing?.name}`}
        </h1>

        {/* Listing Type */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-dark mb-4">Listing Type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {LISTING_TYPES.map(type => (
              <label key={type} className="relative cursor-pointer min-w-0">
                <input
                  type="radio"
                  name="type"
                  value={type}
                  className="peer sr-only"
                  defaultChecked={listing ? listing.type === type : type === "dining"}
                  onChange={(e) => { setTypeValue(e.target.value as ListingType); revalidatePublishCheck(); }}
                />
                <div className="min-h-[44px] px-3 py-2 border-2 border-gray-200 rounded-lg text-center text-sm font-medium capitalize leading-tight flex items-center justify-center w-full min-w-0 whitespace-normal break-words peer-checked:border-primary peer-checked:bg-red-50 peer-checked:text-primary transition-colors hover:border-gray-300">
                  {type}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Source & Location */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-dark">Source & Location</h2>
            <button
              type="button"
              onClick={() => handleAutoPopulate("google")}
              disabled={isPopulating}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isPopulatingScoped && populateScopeRef.current === "google"
                  ? "bg-gray-200 text-gray-500 cursor-wait"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              }`}
            >
              {isPopulatingScoped && populateScopeRef.current === "google" ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Pulling...
                </>
              ) : (
                "Pull from Google"
              )}
            </button>
          </div>
          <SectionStatusBanner section="source" />
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Place ID</label>
              <input
                type="text"
                name="google_place_id"
                defaultValue={listing?.google_place_id || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary font-mono text-sm"
                placeholder="ChIJ..."
                onChange={revalidatePublishCheck}
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter a Google Place ID and click <strong>Pull from Google</strong> to fill in name, address, phone, and other details.
                Find Place IDs at{" "}
                <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Google's Place ID Finder
                </a>.
              </p>
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  name="has_no_google_place_id"
                  defaultChecked={listing?.has_no_google_place_id || false}
                  onChange={revalidatePublishCheck}
                  className="rounded border-gray-300"
                />
                <span>No Google Place ID available</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={listing?.name || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder="e.g. Oscar's Cafe"
                onChange={(e) => { setNameValue(e.target.value); revalidatePublishCheck(); }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                name="slug"
                defaultValue={listing?.slug || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-500"
                placeholder="auto-generated-from-name"
                onChange={(e) => setSlugValue(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank to auto-generate from name.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  name="category_id"
                  defaultValue={listing?.category_id?.toString() || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-primary"
                  onChange={revalidatePublishCheck}
                >
                  <option value="">Select a category</option>
                  {Object.entries(categoryGroups).sort(([a], [b]) => a.localeCompare(b)).map(([type, cats]) => (
                    <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                      {[...cats].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((cat: any) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
                <select
                  name="price_range"
                  defaultValue={listing?.price_range || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-primary"
                >
                  <option value="">Select price range</option>
                  <option value="free">Free</option>
                  <option value="$">$ &mdash; Budget</option>
                  <option value="$$">$$ &mdash; Moderate</option>
                  <option value="$$$">$$$ &mdash; Upscale</option>
                  <option value="$$$$">$$$$ &mdash; Premium</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                name="location_id"
                defaultValue={listing?.location_id?.toString() || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:border-primary"
                onChange={revalidatePublishCheck}
              >
                <option value="">Select town/area</option>
                {[...(locations as any[])].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((loc: any) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                name="address"
                defaultValue={listing?.address || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder="123 Main Street"
                onChange={revalidatePublishCheck}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  name="city"
                  defaultValue={listing?.city || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  onChange={revalidatePublishCheck}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  name="state"
                  defaultValue={listing?.state || "UT"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input
                  type="text"
                  name="zip"
                  defaultValue={listing?.zip || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  defaultValue={listing?.phone || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="435-772-3232"
                  onChange={revalidatePublishCheck}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    name="has_no_phone"
                    defaultChecked={listing?.has_no_phone || false}
                    onChange={revalidatePublishCheck}
                    className="rounded border-gray-300"
                  />
                  <span>Has no phone number</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  defaultValue={listing?.email || ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                name="website"
                value={websiteValue}
                onChange={(e) => setWebsiteValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder="https://"
              />
            </div>
          </div>
        </div>

        {/* Trail Information — for hiking listings */}
        {typeValue === "hiking" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark">Trail Information</h2>
              <button
                type="button"
                onClick={() => handleAutoPopulate("trail")}
                disabled={isPopulating}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isPopulatingScoped && populateScopeRef.current === "trail"
                    ? "bg-gray-200 text-gray-500 cursor-wait"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                }`}
              >
                {isPopulatingScoped && populateScopeRef.current === "trail" ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Pulling...
                  </>
                ) : (
                  "Pull Trail Data"
                )}
              </button>
            </div>
            <SectionStatusBanner section="trail" />

            {/* Row 1: Core stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Distance (miles)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name="hiking_distance_miles"
                    defaultValue={hikingDetails?.distance_miles ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="Min"
                  />
                  <span className="text-gray-400 text-sm flex-shrink-0">–</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name="hiking_distance_miles_max"
                    defaultValue={hikingDetails?.distance_miles_max ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="Max"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave max empty for exact distance</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Elevation Gain (ft)</label>
                <input
                  type="number"
                  name="hiking_elevation_gain_ft"
                  defaultValue={hikingDetails?.elevation_gain_ft ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="e.g., 1488"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                <select
                  name="hiking_difficulty"
                  defaultValue={hikingDetails?.difficulty ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">—</option>
                  <option value="easy">Easy</option>
                  <option value="moderate">Moderate</option>
                  <option value="hard">Hard</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Est. Time</label>
                <input
                  type="text"
                  name="hiking_estimated_time"
                  defaultValue={hikingDetails?.estimated_time ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="e.g., 3-5 hours"
                />
              </div>
            </div>

            {/* Row 2: Trail type, season, shade */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trail Type</label>
                <select
                  name="hiking_trail_type"
                  defaultValue={hikingDetails?.trail_type ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">—</option>
                  <option value="out_and_back">Out &amp; Back</option>
                  <option value="loop">Loop</option>
                  <option value="point_to_point">Point to Point</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Season Start</label>
                <select
                  name="hiking_season_start"
                  defaultValue={hikingDetails?.season_start ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">—</option>
                  <option value="January">January</option>
                  <option value="February">February</option>
                  <option value="March">March</option>
                  <option value="April">April</option>
                  <option value="May">May</option>
                  <option value="June">June</option>
                  <option value="July">July</option>
                  <option value="August">August</option>
                  <option value="September">September</option>
                  <option value="October">October</option>
                  <option value="November">November</option>
                  <option value="December">December</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Season End</label>
                <select
                  name="hiking_season_end"
                  defaultValue={hikingDetails?.season_end ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">—</option>
                  <option value="January">January</option>
                  <option value="February">February</option>
                  <option value="March">March</option>
                  <option value="April">April</option>
                  <option value="May">May</option>
                  <option value="June">June</option>
                  <option value="July">July</option>
                  <option value="August">August</option>
                  <option value="September">September</option>
                  <option value="October">October</option>
                  <option value="November">November</option>
                  <option value="December">December</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shade Level</label>
                <select
                  name="hiking_shade_level"
                  defaultValue={hikingDetails?.shade_level ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                >
                  <option value="">—</option>
                  <option value="Full Sun">Full Sun</option>
                  <option value="Partial Shade">Partial Shade</option>
                  <option value="Mostly Shaded">Mostly Shaded</option>
                  <option value="Full Shade">Full Shade</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Surface Type</label>
                <input
                  type="text"
                  name="hiking_surface_type"
                  defaultValue={hikingDetails?.surface_type ?? ""}
                  placeholder="e.g., rock, paved, gravel, dirt, native"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Row 3: Entry/Dogs dropdowns + checkboxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entry Requirement</label>
                <select
                  name="hiking_entry_requirement"
                  defaultValue={hikingDetails?.entry_requirement || "none"}
                  onChange={(e) => setHikingEntryReq(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white text-sm"
                >
                  <option value="none">No Permit or Fee</option>
                  <option value="entry_fee">Entry Fee Required</option>
                  <option value="permit">Permit Required</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dog Policy</label>
                <select
                  name="hiking_dog_policy"
                  defaultValue={hikingDetails?.dog_policy || "not_allowed"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white text-sm"
                >
                  <option value="not_allowed">Dogs Not Allowed</option>
                  <option value="on_leash">Dogs Allowed on Leash</option>
                  <option value="off_leash">Dogs Allowed Off Leash</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  name="hiking_water_available"
                  defaultChecked={hikingDetails?.water_available ?? false}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Water Available
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  name="hiking_kid_friendly"
                  defaultChecked={hikingDetails?.kid_friendly ?? false}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Kid Friendly
              </label>
            </div>

            {/* Permit/Fee Info (shown when entry_fee or permit) */}
            {hikingEntryReq !== "none" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {hikingEntryReq === "entry_fee" ? "Fee Details" : "Permit Info"}
                </label>
                <textarea
                  name="hiking_permit_info"
                  rows={3}
                  defaultValue={hikingDetails?.permit_info ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="Details about permit requirements, how to obtain permits, seasonal availability, etc."
                />
              </div>
            )}

            {/* Trailhead Coordinates */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Trailhead Coordinates</h3>
              <p className="text-xs text-gray-500 mb-3">Auto-filled from Google Places when available. Use the address field in Source &amp; Location for the trailhead address.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    name="hiking_trailhead_lat"
                    defaultValue={hikingDetails?.trailhead_lat ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 37.2594"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    name="hiking_trailhead_lng"
                    defaultValue={hikingDetails?.trailhead_lng ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., -112.9508"
                  />
                </div>
              </div>
            </div>
            <input type="hidden" name="hiking_data_sources" value={hikingDataSources} />
          </div>
        )}

        {/* Park Information — for parks listings */}
        {typeValue === "parks" && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-dark">Park Information</h2>
            </div>

            {/* Entry Fees & Passes */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">$</span>
                Entry Fees &amp; Passes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entry Fee</label>
                  <input
                    type="text"
                    name="park_entry_fee"
                    defaultValue={parkDetails?.entry_fee ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., $35/vehicle, $20/person, Free"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      name="park_annual_pass_accepted"
                      defaultChecked={parkDetails?.annual_pass_accepted ?? false}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Annual Pass Accepted
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fee-Free Info</label>
                  <input
                    type="text"
                    name="park_fee_free_info"
                    defaultValue={parkDetails?.fee_free_info ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., Fee-free on MLK Day, National Park Week"
                  />
                </div>
              </div>
            </div>

            {/* Operating Info */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs">&#128336;</span>
                Operating Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Park Hours</label>
                  <input
                    type="text"
                    name="park_park_hours"
                    defaultValue={parkDetails?.park_hours ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 24 hours, Dawn to dusk"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visitor Center Hours</label>
                  <input
                    type="text"
                    name="park_visitor_center_hours"
                    defaultValue={parkDetails?.visitor_center_hours ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 9am-5pm daily, closed winter"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seasonal Closure</label>
                <textarea
                  name="park_seasonal_closure"
                  rows={2}
                  defaultValue={parkDetails?.seasonal_closure ?? ""}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                  placeholder="Details about seasonal closures, road closures, etc."
                />
              </div>
            </div>

            {/* Park Stats */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs">&#128202;</span>
                Park Stats
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Elevation (ft)</label>
                  <input
                    type="number"
                    name="park_elevation_ft"
                    defaultValue={parkDetails?.elevation_ft ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 5000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Acreage</label>
                  <input
                    type="number"
                    name="park_acreage"
                    defaultValue={parkDetails?.acreage ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 148733"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year Established</label>
                  <input
                    type="number"
                    name="park_year_established"
                    defaultValue={parkDetails?.year_established ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="e.g., 1919"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Governing Agency</label>
                  <select
                    name="park_governing_agency"
                    defaultValue={parkDetails?.governing_agency ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="">—</option>
                    <option value="NPS">NPS (National Park Service)</option>
                    <option value="BLM">BLM (Bureau of Land Management)</option>
                    <option value="USFS">USFS (Forest Service)</option>
                    <option value="State">State Park</option>
                    <option value="County">County Park</option>
                    <option value="City">City Park</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Visitor Facilities */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs">&#9978;</span>
                Visitor Facilities
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_visitor_center" defaultChecked={parkDetails?.has_visitor_center ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Visitor Center
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_campgrounds" defaultChecked={parkDetails?.has_campgrounds ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Campgrounds
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_scenic_drives" defaultChecked={parkDetails?.has_scenic_drives ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Scenic Drives
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_restrooms" defaultChecked={parkDetails?.has_restrooms ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Restrooms
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_wheelchair_access" defaultChecked={parkDetails?.has_wheelchair_access ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Wheelchair Access
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_has_cell_service" defaultChecked={parkDetails?.has_cell_service ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Cell Service
                </label>
              </div>
            </div>

            {/* Access & Season */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs">&#128694;</span>
                Access &amp; Season
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entry Requirement</label>
                  <select
                    name="park_entry_requirement"
                    defaultValue={parkDetails?.entry_requirement || "none"}
                    onChange={(e) => setParkEntryReq(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white text-sm"
                  >
                    <option value="none">No Permit or Fee</option>
                    <option value="entry_fee">Entry Fee Required</option>
                    <option value="permit">Permit Required</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dog Policy</label>
                  <select
                    name="park_dog_policy"
                    defaultValue={parkDetails?.dog_policy || "not_allowed"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white text-sm"
                  >
                    <option value="not_allowed">Dogs Not Allowed</option>
                    <option value="on_leash">Dogs Allowed on Leash</option>
                    <option value="off_leash">Dogs Allowed Off Leash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Season Start</label>
                  <select
                    name="park_season_start"
                    defaultValue={parkDetails?.season_start ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="">—</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Season End</label>
                  <select
                    name="park_season_end"
                    defaultValue={parkDetails?.season_end ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                  >
                    <option value="">—</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_water_available" defaultChecked={parkDetails?.water_available ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Water Available
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="park_kid_friendly" defaultChecked={parkDetails?.kid_friendly ?? false} className="rounded border-gray-300 text-primary focus:ring-primary" />
                  Kid Friendly
                </label>
              </div>
            </div>

            {/* Special Notices */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs">&#9888;</span>
                Special Notices
              </h3>
              <textarea
                name="park_notices"
                rows={3}
                defaultValue={parkDetails?.notices ?? ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder="Flash flood risks, traffic congestion, special regulations, accessibility notes, etc."
              />
            </div>

            <input type="hidden" name="park_data_sources" value={parkDataSources} />
          </div>
        )}

        {/* AI Content */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-dark">AI Content</h2>
            <button
              type="button"
              onClick={handleGenerateContent}
              disabled={isPopulating}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isGeneratingContent
                  ? "bg-gray-200 text-gray-500 cursor-wait"
                  : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
              }`}
            >
              {isGeneratingContent ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                "Generate Content"
              )}
            </button>
          </div>
          <SectionStatusBanner section="content" />
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
              <input
                type="text"
                name="tagline"
                value={taglineValue}
                onChange={(e) => setTaglineValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder="A short, catchy description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="hidden" name="description" value={descriptionValue} />
              <Suspense
                fallback={
                  <textarea
                    rows={10}
                    defaultValue={descriptionValue}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    placeholder="Loading editor..."
                    readOnly
                  />
                }
              >
                <RichTextEditor
                  content={descriptionValue}
                  onChange={(html) => {
                    setDescriptionValue(html);
                    const plainText = html.replace(/<[^>]*>/g, " ");
                    setDescWordCount(countWords(plainText));
                    revalidatePublishCheck();
                  }}
                  contentVersion={contentVersion}
                  placeholder="Write a detailed description of this listing..."
                />
              </Suspense>
              <p className="text-xs mt-1">
                <span className={descWordCount < 150 ? "text-amber-600 font-medium" : "text-emerald-600 font-medium"}>
                  {descWordCount} words
                </span>
                <span className="text-gray-400"> &mdash; minimum 150 words to publish</span>
              </p>
            </div>

            {/* Readability — right after description for easy editing */}
            <ReadabilityScorecard
              bodyHtml={descriptionValue}
              contentType="listing"
              onAiImprove={(improvedHtml) => {
                setDescriptionValue(improvedHtml);
                setContentVersion((v) => v + 1);
              }}
            />
          </div>
        </div>

        {/* Images */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-dark mb-4">Images</h2>
          <input type="hidden" name="featured_image" value={featuredImage || ""} />
          <input type="hidden" name="gallery" value={JSON.stringify(gallery)} />
          <div className="space-y-6">
            <ImageUploader
              value={featuredImage}
              onChange={setFeaturedImage}
              label="Featured Image"
              hint="This image appears in search results, directory cards, and the listing hero."
            />
            <GalleryUploader
              value={gallery}
              onChange={setGallery}
            />
          </div>
        </div>

        {/* SEO Settings */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <input type="hidden" name="meta_title" value={metaTitle} />
          <input type="hidden" name="meta_description" value={metaDescription} />
          <input type="hidden" name="focus_keyphrase" value={focusKeyphrase} />
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-dark">SEO Settings</h2>
          </div>
          <div className="px-6 pb-6 space-y-4 pt-4">
              {/* 1. Focus Keyphrase */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-white border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-800">Focus Keyphrase</span>
                </div>
                <div className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={focusKeyphrase}
                      onChange={(e) => setFocusKeyphrase(e.target.value)}
                      placeholder="e.g. zion national park lodging"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAiKeyphrase}
                      disabled={keyphraseAiLoading || !descriptionValue}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
                      title="AI-suggest a focus keyphrase based on your content and keyword research"
                    >
                      {keyphraseAiLoading ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                      )}
                      AI Suggest
                    </button>
                  </div>
                  {!focusKeyphrase.trim() && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      Enter a keyphrase or let AI suggest one based on your content and keyword research.
                    </p>
                  )}
                </div>
              </div>

              {/* 2. Meta Information */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-white border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-800">Meta Information</span>
                </div>
                <div className="px-4 py-4 space-y-4">
                  <p className="text-xs text-gray-500">
                    Override the default title and description used in search engine results and social media shares. Leave blank to use the listing name and tagline as defaults.
                  </p>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-xs font-medium text-gray-500">Meta Title</label>
                      <button
                        type="button"
                        onClick={() => handleSeoAiGenerate("title")}
                        disabled={seoAiLoading === "title" || !nameValue}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="AI-generate SEO meta title"
                      >
                        {seoAiLoading === "title" ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                        )}
                        AI Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                      placeholder="Defaults to listing name"
                      maxLength={500}
                    />
                    <SeoMeter value={metaTitle} field="title" pageContent={nameValue} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-xs font-medium text-gray-500">Meta Description</label>
                      <button
                        type="button"
                        onClick={() => handleSeoAiGenerate("description")}
                        disabled={seoAiLoading === "description" || !nameValue}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="AI-generate SEO meta description"
                      >
                        {seoAiLoading === "description" ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                        )}
                        AI Generate
                      </button>
                    </div>
                    <textarea
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary bg-white"
                      placeholder="Defaults to listing tagline"
                      maxLength={1000}
                    />
                    <SeoMeter
                      value={metaDescription}
                      field="description"
                      pageContent={nameValue + " " + descriptionValue}
                    />
                  </div>
                </div>
              </div>

              {/* 3. SEO Analysis Scorecard */}
              <SeoScorecard
                focusKeyphrase={focusKeyphrase}
                metaTitle={metaTitle}
                metaDescription={metaDescription}
                slug={slugValue}
                bodyHtml={descriptionValue}
                contentType="listing"
                featuredImage={featuredImage || undefined}
                featuredImageAlt={featuredImageAlt || undefined}
                websiteUrl={websiteValue}
                duplicateKeyphrases={duplicateKeyphrases}
              />

              {/* 4. Search & Social Previews */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-white border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-800">Search & Social Preview</span>
                </div>
                <div className="px-4 py-4 space-y-4">
                  <SerpPreview
                    title={applyTitleTemplate(metaTitle || nameValue || "", rootData?.settings?.title_template || "%page_title%")}
                    url={getListingUrl(typeValue, slugValue)}
                    description={metaDescription || taglineValue}
                    image={featuredImage}
                    siteName={rootData?.settings?.site_title || siteConfig.siteName}
                    favicon={rootData?.settings?.favicon_url || null}
                  />
                  <SocialPreview
                    title={metaTitle || nameValue}
                    description={metaDescription || taglineValue}
                    image={featuredImage}
                    url={getListingUrl(typeValue, slugValue)}
                  />
                </div>
              </div>
          </div>
        </div>

        </div>{/* END left column */}

        {/* ═══════════════ RIGHT COLUMN — Sticky Publishing Sidebar ═══════════════ */}
        <div className="lg:sticky lg:top-[60px] lg:max-h-[calc(100vh-76px)] lg:overflow-y-auto space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
            {/* View Live / Status badge */}
            <div className="flex items-center justify-between gap-2">
              {!isNew && listing?.slug && listing?.type ? (
                <a
                  href={`${getListingPath(listing.type, listing.slug)}${listing.status !== "published" ? "?preview=true" : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-full hover:bg-gray-50 hover:text-primary transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {listing.status === "published" ? "View Live" : "Preview"}
                </a>
              ) : <span />}
              {!isNew && listing?.status && (
                <span
                  className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize ${
                    listing.status === "published"
                      ? "bg-green-100 text-green-700"
                      : listing.status === "pending"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {listing.status}
                </span>
              )}
            </div>

            {/* Save / Update buttons */}
            <div className="flex gap-2">
              <button
                type="submit"
                name="status"
                value="draft"
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Save Draft
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                {isNew ? "Create" : "Update"}
              </button>
            </div>

            {/* Status & Featured */}
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue={listing?.status || "draft"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="pending">Pending Review</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_featured"
                  defaultChecked={listing?.is_featured || false}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Featured listing</span>
              </label>
            </div>

            {/* Publish Requirements Checklist */}
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Publish Checklist</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  publishCheck.canPublish
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {publishCheck.metCount}/{publishCheck.totalCount}
                </span>
              </div>
              <ul className="space-y-1.5">
                {publishCheck.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 flex-shrink-0 ${check.met ? "text-emerald-500" : "text-gray-300"}`}>
                      {check.met ? "\u2713" : "\u25CB"}
                    </span>
                    <span className={check.met ? "text-gray-600" : "text-gray-500"}>
                      {check.label}
                      {!check.met && (
                        <span className="text-xs text-amber-600 ml-1">
                          &mdash; {check.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {!publishCheck.canPublish && (
                <p className="mt-2 text-xs text-amber-600">
                  All requirements must be met before publishing.
                </p>
              )}
            </div>

            {!isNew && listing && deindexPreflight && (
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Search Cleanup</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      deindexDisabledReason
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {deindexDisabledReason ? "Locked" : "Ready"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Use this only when a stale result remains in Google or Bing after this listing was unpublished. It never changes listing status.
                </p>
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-gray-500">Public URL</span>
                    <span className="text-right break-all text-gray-700">{(deindexPreflight as any).url}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Anonymous response</span>
                    <span className="text-gray-700">{(deindexPreflight as any).publicStatusCode}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Robots</span>
                    <span className="text-gray-700">{(deindexPreflight as any).robotsDirective}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">In sitemap</span>
                    <span className="text-gray-700">{(deindexPreflight as any).inSitemap ? "Yes" : "No"}</span>
                  </div>
                </div>
                {(actionData as any)?.deindexRequest?.message && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      (actionData as any).deindexRequest.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {(actionData as any).deindexRequest.message}
                  </div>
                )}
                <button
                  type="submit"
                  name="intent"
                  value="request-deindex"
                  disabled={Boolean(deindexDisabledReason)}
                  onClick={(event) => {
                    if (deindexDisabledReason) return;
                    const ok = window.confirm(
                      `Request deindex for:\n${(deindexPreflight as any).url}\n\nThis listing is already non-public. This action only asks search engines to refresh and remove stale index entries. It will not publish, unpublish, or delete the listing.`
                    );
                    if (!ok) {
                      event.preventDefault();
                    }
                  }}
                  className="mt-3 w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Request Deindex
                </button>
                {deindexDisabledReason && (
                  <p className="mt-2 text-xs text-gray-500">{deindexDisabledReason}</p>
                )}
                {(recentDeindexRequests as any[]).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-gray-600">Recent requests</div>
                    <div className="space-y-2">
                      {(recentDeindexRequests as any[]).map((entry: any) => (
                        <div key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-700 capitalize">{entry.request_outcome}</span>
                            <span className="text-gray-400">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 text-gray-500">
                            {entry.requested_by_email || "Unknown admin"}
                          </div>
                          {entry.blocked_reason && (
                            <div className="mt-1 text-amber-700">{entry.blocked_reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Google Index Status Checker */}
            {!isNew && listing?.status === "published" && (
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Google Index</span>
                  {indexFetcher.data && (indexFetcher.data as any).success && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      (indexFetcher.data as any).verdict === "PASS"
                        ? "bg-emerald-100 text-emerald-700"
                        : (indexFetcher.data as any).verdict === "NEUTRAL" || (indexFetcher.data as any).verdict === "PARTIAL"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {(indexFetcher.data as any).verdict === "PASS"
                        ? "Indexed"
                        : (indexFetcher.data as any).coverageState || "Not indexed"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = getListingUrl(listing!.type, listing!.slug);
                    indexFetcher.load(`/api/url-inspection?url=${encodeURIComponent(url)}`);
                  }}
                  disabled={indexFetcher.state !== "idle"}
                  className="mt-2 w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {indexFetcher.state !== "idle" ? "Checking..." : "Check Index Status"}
                </button>
                {indexFetcher.data && !(indexFetcher.data as any).success && (
                  <p className="mt-2 text-xs text-red-500">
                    {(indexFetcher.data as any).error || "Check failed"}
                  </p>
                )}
                {indexFetcher.data && (indexFetcher.data as any).success && (indexFetcher.data as any).lastCrawlTime && (
                  <p className="mt-1 text-xs text-gray-400">
                    Last crawled: {new Date((indexFetcher.data as any).lastCrawlTime).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Photo Submissions */}
          {!isNew && listing && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Photo Submissions</span>
                {submittedPhotoCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                    {submittedPhotoCount} photo{submittedPhotoCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {(listing as any).submission_token ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${siteConfig.siteUrl}/submit-images/${(listing as any).submission_token}`}
                      className="flex-1 px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg truncate font-mono"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${siteConfig.siteUrl}/submit-images/${(listing as any).submission_token}`
                        );
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
                    >
                      {linkCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Send this link to the business owner. They can upload up to 10 photos.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">
                    Generate a unique link for the business to submit photos.
                  </p>
                  <button
                    type="submit"
                    name="intent"
                    value="generate-submission-token"
                    className="w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Generate Upload Link
                  </button>
                </div>
              )}
            </div>
          )}
        </div>{/* END right column */}
      </Form>
    </div>
  );
}
