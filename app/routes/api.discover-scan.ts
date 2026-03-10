import type { Route } from "../+types/root";
import {
  getExistingGooglePlaceIds,
} from "~/lib/queries.server";
import {
  discoverPlaces,
} from "~/lib/google-places.server";
import { requireApiAuth } from "../lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  await requireApiAuth(request);

  const formData = await request.formData();
  const textQuery = formData.get("textQuery") as string;
  const lat = parseFloat(formData.get("lat") as string);
  const lng = parseFloat(formData.get("lng") as string);
  const radius = parseFloat(formData.get("radius") as string);
  const town = formData.get("town") as string;
  const pageToken = (formData.get("pageToken") as string) || undefined;
  const includedType = (formData.get("includedType") as string) || undefined;

  const existingIds = await getExistingGooglePlaceIds();
  const result = await discoverPlaces(textQuery, { lat, lng }, radius, pageToken, includedType);

  // Split results into new vs existing, keeping placeIds for both
  const newPlaces = [];
  const existingPlaceIds = [];

  for (const p of result.places) {
    if (!p.placeId) continue;
    if (existingIds.has(p.placeId)) {
      existingPlaceIds.push(p.placeId);
    } else {
      newPlaces.push({ ...p, town });
    }
  }

  return Response.json({
    places: newPlaces,
    existingPlaceIds,
    nextPageToken: result.nextPageToken,
    debug: result.debug || `raw=${result.places.length} new=${newPlaces.length}`,
  });
}
