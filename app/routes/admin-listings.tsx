import { Link, useLoaderData, useSearchParams, useNavigate, Form, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/admin-listings";
import { requireAuth } from "../lib/auth.server";
import { getListings, deleteListing, getLocations } from "../lib/queries.server";
import { checkPublishRequirements } from "../lib/publish-validation";
import { runSeoAnalysis } from "../lib/seo-analysis";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Manage Listings | Admin | ${siteConfig.siteName}` }];
}

function computeMetaRating(metaTitle: string, metaDescription: string): "good" | "ok" | "problem" {
  const titleLen = (metaTitle || "").length;
  const descLen = (metaDescription || "").length;
  if (titleLen === 0 || descLen === 0) return "problem";
  const titleGood = titleLen >= 35 && titleLen <= 60;
  const descGood = descLen >= 120 && descLen <= 160;
  if (titleGood && descGood) return "good";
  return "ok";
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const location = url.searchParams.get("location") || undefined;
  const legacyCity = url.searchParams.get("city") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const sort = url.searchParams.get("sort") || "name_asc";
  const popularFilter = url.searchParams.get("popular") || "";
  const metaFilter = url.searchParams.get("meta") || "";
  const seoFilter = url.searchParams.get("seo") || "";
  const locations = await getLocations();
  const matchedLegacyLocation = !location && legacyCity
    ? (locations as any[]).find((loc: any) => loc.name.toLowerCase() === legacyCity.toLowerCase())
    : null;
  const resolvedLocation = location || matchedLegacyLocation?.slug;

  const result = await getListings({
    type,
    search,
    location: resolvedLocation || undefined,
    city: resolvedLocation ? undefined : legacyCity,
    popular: popularFilter || undefined,
    sort,
    page,
    perPage: 50,
    status: status || "", // empty string = all statuses
  });

  // Compute canPublish + SEO/Meta scores for each listing
  let listingsWithScores = result.listings.map((listing: any) => {
    const metaRating = computeMetaRating(listing.meta_title, listing.meta_description);
    const seo = runSeoAnalysis({
      contentType: "listing",
      focusKeyphrase: listing.focus_keyphrase || "",
      metaTitle: listing.meta_title || "",
      metaDescription: listing.meta_description || "",
      slug: listing.slug || "",
      bodyHtml: listing.description || "",
      featuredImage: listing.featured_image || undefined,
      websiteUrl: listing.website || undefined,
    });
    return {
      ...listing,
      canPublish: checkPublishRequirements(listing).canPublish,
      metaRating,
      seoRating: seo.overallRating,
      seoGoodCount: seo.goodCount,
      seoTotalChecks: seo.checks.length,
    };
  });

  // Filter by meta score
  if (metaFilter) {
    listingsWithScores = listingsWithScores.filter((l) => l.metaRating === metaFilter);
  }

  // Filter by SEO score
  if (seoFilter) {
    listingsWithScores = listingsWithScores.filter((l) => l.seoRating === seoFilter);
  }

  return {
    listings: listingsWithScores,
    totalCount: result.totalCount,
    currentPage: result.currentPage,
    totalPages: result.totalPages,
    locations,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await deleteListing(id);
    return { ok: true };
  }

  return redirect("/admin/listings");
}

// ============================================
// Helpers
// ============================================

const typeColors: Record<string, string> = {
  dining: "bg-orange-100 text-orange-700",
  lodging: "bg-blue-100 text-blue-700",
  experiences: "bg-purple-100 text-purple-700",
  hiking: "bg-green-100 text-green-700",
  transportation: "bg-gray-100 text-gray-700",
  parks: "bg-emerald-100 text-emerald-700",
  golf: "bg-lime-100 text-lime-700",
};

const LISTING_TYPES = [
  { value: "", label: "All" },
  { value: "dining", label: "Dining" },
  { value: "experiences", label: "Experiences" },
  { value: "golf", label: "Golf" },
  { value: "hiking", label: "Hiking" },
  { value: "lodging", label: "Lodging" },
  { value: "parks", label: "Parks" },
  { value: "transportation", label: "Transportation" },
];

const metaBadge: Record<string, { classes: string; label: string }> = {
  good: { classes: "bg-emerald-100 text-emerald-700", label: "Good" },
  ok: { classes: "bg-amber-100 text-amber-700", label: "OK" },
  problem: { classes: "bg-red-100 text-red-700", label: "Missing" },
};

const seoBadge: Record<string, { classes: string; dot: string }> = {
  good: { classes: "bg-emerald-100 text-emerald-700", dot: "#22c55e" },
  improvement: { classes: "bg-amber-100 text-amber-700", dot: "#f59e0b" },
  problem: { classes: "bg-red-100 text-red-700", dot: "#ef4444" },
};

/** Build a URL preserving existing search params, updating the specified ones. */
function buildUrl(
  updates: Record<string, string | undefined>,
  searchParams: URLSearchParams
) {
  const newParams = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
  }
  const qs = newParams.toString();
  return `/admin/listings${qs ? `?${qs}` : ""}`;
}

// ============================================
// Sortable Column Header
// ============================================

function SortableHeader({
  label,
  field,
  currentSort,
  searchParams,
}: {
  label: string;
  field: string;
  currentSort: string;
  searchParams: URLSearchParams;
}) {
  const isAsc = currentSort === `${field}_asc`;
  const isDesc = currentSort === `${field}_desc`;
  const isActive = isAsc || isDesc;
  const nextSort = isActive && isAsc ? `${field}_desc` : `${field}_asc`;

  return (
    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
      <Link
        to={buildUrl({ sort: nextSort, page: "1" }, searchParams)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 transition-colors ${
          isActive ? "text-gray-900" : ""
        }`}
      >
        {label}
        <span className="inline-flex flex-col text-[9px] leading-none -space-y-0.5">
          <span className={isAsc ? "text-primary" : "text-gray-300"}>&#9650;</span>
          <span className={isDesc ? "text-primary" : "text-gray-300"}>&#9660;</span>
        </span>
      </Link>
    </th>
  );
}

