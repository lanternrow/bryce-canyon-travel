// API: GET /api/listings?type=dining&location=springdale&price_range=$,$$$&sort=rating&page=1
// Returns filtered, sorted, paginated listings as JSON

import { getListings } from "../lib/queries.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || undefined;
  const location = url.searchParams.get("location") || undefined;
  const priceRange = url.searchParams.get("price_range")?.split(",");
  const search = url.searchParams.get("search") || undefined;
  const sort = url.searchParams.get("sort") || "default";
  const page = parseInt(url.searchParams.get("page") || "1");
  const perPage = 12;

  const result = await getListings({
    type,
    search,
    location,
    priceRange,
    sort,
    page,
    perPage,
  });

  return Response.json({
    listings: result.listings,
    total: result.totalCount,
    page: result.currentPage,
    totalPages: result.totalPages,
    perPage,
  });
}
