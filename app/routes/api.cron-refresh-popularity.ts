import type { Route } from "./+types/api.cron-refresh-popularity";
import { refreshBlogPopularityFromGA4 } from "../lib/blog-popularity.server";
import { refreshListingPopularityFromGA4 } from "../lib/listing-popularity.server";

/**
 * CRON ENDPOINT: Refresh listing + blog popularity badges from GA4 page views.
 *
 * Uses 30-day views and marks top-bucket content as `is_popular`
 * (with optional minimum view thresholds via settings).
 *
 * Secured with CRON_SECRET.
 * Usage: GET /api/cron/refresh-popularity?token=YOUR_CRON_SECRET
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const [listingResult, postResult] = await Promise.all([
    refreshListingPopularityFromGA4(),
    refreshBlogPopularityFromGA4(),
  ]);
  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!listingResult.success || !postResult.success) {
    const listingError = listingResult.success ? null : listingResult.error || "Unknown listing error";
    const postError = postResult.success ? null : postResult.error || "Unknown post error";
    console.error(
      `[CRON] Popularity refresh failed in ${durationSeconds}s (listings: ${listingError || "ok"}, posts: ${postError || "ok"})`
    );
    return Response.json(
      {
        success: false,
        duration: `${durationSeconds}s`,
        error: "Popularity refresh failed for one or more content types.",
        listingError,
        postError,
      },
      { status: 500 }
    );
  }

  console.log(
    `[CRON] Popularity refresh complete in ${durationSeconds}s (listings ${listingResult.popularCount}/${listingResult.totalListings}, posts ${postResult.popularCount}/${postResult.totalPosts})`
  );

  return Response.json({
    listings: listingResult,
    posts: postResult,
    // Backwards-compatible listing fields
    popularCount: listingResult.popularCount,
    totalListings: listingResult.totalListings,
    // Blog fields
    popularPostsCount: postResult.popularCount,
    totalPosts: postResult.totalPosts,
    duration: `${durationSeconds}s`,
  });
}
