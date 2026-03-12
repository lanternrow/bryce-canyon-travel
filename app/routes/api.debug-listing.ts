import { getListingBySlug, getHikingDetails } from "~/lib/queries.server";
import { getGoogleReviewsForListing } from "~/lib/google-places.server";
import { buildMediaMetadata } from "~/lib/media-helpers.server";
import { getETAFromZion } from "~/lib/google-distance.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "parks";
  const slug = url.searchParams.get("slug") || "kodachrome-basin-state-park";

  const steps: Record<string, any> = {};

  try {
    steps.step1 = "getListingBySlug";
    const listing = await getListingBySlug(type, slug);
    steps.listing = listing ? { id: listing.id, name: listing.name, type: listing.type } : null;

    if (!listing) return Response.json({ steps, error: "Listing not found" });

    try {
      steps.step2 = "getHikingDetails";
      const hikingDetails = type === "hiking" ? await getHikingDetails(listing.id) : null;
      steps.hikingDetails = hikingDetails ? "found" : "null";
    } catch (e: any) {
      steps.hikingDetailsError = e.message;
    }

    try {
      steps.step3 = "getGoogleReviewsForListing";
      if (listing.google_place_id) {
        const cached = await getGoogleReviewsForListing(listing.id, listing.google_place_id);
        steps.googleReviews = cached ? "found" : "null";
      } else {
        steps.googleReviews = "no_place_id";
      }
    } catch (e: any) {
      steps.googleReviewsError = e.message;
    }

    try {
      steps.step4 = "buildMediaMetadata";
      const imageUrls: string[] = [];
      if (listing.featured_image) imageUrls.push(listing.featured_image);
      const mediaMetadata = await buildMediaMetadata(imageUrls);
      steps.mediaMetadata = "ok";
    } catch (e: any) {
      steps.mediaMetadataError = e.message;
    }

    try {
      steps.step5 = "getETAFromZion";
      if (listing.lat && listing.lng) {
        const eta = await getETAFromZion(Number(listing.lat), Number(listing.lng));
        steps.eta = eta || "null";
      } else {
        steps.eta = "no_coords";
      }
    } catch (e: any) {
      steps.etaError = e.message;
    }

    return Response.json({ success: true, steps });
  } catch (e: any) {
    return Response.json({ success: false, steps, error: e.message, stack: e.stack });
  }
}
