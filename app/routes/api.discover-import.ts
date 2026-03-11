import type { Route } from "../+types/root";
import sql from "~/lib/db.server";
import {
  getCategories,
  createListing,
  upsertBusinessHours,
  autoLinkAmenities,
} from "~/lib/queries.server";
import {
  fetchPlaceDetailsForAutoPopulate,
} from "~/lib/google-places.server";
import { requireApiAuth } from "../lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  await requireApiAuth(request);

  const formData = await request.formData();
  const placeId = formData.get("placeId") as string;
  const listingType = formData.get("listingType") as string;
  const categorySlug = formData.get("categorySlug") as string;

  if (!placeId || !listingType) {
    return Response.json({ success: false, error: "Missing placeId or listingType" });
  }

  try {
    // Fetch full details from Google
    const details = await fetchPlaceDetailsForAutoPopulate(placeId, { skipAI: true });
    if (!details) {
      return Response.json({ success: false, error: "Google API returned no data" });
    }

    // Resolve category
    const slug = categorySlug || details.suggestedCategorySlug;
    let categoryId: number | null = null;
    if (slug) {
      const cats = await getCategories();
      const match = cats.find((c: any) => c.slug === slug);
      if (match) categoryId = match.id;
    }

    // Create slug from name, auto-dedup if slug already exists
    let nameSlug = (details.name || "listing")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // If a listing with this slug already exists, append city or a number
    const existingBySlug = await sql`SELECT id FROM listings WHERE slug = ${nameSlug} LIMIT 1`;
    if (existingBySlug.length > 0) {
      // Try appending the city name first (e.g., "escalante-river-trailhead-tropic")
      if (details.city) {
        const citySlug = details.city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const withCity = `${nameSlug}-${citySlug}`;
        const existsWithCity = await sql`SELECT id FROM listings WHERE slug = ${withCity} LIMIT 1`;
        if (existsWithCity.length === 0) {
          nameSlug = withCity;
        } else {
          // Fall back to numeric suffix
          for (let i = 2; i <= 10; i++) {
            const candidate = `${nameSlug}-${i}`;
            const exists = await sql`SELECT id FROM listings WHERE slug = ${candidate} LIMIT 1`;
            if (exists.length === 0) { nameSlug = candidate; break; }
          }
        }
      } else {
        for (let i = 2; i <= 10; i++) {
          const candidate = `${nameSlug}-${i}`;
          const exists = await sql`SELECT id FROM listings WHERE slug = ${candidate} LIMIT 1`;
          if (exists.length === 0) { nameSlug = candidate; break; }
        }
      }
    }

    // Create listing as draft
    const listing = await createListing({
      type: listingType as any,
      name: details.name,
      slug: nameSlug,
      tagline: details.tagline || null,
      description: details.description || null,
      category_id: categoryId as any,
      address: details.address,
      city: details.city,
      state: details.state || "UT",
      zip: details.zip,
      phone: details.phone,
      website: details.website,
      price_range: details.priceRange as any || null,
      status: "draft" as any,
      lat: details.lat as any,
      lng: details.lng as any,
      google_place_id: placeId,
      google_maps_uri: details.googleMapsUri,
      google_primary_type: details.googlePrimaryType,
      google_types: details.types,
      avg_rating: details.rating as any,
      review_count: details.reviewCount as any,
    } as any);

    // Business hours
    if (listing?.id && details.businessHours?.length > 0) {
      try {
        await upsertBusinessHours(listing.id, details.businessHours);
      } catch {}
    }

    // Amenities
    let amenitiesLinked = 0;
    if (listing?.id && details.autoAmenities?.length > 0) {
      try {
        amenitiesLinked = await autoLinkAmenities(listing.id, details.autoAmenities);
      } catch {}
    }

    return Response.json({
      success: true,
      listingId: listing.id,
      name: details.name,
      amenitiesLinked,
    });
  } catch (err: any) {
    // Handle unique slug constraint violation
    if (err.code === "23505" && err.message?.includes("slug")) {
      return Response.json({ success: false, error: "Listing with this name already exists (slug conflict)" });
    }
    return Response.json({ success: false, error: err.message || "Import failed" });
  }
}
