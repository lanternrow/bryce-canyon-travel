import type { Route } from "./+types/api.cron-refresh-hours";
import { getListingsWithGooglePlaceId, upsertBusinessHours } from "../lib/queries.server";
import { fetchBusinessHoursFromGoogle } from "../lib/google-places.server";

/**
 * CRON ENDPOINT: Refresh business hours from Google Places API.
 *
 * Iterates through all listings with a Google Place ID and fetches
 * their current business hours from Google. Updates the database.
 *
 * Secured with a CRON_SECRET token to prevent unauthorized access.
 * Designed to run on the 1st of every month via Railway cron.
 *
 * Usage: GET /api/cron/refresh-hours?token=YOUR_CRON_SECRET
 */
export async function loader({ request }: Route.LoaderArgs) {
  // Security: verify cron token
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const listings = await getListingsWithGooglePlaceId();

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const listing of listings) {
    try {
      const hours = await fetchBusinessHoursFromGoogle(listing.google_place_id);

      if (!hours || hours.length === 0) {
        skipped++;
        continue;
      }

      await upsertBusinessHours(listing.id, hours);
      updated++;

      // Rate limiting: wait 200ms between requests to be respectful of Google's API
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      failed++;
      errors.push(`${listing.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `[CRON] Hours refresh complete: ${updated} updated, ${skipped} skipped, ${failed} failed (${duration}s)`
  );

  return Response.json({
    success: true,
    total: listings.length,
    updated,
    skipped,
    failed,
    duration: `${duration}s`,
    errors: errors.length > 0 ? errors : undefined,
  });
}