// ============================================
// Pagination Component
// ============================================

function Pagination({
  currentPage,
  totalPages,
  totalCount,
  listingsCount,
  searchParams,
  perPage,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  listingsCount: number;
  searchParams: URLSearchParams;
  perPage: number;
}) {
  const rangeStart = (currentPage - 1) * perPage + 1;
  const rangeEnd = rangeStart + listingsCount - 1;

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-center mt-6 text-sm text-gray-500">
        <p>Showing {rangeStart}-{rangeEnd} of {totalCount} listings</p>
      </div>
    );
  }

  // Calculate visible page range (max 7 pages shown)
  const maxVisible = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const pageLink = (page: number) => buildUrl({ page: String(page) }, searchParams);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-1">
        {/* Previous */}
        {currentPage > 1 ? (
          <Link
            to={pageLink(currentPage - 1)}
            className="px-3 py-2 text-sm text-gray-600 hover:text-primary transition-colors"
          >
            &lsaquo; Previous
          </Link>
        ) : (
          <span className="px-3 py-2 text-sm text-gray-300 cursor-default">
            &lsaquo; Previous
          </span>
        )}

        {/* First page + ellipsis */}
        {startPage > 1 && (
          <>
            <Link
              to={pageLink(1)}
              className="w-9 h-9 flex items-center justify-center text-sm rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              1
            </Link>
            {startPage > 2 && (
              <span className="w-9 h-9 flex items-center justify-center text-sm text-gray-400">
                &hellip;
              </span>
            )}
          </>
        )}

        {/* Page numbers */}
        {pages.map((p) => (
          <Link
            key={p}
            to={pageLink(p)}
            className={`w-9 h-9 flex items-center justify-center text-sm rounded-lg font-medium transition-colors ${
              p === currentPage
                ? "bg-primary text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {p}
          </Link>
        ))}

        {/* Last page + ellipsis */}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span className="w-9 h-9 flex items-center justify-center text-sm text-gray-400">
                &hellip;
              </span>
            )}
            <Link
              to={pageLink(totalPages)}
              className="w-9 h-9 flex items-center justify-center text-sm rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {totalPages}
            </Link>
          </>
        )}

        {/* Next */}
        {currentPage < totalPages ? (
          <Link
            to={pageLink(currentPage + 1)}
            className="px-3 py-2 text-sm text-gray-600 hover:text-primary transition-colors"
          >
            Next &rsaquo;
          </Link>
        ) : (
          <span className="px-3 py-2 text-sm text-gray-300 cursor-default">
            Next &rsaquo;
          </span>
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">
        Showing {rangeStart}-{rangeEnd} of {totalCount} listings &middot; Page {currentPage} of {totalPages}
      </p>
    </div>
  );
}

// ============================================
// Delete Button (uses fetcher to stay on page)
// ============================================

function DeleteButton({ id }: { id: string }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      onSubmit={(e) => {
        if (!confirm("Delete this listing?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isDeleting}
        className={`text-sm text-red-500 hover:underline ${isDeleting ? "opacity-50" : ""}`}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
    </fetcher.Form>
  );
}

// ============================================
// Main Component
// ============================================

export default function AdminListings() {
  const { listings, totalCount, currentPage, totalPages, locations } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentType = searchParams.get("type") || "";
  const currentStatus = searchParams.get("status") || "";
  const legacyCity = searchParams.get("city") || "";
  const currentLocation = searchParams.get("location") ||
    ((locations as any[]).find((loc: any) => loc.name.toLowerCase() === legacyCity.toLowerCase())?.slug || "");
  const currentSort = searchParams.get("sort") || "name_asc";
  const currentPopular = searchParams.get("popular") || "";
  const currentMeta = searchParams.get("meta") || "";
  const currentSeo = searchParams.get("seo") || "";

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/admin/dashboard" className="hover:text-primary">
              Admin
            </Link>
            <span>/</span>
            <span>Listings</span>
          </div>
          <h1 className="text-3xl font-bold text-dark">All Listings</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} total listings</p>
        </div>
        <Link
          to="/admin/listings/new"
          className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          + New Listing
        </Link>
      </div>

      {/* Filters bar */}
      <Form method="get" className="flex items-center gap-3 mb-4">
        {/* Preserve current sort in the form */}
        <input type="hidden" name="sort" value={currentSort} />
        <select
          name="type"
          value={currentType}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { type: e.target.value || undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          {LISTING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value ? t.label : "All Types"}
            </option>
          ))}
        </select>
        <select
          name="status"
          value={currentStatus}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { status: e.target.value || undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          <option value="">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
        </select>
        <select
          name="location"
          value={currentLocation}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { location: e.target.value || undefined, city: undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          <option value="">All Locations</option>
          {(locations as any[]).map((loc: any) => (
            <option key={loc.id} value={loc.slug}>
              {loc.name}
            </option>
          ))}
        </select>
        <select
          value={currentPopular}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { popular: e.target.value || undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          <option value="">All Popularity</option>
          <option value="popular">Popular only</option>
          <option value="not_popular">Not popular</option>
        </select>
        <select
          value={currentMeta}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { meta: e.target.value || undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          <option value="">All Meta</option>
          <option value="good">Meta: Good</option>
          <option value="ok">Meta: OK</option>
          <option value="problem">Meta: Missing</option>
        </select>
        <select
          value={currentSeo}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          onChange={(e) =>
            navigate(
              buildUrl(
                { seo: e.target.value || undefined, page: "1" },
                searchParams
              )
            )
          }
        >
          <option value="">All SEO</option>
          <option value="good">SEO: Good</option>
          <option value="improvement">SEO: OK</option>
          <option value="problem">SEO: Needs Work</option>
        </select>
        <input
          type="text"
          name="q"
          defaultValue={searchParams.get("q") || ""}
          placeholder="Search listings..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          Search
        </button>
      </Form>

      {/* Category type filter buttons */}
      <div className="flex items-center gap-2 mb-6">
        {LISTING_TYPES.map((lt) => {
          const isActive = currentType === lt.value;
          return (
            <Link
              key={lt.value}
              to={buildUrl(
                { type: lt.value || undefined, page: "1" },
                searchParams
              )}
              className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                isActive
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800"
              }`}
            >
              {lt.label}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortableHeader
                label="Name"
                field="name"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <SortableHeader
                label="Type"
                field="type"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <SortableHeader
                label="Location"
                field="city"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <SortableHeader
                label="Status"
                field="status"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Meta
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                SEO
              </th>
              <SortableHeader
                label="Rating"
                field="rating"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <SortableHeader
                label="Popular"
                field="popular"
                currentSort={currentSort}
                searchParams={searchParams}
              />
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(listings as any[]).map((listing: any) => (
              <tr key={listing.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-sm text-gray-900">
                    {listing.name}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                      typeColors[listing.type] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {listing.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {listing.city || listing.location_name || "\u2014"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      listing.status === "published"
                        ? "bg-green-100 text-green-700"
                        : listing.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {listing.status}
                  </span>
                  {listing.status !== "published" && !listing.canPublish && (
                    <span className="text-[10px] text-gray-400 ml-1">(incomplete)</span>
                  )}
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  {(() => {
                    const mb = metaBadge[listing.metaRating] || metaBadge.problem;
                    return (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${mb.classes}`}>
                        {mb.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  {(() => {
                    const sb = seoBadge[listing.seoRating] || seoBadge.problem;
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${sb.classes}`}>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sb.dot }}
                        />
                        {listing.seoGoodCount}/{listing.seoTotalChecks}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {listing.avg_rating > 0 ? (
                    <span>
                      &#9733; {Number(listing.avg_rating).toFixed(1)} (
                      {listing.review_count})
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {listing.is_popular ? (
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        Popular
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {Number(listing.views_30d || 0).toLocaleString()} views
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to={`/admin/listings/${listing.id}/edit`}
                      className="text-sm text-primary hover:underline"
                    >
                      Edit
                    </Link>
                    <a
                      href={
                        listing.status === "published"
                          ? `/listing/${listing.type}/${listing.slug}`
                          : `/listing/${listing.type}/${listing.slug}?preview=true`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View
                    </a>
                    <DeleteButton id={listing.id} />
                  </div>
                </td>
              </tr>
            ))}
            {listings.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-12 text-center text-gray-400 text-sm"
                >
                  No listings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        listingsCount={listings.length}
        searchParams={searchParams}
        perPage={50}
      />
    </div>
  );
}
