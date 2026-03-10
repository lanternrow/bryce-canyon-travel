import { Link, useLoaderData, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-reviews";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import { formatNumericDate } from "../lib/format";
import {
  getGoogleReviewsOverview,
  getGoogleReviewsStats,
  refreshGoogleReviews,
} from "../lib/google-places.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Google Reviews | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [overview, stats] = await Promise.all([
    getGoogleReviewsOverview(),
    getGoogleReviewsStats(),
  ]);
  return { overview, stats };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "refresh") {
    const listingId = formData.get("listingId") as string;
    const placeId = formData.get("placeId") as string;
    if (listingId && placeId) {
      await refreshGoogleReviews(listingId, placeId);
    }
  } else if (intent === "refresh-all") {
    const overview = await getGoogleReviewsOverview();
    for (const row of overview as any[]) {
      if (row.google_place_id) {
        await refreshGoogleReviews(row.id, row.google_place_id);
      }
    }
  }

  return redirect("/admin/reviews?toast=Reviews+synced");
}

type OverviewRow = {
  id: string;
  name: string;
  type: string;
  google_place_id: string;
  place_rating: number | null;
  place_review_count: number | null;
  fetched_at: string | null;
  reviews: any;
};

const typeColors: Record<string, string> = {
  dining: "bg-orange-100 text-orange-700",
  lodging: "bg-blue-100 text-blue-700",
  experiences: "bg-purple-100 text-purple-700",
  hiking: "bg-green-100 text-green-700",
  transportation: "bg-gray-100 text-gray-700",
};

function renderStars(rating: number) {
  return (
    <span className="text-sm tracking-wide">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < Math.round(rating) ? "text-yellow-500" : "text-gray-300"}>
          {i < Math.round(rating) ? "\u2605" : "\u2606"}
        </span>
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const { overview: rawOverview, stats } = useLoaderData<typeof loader>();
  const overview = rawOverview as unknown as OverviewRow[];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = overview.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return row.name.toLowerCase().includes(q) || row.type.toLowerCase().includes(q);
  });

  return (
    <div className="px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Google Reviews</span>
      </div>

      {/* Title + Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-dark">Google Reviews</h1>
          <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
            {overview.length} linked
          </span>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="refresh-all" />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh All
          </button>
        </Form>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Linked Listings</p>
          <p className="text-3xl font-bold text-dark mt-1">{stats.linked_count}</p>
          <p className="text-xs text-gray-400 mt-1">with Google Place ID</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Avg. Google Rating</p>
          <p className="text-3xl font-bold text-dark mt-1">
            {Number(stats.avg_rating) > 0 ? Number(stats.avg_rating).toFixed(1) : "N/A"}
          </p>
          <p className="text-xs text-gray-400 mt-1">across all linked listings</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-medium text-gray-500">Total Google Reviews</p>
          <p className="text-3xl font-bold text-dark mt-1">{Number(stats.total_reviews).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">from Google Business Profiles</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search listings..."
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {/* Listings Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Listing</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Google Rating</th>
              <th className="px-4 py-3">Reviews</th>
              <th className="px-4 py-3">Last Synced</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row) => {
              const reviews = row.reviews
                ? typeof row.reviews === "string" ? JSON.parse(row.reviews) : row.reviews
                : [];
              const isExpanded = expandedId === row.id;

              return (
                <tr key={row.id} className="group">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className="text-sm font-medium text-dark hover:text-primary transition-colors text-left"
                    >
                      {row.name}
                    </button>
                    {/* Expanded: show cached reviews */}
                    {isExpanded && reviews.length > 0 && (
                      <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                        {reviews.map((review: any, idx: number) => (
                          <div key={idx} className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-sand/30 flex items-center justify-center text-xs font-semibold text-stone flex-shrink-0">
                              {review.author_name?.charAt(0) || "?"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium text-gray-700">{review.author_name || "Anonymous"}</span>
                                {renderStars(review.rating)}
                              </div>
                              <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{review.text}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{review.relative_time || ""}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${typeColors[row.type] || "bg-gray-100 text-gray-700"}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.place_rating ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-dark">{Number(row.place_rating).toFixed(1)}</span>
                        {renderStars(Number(row.place_rating))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not synced</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {row.place_review_count ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {row.fetched_at ? formatNumericDate(row.fetched_at) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="refresh" />
                        <input type="hidden" name="listingId" value={row.id} />
                        <input type="hidden" name="placeId" value={row.google_place_id} />
                        <button
                          type="submit"
                          className="text-xs px-2.5 py-1.5 text-primary border border-primary/30 rounded hover:bg-red-50 transition-colors"
                        >
                          Refresh
                        </button>
                      </Form>
                      <Link
                        to={`/admin/listings/${row.id}/edit`}
                        className="text-xs px-2.5 py-1.5 text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <div className="text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    <p className="text-sm">No listings are linked to Google yet.</p>
                    <p className="text-xs mt-1">
                      Add a Google Place ID to a listing to start showing Google Reviews.{" "}
                      <Link to="/admin/listings" className="text-primary hover:underline">Go to Listings</Link>
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
