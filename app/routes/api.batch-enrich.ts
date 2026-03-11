import type { Route } from "../+types/root";
import { requireApiAuth } from "../lib/auth.server";
import {
  batchEnrichListing,
  upsertBusinessHours,
  autoLinkAmenities,
  getCategories,
} from "~/lib/queries.server";
import { fetchPlaceDetailsForAutoPopulate } from "~/lib/google-places.server";

export async function action({ request }: Route.ActionArgs) {
  await requireApiAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "enrich-one") {
    const listingId = formData.get("listingId") as string;
    const googlePlaceId = formData.get("googlePlaceId") as string;

    if (!listingId || !googlePlaceId) {
      return Response.json({ success: false, error: "Missing listingId or googlePlaceId" });
    }

    try {
      const details = await fetchPlaceDetailsForAutoPopulate(googlePlaceId, { skipAI: true });
      if (!details) {
        return Response.json({ success: false, error: "Google API returned no data" });
      }

      const fieldsUpdated: string[] = [];

      // Resolve category
      let categoryId: number | null = null;
      if (details.suggestedCategorySlug) {
        const allCategories = await getCategories();
        const match = allCategories.find((c: any) => c.slug === details.suggestedCategorySlug);
        if (match) categoryId = match.id;
      }

      // Enrich listing (COALESCE — only fills gaps)
      await batchEnrichListing(listingId, {
        phone: details.phone || undefined,
        website: details.website || undefined,
        address: details.address || undefined,
        city: details.city || undefined,
        state: details.state || undefined,
        zip: details.zip || undefined,
        price_range: details.priceRange as any || undefined,
        avg_rating: details.rating || undefined,
        review_count: details.reviewCount || undefined,
        google_maps_uri: details.googleMapsUri || undefined,
        google_primary_type: details.googlePrimaryType || undefined,
        google_types: details.types || undefined,
        lat: details.lat as any,
        lng: details.lng as any,
      } as any);

      if (details.phone) fieldsUpdated.push("phone");
      if (details.website) fieldsUpdated.push("website");
      if (details.priceRange) fieldsUpdated.push("price");
      if (details.googleMapsUri) fieldsUpdated.push("maps_uri");
      if (details.googlePrimaryType) fieldsUpdated.push("primary_type");
      if (details.types?.length) fieldsUpdated.push("types");
      if (details.rating) fieldsUpdated.push("rating");

      // Business hours
      if (details.businessHours && details.businessHours.length > 0) {
        try {
          await upsertBusinessHours(listingId, details.businessHours);
          fieldsUpdated.push("hours");
        } catch {}
      }

      // Amenities
      let amenitiesLinked = 0;
      if (details.autoAmenities && details.autoAmenities.length > 0) {
        try {
          amenitiesLinked = await autoLinkAmenities(listingId, details.autoAmenities);
          if (amenitiesLinked > 0) fieldsUpdated.push(`${amenitiesLinked} amenities`);
        } catch {}
      }

      return Response.json({
        success: true,
        name: details.name,
        fieldsUpdated,
        amenitiesLinked,
        priceRange: details.priceRange,
      });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message || "Unknown error" });
    }
  }

  return Response.json({ error: "Unknown intent" });
}
