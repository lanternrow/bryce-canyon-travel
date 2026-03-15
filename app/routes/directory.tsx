import type { Route } from "./+types/directory";
import { Link, useSearchParams, useNavigate } from "react-router";
import { lazy, Suspense, useState } from "react";
import HeroBanner from "../components/HeroBanner";
import FilterSidebar from "../components/FilterSidebar";
import ListingCard from "../components/ListingCard";
import ListingListItem from "../components/ListingListItem";

const DirectoryMap = lazy(() => import("../components/DirectoryMap"));
import { getDirectoryConfig } from "../lib/directory-config";
import { mergeDirectoryPageContent } from "../lib/directory-pages";
import type { Listing, Category, Location as LocationType } from "../lib/types";
import { getListings, getCategories, getLocations, getSettings } from "../lib/queries.server";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { getSystemPage } from "../lib/pages.server";
import { siteConfig } from "../lib/site-config";
import { buildDirectorySchema } from "../lib/schema";

// ---------------------------------------------------------------------------
// Helper: extract directory type from URL path
// ---------------------------------------------------------------------------
function getDirectoryTypeFromUrl(url: string): string {
  const pathname = new URL(url, "http://localhost").pathname;
  const segment = pathname.split("/").filter(Boolean)[0] || "dining";
  return segment;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
export function meta({ data, matches }: Route.MetaArgs) {
  const config = data?.config as { title: string; subtitle: string; slug: string } | undefined;
  const seoOverrides = data?.seoOverrides as {
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
  } | undefined;

  // Use custom meta from settings if set, otherwise fall back to config defaults
  const seoTitle = seoOverrides?.metaTitle || (config ? config.title : "Directory");
  const seoDescription = seoOverrides?.metaDescription || (config ? config.subtitle : `Browse listings near ${siteConfig.parkName}.`);
  const slug = config?.slug || "";
  const currentPage = (data?.currentPage as number) || 1;
  const totalPages = (data?.totalPages as number) || 1;
  const canonicalUrl = currentPage > 1
    ? `${siteConfig.siteUrl}/${slug}?page=${currentPage}`
    : `${siteConfig.siteUrl}/${slug}`;
  const siteName = getSiteName(matches);

  const tags: any[] = [
    { title: formatPageTitle(seoTitle, matches) },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },

    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },

    // Twitter Card
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];

  if (seoOverrides?.ogImage) {
    tags.push({ property: "og:image", content: seoOverrides.ogImage });
    tags.push({ name: "twitter:image", content: seoOverrides.ogImage });
  }

  // JSON-LD: ItemList for directory pages
  const listings = (data as any)?.listings || [];
  const totalCount = (data as any)?.totalCount || 0;
  if (slug && listings.length > 0) {
    tags.push({ "script:ld+json": buildDirectorySchema(slug, listings, totalCount) } as any);
  }

  // Noindex per content type (from admin settings)
  const rootData = matches?.find((m: any) => m.id === "root")?.data as any;
  if (slug && rootData?.settings?.[`noindex_${slug}`] === "true") {
    tags.push({ name: "robots", content: "noindex, follow" });
  }

  // Pagination: rel prev/next for multi-page directories
  if (currentPage > 1) {
    const prevUrl = currentPage === 2
      ? `${siteConfig.siteUrl}/${slug}`
      : `${siteConfig.siteUrl}/${slug}?page=${currentPage - 1}`;
    tags.push({ tagName: "link", rel: "prev", href: prevUrl });
  }
  if (currentPage < totalPages) {
    tags.push({ tagName: "link", rel: "next", href: `${siteConfig.siteUrl}/${slug}?page=${currentPage + 1}` });
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export async function loader({ request }: Route.LoaderArgs) {
  const directoryType = getDirectoryTypeFromUrl(request.url);
  const config = getDirectoryConfig(directoryType);

  if (!config) {
    throw new Response("Directory not found", { status: 404 });
  }

  const url = new URL(request.url);
  const listingTypeParam = url.searchParams.get("listing_type") || "";
  const validListingTypes = ["dining", "lodging", "experiences", "hiking", "transportation", "parks", "golf"];
  const listingTypeFilter =
    directoryType === "listings" && validListingTypes.includes(listingTypeParam)
      ? listingTypeParam
      : directoryType === "listings"
        ? undefined
        : directoryType;
  const search = url.searchParams.get("q") || "";
  const sort = url.searchParams.get("sort") || "name_asc";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = 15;

  // Sidebar filter params
  const categoryFilters = url.searchParams.getAll("category");
  const locationFilter = url.searchParams.get("location") || "";
  const priceRangeFilters = url.searchParams.getAll("price_range");

  const result = await getListings({
    type: listingTypeFilter,
    search,
    sort,
    page,
    perPage,
    category: categoryFilters.length > 0 ? categoryFilters : undefined,
    location: locationFilter || undefined,
    priceRange: priceRangeFilters.length > 0 ? priceRangeFilters : undefined,
  });
  const categories = directoryType === "listings"
    ? await getCategories()
    : await getCategories(listingTypeFilter);
  const locations = await getLocations();

  // Batch-fetch media metadata for listing card images
  const imageUrls = result.listings
    .map((l: any) => l.featured_image)
    .filter((u: any): u is string => !!u);
  const mediaMetadata = await buildMediaMetadata(imageUrls);

  const [settings, systemPage] = await Promise.all([
    getSettings(),
    getSystemPage(directoryType),
  ]);
  const pageContent = mergeDirectoryPageContent(directoryType, systemPage?.content);

  // SEO overrides: system page takes priority, with legacy settings fallback.
  const seoOverrides = {
    metaTitle:
      systemPage?.meta_title ||
      settings[`meta_title_${directoryType}`] ||
      "",
    metaDescription:
      systemPage?.meta_description ||
      settings[`meta_description_${directoryType}`] ||
      "",
    ogImage: systemPage?.og_image || pageContent.hero.bg_image || "",
  };

  return {
    config,
    listings: result.listings,
    categories,
    locations,
    totalCount: result.totalCount,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
    search,
    sort,
    mediaMetadata,
    seoOverrides,
    pageContent,
  };
}

// ---------------------------------------------------------------------------
// View toggle icons
// ---------------------------------------------------------------------------
function GridIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-dark" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-dark" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-dark" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DirectoryPage({ loaderData }: Route.ComponentProps) {
  const {
    config,
    listings,
    categories,
    locations,
    totalCount,
    totalPages,
    currentPage,
    search,
    sort,
    mediaMetadata,
    pageContent,
  } = loaderData;

  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid");
  const navigate = useNavigate();

  function handleSortChange(newSort: string) {
    const params = new URLSearchParams(searchParams);
    params.set("sort", newSort);
    params.set("page", "1");
    setSearchParams(params);
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = (formData.get("q") as string) || "";
    const params = new URLSearchParams(searchParams);
    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    setSearchParams(params);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    setSearchParams(params);
  }

  // Filters that are NOT category, location, or price (those are handled separately by FilterSidebar)
  const dynamicFilters = config.filters.filter(
    (f) => f.key !== "category" && f.key !== "location"
  );

  return (
    <>
        {/* Hero */}
        <HeroBanner
          title={pageContent.hero.title}
          subtitle={pageContent.hero.subtitle}
          imageUrl={pageContent.hero.bg_image || config.heroImage}
          imageFocalX={pageContent.hero.bg_image_focal_x}
          imageFocalY={pageContent.hero.bg_image_focal_y}
          height={pageContent.hero.height}
          titleColor={pageContent.hero.title_color}
          subtitleColor={pageContent.hero.subtitle_color}
          titleSizeMobile={pageContent.hero.title_size_mobile}
          titleSizeDesktop={pageContent.hero.title_size_desktop}
          gradientFrom={pageContent.hero.gradient_from}
          gradientVia={pageContent.hero.gradient_via}
          gradientTo={pageContent.hero.gradient_to}
          gradientDirection={pageContent.hero.gradient_direction}
          gradientOpacity={pageContent.hero.gradient_opacity}
        />

        {/* Search bar below hero */}
        <div className="bg-white border-b border-gray-100 sticky top-[88px] z-30">
          <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <form onSubmit={handleSearchSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="q"
                  defaultValue={search}
                  placeholder={
                    pageContent.hero.search_placeholder ||
                    `Search ${config.title.toLowerCase()}...`
                  }
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            {/* Filter Sidebar - Desktop */}
            <div className="hidden lg:block w-[280px] flex-shrink-0">
              <div className="sticky top-[160px]">
                <FilterSidebar
                  filters={dynamicFilters}
                  categories={categories}
                  locations={locations}
                  activeFilters={searchParams}
                  onFilterChange={() => {}}
                />
              </div>
            </div>

            {/* Listings area */}
            <div className="flex-1 min-w-0">
              {/* Toolbar: count, sort, view toggle */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-dark">{totalCount}</span>{" "}
                    {totalCount === 1 ? "listing" : "listings"} found
                  </p>

                  {/* Mobile filter toggle */}
                  <button
                    onClick={() => setMobileFiltersOpen(true)}
                    className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                    Filters
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/* Sort dropdown */}
                  <select
                    value={sort}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                  >
                    <option value="name_asc">A – Z</option>
                    <option value="name_desc">Z – A</option>
                    <option value="featured">Featured</option>
                    <option value="rating">Highest Rated</option>
                    <option value="reviews">Most Reviewed</option>
                    <option value="price_low">Price: Low–High</option>
                    <option value="price_high">Price: High–Low</option>
                    <option value="newest">Newest</option>
                  </select>

                  {/* View toggle */}
                  <div className="hidden sm:flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 transition-colors ${viewMode === "grid" ? "bg-gray-100" : "hover:bg-gray-50"}`}
                      aria-label="Grid view"
                    >
                      <GridIcon active={viewMode === "grid"} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 border-x border-gray-300 transition-colors ${viewMode === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}
                      aria-label="List view"
                    >
                      <ListIcon active={viewMode === "list"} />
                    </button>
                    <button
                      onClick={() => setViewMode("map")}
                      className={`p-2 transition-colors ${viewMode === "map" ? "bg-gray-100" : "hover:bg-gray-50"}`}
                      aria-label="Map view"
                    >
                      <MapIcon active={viewMode === "map"} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Listings: grid / list / map */}
              {listings.length > 0 ? (
                viewMode === "map" ? (
                  <Suspense
                    fallback={
                      <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 flex items-center justify-center" style={{ height: 520 }}>
                        <span className="text-sm text-gray-400">Loading map...</span>
                      </div>
                    }
                  >
                    <DirectoryMap
                      listings={listings}
                      mediaMetadata={mediaMetadata}
                    />
                  </Suspense>
                ) : (
                  <div
                    className={
                      viewMode === "grid"
                        ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
                        : "space-y-4"
                    }
                  >
                    {listings.map((listing: Listing) =>
                      viewMode === "list" ? (
                        <ListingListItem
                          key={listing.id}
                          listing={listing}
                        />
                      ) : (
                        <ListingCard
                          key={listing.id}
                          listing={listing}
                          mediaAlt={listing.featured_image ? mediaMetadata?.[listing.featured_image]?.alt_text : undefined}
                          showPopularityBadge
                        />
                      )
                    )}
                  </div>
                )
              ) : (
                <div className="text-center py-20">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-700 mb-1">
                    No listings found
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Try adjusting your filters or search terms.
                  </p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`w-10 h-10 text-sm font-medium rounded-lg transition-colors ${
                        page === currentPage
                          ? "bg-primary text-white"
                          : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </nav>
              )}
            </div>
          </div>
        </div>
      {/* Mobile filter overlay */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileFiltersOpen(false)}
          />

          {/* Slide-in panel */}
          <div className="absolute inset-y-0 left-0 w-full max-w-sm bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-dark">Filters</h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Close filters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <FilterSidebar
                filters={dynamicFilters}
                categories={categories}
                locations={locations}
                activeFilters={searchParams}
                onFilterChange={() => {}}
              />
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Show {totalCount} Results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
