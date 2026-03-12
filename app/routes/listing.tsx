import type { Route } from "./+types/listing";
import { Link, useSearchParams } from "react-router";
import StarRating from "../components/StarRating";
import { formatLongDate } from "../lib/format";
import PriceRange from "../components/PriceRange";
import type {
  Listing,
  HikingDetails,
  ParkDetails,
  BusinessHours,
  DayOfWeek,
} from "../lib/types";
import { getListingBySlug, getHikingDetails, getParkDetails } from "../lib/queries.server";
import { getGoogleReviewsForListing } from "../lib/google-places.server";
import type { GoogleReview } from "../lib/google-places.server";
import { buildMediaMetadata } from "../lib/media-helpers.server";
import { cfHero } from "../lib/image-utils";
import { buildListingSchema } from "../lib/schema";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { siteConfig } from "../lib/site-config";
import GoogleMap from "../components/GoogleMap";
import { getETAFromZion } from "../lib/google-distance.server";
import type { ETAResult } from "../lib/google-distance.server";
import { getSession } from "../lib/auth.server";

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
export function meta({ data, matches }: Route.MetaArgs) {
  if (!data || !data.listing) {
    return [{ title: formatPageTitle("Listing Not Found", matches) }];
  }

  const { listing, mediaMetadata } = data;

  // SEO title — custom meta_title → listing name, with site suffix for <title>
  const seoTitle = listing.meta_title || listing.name;
  const pageTitle = formatPageTitle(seoTitle, matches);
  const siteName = getSiteName(matches);

  // SEO description — custom meta_description → tagline → truncated description → generic
  const seoDescription =
    listing.meta_description ||
    listing.tagline ||
    (listing.description
      ? listing.description.replace(/<[^>]*>/g, "").slice(0, 160)
      : `${listing.name} in ${listing.city || siteConfig.regionName} — ${siteConfig.siteName}`);

  // Canonical URL
  const canonicalUrl = `${siteConfig.siteUrl}/listing/${listing.type}/${listing.slug}`;

  // Featured image + alt text from media metadata
  const ogImage = listing.featured_image || null;
  const ogImageAlt =
    ogImage && mediaMetadata?.[ogImage]
      ? mediaMetadata[ogImage].alt_text || seoTitle
      : seoTitle;

  const tags: ReturnType<typeof Array<any>> = [
    { title: pageTitle },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: canonicalUrl },

    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },

    // Twitter Card
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];

  if (ogImage) {
    tags.push(
      { property: "og:image", content: ogImage },
      { property: "og:image:alt", content: ogImageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: ogImageAlt },
    );
  } else {
    tags.push({ name: "twitter:card", content: "summary" });
  }

  // JSON-LD Structured Data (published listings only)
  if (listing.status === "published") {
    tags.push({
      "script:ld+json": buildListingSchema(
        listing,
        data.googleRating,
        data.googleReviewCount,
      ),
    });
  } else {
    // Draft/pending/archived previews should never be indexed.
    tags.push({ name: "robots", content: "noindex, nofollow" });
    tags.push({ name: "googlebot", content: "noindex, nofollow" });
  }

  // Noindex per content type (from admin settings)
  const rootData = matches?.find((m: any) => m.id === "root")?.data as any;
  if (
    listing.status === "published" &&
    rootData?.settings?.[`noindex_${listing.type}`] === "true"
  ) {
    tags.push({ name: "robots", content: "noindex, follow" });
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export async function loader({ request, params }: Route.LoaderArgs) {
  const { type, slug } = params;
  const url = new URL(request.url);

  if (!type || !slug) {
    throw new Response("Not found", { status: 404 });
  }

  const listing = await getListingBySlug(type, slug);

  if (!listing) {
    throw new Response("Not found", { status: 404 });
  }

  // Restrict non-published listings to explicit, authenticated admin preview mode.
  if (listing.status !== "published") {
    const isPreview = url.searchParams.get("preview") === "true";
    if (!isPreview) {
      throw new Response("Not found", { status: 404 });
    }
    const session = await getSession(request);
    if (!session) {
      throw new Response("Not found", { status: 404 });
    }
  }

  const hikingDetails = type === "hiking" ? await getHikingDetails(listing.id) : null;
  const parkDetails = type === "parks" ? await getParkDetails(listing.id) : null;

  // Fetch Google Reviews if the listing has a Google Place ID
  let googleReviews: GoogleReview[] = [];
  let googleRating: number | null = null;
  let googleReviewCount: number | null = null;

  if (listing.google_place_id) {
    const cached = await getGoogleReviewsForListing(listing.id, listing.google_place_id);
    if (cached) {
      googleReviews = typeof cached.reviews === "string"
        ? JSON.parse(cached.reviews)
        : cached.reviews;
      googleRating = cached.place_rating;
      googleReviewCount = cached.place_review_count;
    }
  }

  // Batch-fetch media metadata for all image URLs
  const imageUrls: string[] = [];
  if (listing.featured_image) imageUrls.push(listing.featured_image);
  if (listing.gallery && Array.isArray(listing.gallery)) {
    imageUrls.push(...listing.gallery);
  }
  const mediaMetadata = await buildMediaMetadata(imageUrls);

  // Fetch ETA from Zion via Google Distance Matrix (non-blocking — null if not configured)
  let etaFromZion: ETAResult | null = null;
  if (listing.lat && listing.lng) {
    etaFromZion = await getETAFromZion(
      Number(listing.lat),
      Number(listing.lng)
    ).catch(() => null);
  }

  return {
    listing,
    hikingDetails,
    parkDetails,
    googleReviews,
    googleRating,
    googleReviewCount,
    mediaMetadata,
    etaFromZion,
  };
}

// ---------------------------------------------------------------------------
// Helper: format day name
// ---------------------------------------------------------------------------
const dayOrder: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function formatDay(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

// ---------------------------------------------------------------------------
// Difficulty badge colors
// ---------------------------------------------------------------------------
function difficultyColor(d: string) {
  switch (d) {
    case "easy":
      return "bg-green-100 text-green-800";
    case "moderate":
      return "bg-yellow-100 text-yellow-800";
    case "hard":
      return "bg-orange-100 text-orange-800";
    case "expert":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

// ---------------------------------------------------------------------------
// Google star renderer
// ---------------------------------------------------------------------------
function GoogleStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = rating >= i + 1;
        const half = !filled && rating >= i + 0.5;
        return (
          <svg
            key={i}
            className={`w-5 h-5 ${filled || half ? "text-amber-400" : "text-gray-200"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ListingPage({ loaderData }: Route.ComponentProps) {
  const { listing, hikingDetails, parkDetails, googleReviews, googleRating, googleReviewCount, mediaMetadata, etaFromZion } = loaderData;
  const [searchParams] = useSearchParams();

  const isPreview = searchParams.get("preview") === "true" && listing.status !== "published";

  const directoryLabel =
    listing.type.charAt(0).toUpperCase() + listing.type.slice(1);

  const hasGoogleReviews = googleReviews && googleReviews.length > 0;
  const displayRating = googleRating ?? listing.avg_rating;
  const displayCount = googleReviewCount ?? listing.review_count;

  return (
    <>
        {/* Preview Mode Banner */}
        {isPreview && (
          <div className="bg-amber-500 text-white text-center py-2.5 px-4 text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview Mode &mdash; This listing has not been published yet.
              <Link to={`/admin/listings/${listing.id}/edit`} className="underline ml-1">Edit listing</Link>
            </span>
          </div>
        )}

        {/* Hero / Gallery placeholder */}
        <section className="relative h-[300px] overflow-hidden bg-gradient-to-br from-dark via-stone to-sand">
          {listing.featured_image ? (
            <img
              src={cfHero(listing.featured_image)}
              alt={mediaMetadata?.[listing.featured_image]?.alt_text || listing.name}
              title={mediaMetadata?.[listing.featured_image]?.title || undefined}
              width={1600}
              height={300}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg
                  className="w-20 h-20 text-white/30 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                  />
                </svg>
                <p className="mt-3 text-white/40 text-sm">Gallery photos coming soon</p>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </section>

        {/* Content */}
        <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <Link
              to={`/${listing.type}`}
              className="hover:text-primary transition-colors"
            >
              {directoryLabel}
            </Link>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-800 font-medium">{listing.name}</span>
          </nav>

          <div className="flex flex-col lg:flex-row gap-10">
            {/* ============================================================ */}
            {/* Main Content (2/3)                                           */}
            {/* ============================================================ */}
            <div className="flex-1 min-w-0">
              {/* Title block */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-stone bg-cream px-2.5 py-1 rounded-full">
                    {listing.category_name}
                  </span>
                  {listing.is_featured && (
                    <span className="text-xs uppercase tracking-wider font-semibold text-white bg-primary px-2.5 py-1 rounded-full">
                      Featured
                    </span>
                  )}
                  {listing.is_popular && (
                    <span className="text-xs uppercase tracking-wider font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                      Popular
                    </span>
                  )}
                </div>

                <h1 className="text-3xl md:text-4xl font-bold text-dark tracking-tight">
                  {listing.name}
                </h1>

                {listing.tagline && (
                  <p className="mt-2 text-lg text-gray-600">{listing.tagline}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 mt-4">
                  <StarRating rating={displayRating} count={displayCount} />
                  {listing.price_range && (
                    <PriceRange range={listing.price_range} />
                  )}
                  {listing.city && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {listing.city}{listing.state ? `, ${listing.state}` : ""}
                    </span>
                  )}
                </div>

                {/* Share & Bookmark */}
                <div className="flex items-center gap-3 mt-5">
                  <button className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                    Share
                  </button>
                  <button className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                    </svg>
                    Save
                  </button>
                </div>
              </div>

              {/* Hiking trail stats */}
              {hikingDetails && (
                <div className="mb-8 bg-cream/50 border border-sand/30 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-dark mb-4">
                    Trail Information
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-dark">
                        {hikingDetails.distance_miles_max
                          ? `${hikingDetails.distance_miles}–${hikingDetails.distance_miles_max}`
                          : hikingDetails.distance_miles}
                      </div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                        Miles
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-dark">
                        {hikingDetails.elevation_gain_ft?.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                        Ft Elevation
                      </div>
                    </div>
                    <div className="text-center">
                      <span
                        className={`inline-block px-3 py-1 text-sm font-semibold rounded-full capitalize ${difficultyColor(
                          hikingDetails.difficulty || ""
                        )}`}
                      >
                        {hikingDetails.difficulty}
                      </span>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                        Difficulty
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-dark">
                        {hikingDetails.estimated_time}
                      </div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                        Est. Time
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-sand/30">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className={
                        hikingDetails.entry_requirement === "permit" ? "text-orange-600"
                        : hikingDetails.entry_requirement === "entry_fee" ? "text-amber-600"
                        : "text-green-600"
                      }>
                        {hikingDetails.entry_requirement === "permit" ? "Permit Required"
                        : hikingDetails.entry_requirement === "entry_fee" ? "Entry Fee"
                        : "Free Entry"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className={
                        hikingDetails.dog_policy === "off_leash" ? "text-green-600"
                        : hikingDetails.dog_policy === "on_leash" ? "text-blue-600"
                        : "text-gray-500"
                      }>
                        {hikingDetails.dog_policy === "off_leash" ? "Dogs Allowed Off Leash"
                        : hikingDetails.dog_policy === "on_leash" ? "Dogs Allowed on Leash"
                        : "No Dogs"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span>
                        Trail Type:{" "}
                        {hikingDetails.trail_type
                          ?.replace(/_/g, " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </div>
                    {hikingDetails.season_start && hikingDetails.season_end && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span>
                          Season: {hikingDetails.season_start} - {hikingDetails.season_end}
                        </span>
                      </div>
                    )}
                  </div>

                  {hikingDetails.permit_info && (
                    <p className="mt-4 text-sm text-gray-600 bg-orange-50 border border-orange-200 rounded-lg p-3">
                      {hikingDetails.permit_info}
                    </p>
                  )}

                  {/* Data source attribution */}
                  {hikingDetails.data_sources && (
                    <p className="mt-4 pt-3 border-t border-sand/20 text-xs text-gray-400 leading-relaxed">
                      Trail data courtesy of{" "}
                      {hikingDetails.data_sources.split(",").map((src: string, i: number, arr: string[]) => {
                        const info: Record<string, { label: string; url: string }> = {
                          NPS: { label: "National Park Service", url: "https://www.nps.gov" },
                          OSM: { label: "OpenStreetMap contributors", url: "https://www.openstreetmap.org" },
                          RIDB: { label: "Recreation.gov", url: "https://www.recreation.gov" },
                          BLM: { label: "Bureau of Land Management", url: "https://www.blm.gov" },
                          USFS: { label: "US Forest Service", url: "https://www.fs.usda.gov" },
                          USGS: { label: "US Geological Survey", url: "https://www.usgs.gov" },
                          Wikidata: { label: "Wikidata", url: "https://www.wikidata.org" },
                          Wikipedia: { label: "Wikipedia", url: "https://en.wikipedia.org" },
                        };
                        const source = info[src.trim()];
                        if (!source) return null;
                        return (
                          <span key={src}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-primary underline decoration-dotted underline-offset-2"
                            >
                              {source.label}
                            </a>
                            {i < arr.length - 2 ? ", " : i === arr.length - 2 ? " and " : ""}
                          </span>
                        );
                      })}
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Park Information */}
              {parkDetails && (
                <div className="mb-8 bg-cream/50 border border-sand/30 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-dark mb-4">
                    Park Information
                  </h2>

                  {/* Big stat numbers */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {parkDetails.acreage && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-dark">
                          {parkDetails.acreage.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                          Acres
                        </div>
                      </div>
                    )}
                    {parkDetails.elevation_ft && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-dark">
                          {parkDetails.elevation_ft.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                          Ft Elevation
                        </div>
                      </div>
                    )}
                    {parkDetails.year_established && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-dark">
                          {parkDetails.year_established}
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                          Established
                        </div>
                      </div>
                    )}
                    {parkDetails.governing_agency && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-dark">
                          {parkDetails.governing_agency}
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">
                          Agency
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Entry & access badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-sand/30">
                    {parkDetails.entry_fee && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-amber-600 font-medium">{parkDetails.entry_fee}</span>
                      </div>
                    )}
                    {parkDetails.annual_pass_accepted && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-green-600">Annual Pass Accepted</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className={
                        parkDetails.entry_requirement === "permit" ? "text-orange-600"
                        : parkDetails.entry_requirement === "entry_fee" ? "text-amber-600"
                        : "text-green-600"
                      }>
                        {parkDetails.entry_requirement === "permit" ? "Permit Required"
                        : parkDetails.entry_requirement === "entry_fee" ? "Entry Fee"
                        : "Free Entry"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className={
                        parkDetails.dog_policy === "off_leash" ? "text-green-600"
                        : parkDetails.dog_policy === "on_leash" ? "text-blue-600"
                        : "text-gray-500"
                      }>
                        {parkDetails.dog_policy === "off_leash" ? "Dogs Allowed Off Leash"
                        : parkDetails.dog_policy === "on_leash" ? "Dogs Allowed on Leash"
                        : "No Dogs"}
                      </span>
                    </div>
                    {parkDetails.season_start && parkDetails.season_end && (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span>Season: {parkDetails.season_start} - {parkDetails.season_end}</span>
                      </div>
                    )}
                  </div>

                  {/* Operating hours */}
                  {(parkDetails.park_hours || parkDetails.visitor_center_hours) && (
                    <div className="mt-6 pt-6 border-t border-sand/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {parkDetails.park_hours && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Park Hours:</span> {parkDetails.park_hours}
                        </div>
                      )}
                      {parkDetails.visitor_center_hours && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Visitor Center:</span> {parkDetails.visitor_center_hours}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Facility tags */}
                  {(parkDetails.has_visitor_center || parkDetails.has_campgrounds || parkDetails.has_scenic_drives || parkDetails.has_restrooms || parkDetails.has_wheelchair_access || parkDetails.has_cell_service || parkDetails.water_available || parkDetails.kid_friendly) && (
                    <div className="mt-6 pt-6 border-t border-sand/30 flex flex-wrap gap-2">
                      {parkDetails.has_visitor_center && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Visitor Center</span>}
                      {parkDetails.has_campgrounds && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Campgrounds</span>}
                      {parkDetails.has_scenic_drives && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Scenic Drives</span>}
                      {parkDetails.has_restrooms && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Restrooms</span>}
                      {parkDetails.has_wheelchair_access && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Wheelchair Access</span>}
                      {parkDetails.has_cell_service && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Cell Service</span>}
                      {parkDetails.water_available && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Water Available</span>}
                      {parkDetails.kid_friendly && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Kid Friendly</span>}
                    </div>
                  )}

                  {/* Seasonal closure warning */}
                  {parkDetails.seasonal_closure && (
                    <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <strong>Seasonal Closure:</strong> {parkDetails.seasonal_closure}
                    </p>
                  )}

                  {/* Special notices */}
                  {parkDetails.notices && (
                    <p className="mt-4 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <strong>Notice:</strong> {parkDetails.notices}
                    </p>
                  )}

                  {/* Fee-free info */}
                  {parkDetails.fee_free_info && (
                    <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                      <strong>Fee-Free Days:</strong> {parkDetails.fee_free_info}
                    </p>
                  )}

                  {/* Data source attribution */}
                  {parkDetails.data_sources && (
                    <p className="mt-4 pt-3 border-t border-sand/20 text-xs text-gray-400 leading-relaxed">
                      Park data courtesy of{" "}
                      {parkDetails.data_sources.split(",").map((src: string, i: number, arr: string[]) => {
                        const info: Record<string, { label: string; url: string }> = {
                          NPS: { label: "National Park Service", url: "https://www.nps.gov" },
                          BLM: { label: "Bureau of Land Management", url: "https://www.blm.gov" },
                          USFS: { label: "US Forest Service", url: "https://www.fs.usda.gov" },
                          Wikidata: { label: "Wikidata", url: "https://www.wikidata.org" },
                          Wikipedia: { label: "Wikipedia", url: "https://en.wikipedia.org" },
                          AI: { label: "AI-assisted research", url: "#" },
                        };
                        const source = info[src.trim()];
                        if (!source) return null;
                        return (
                          <span key={src}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-primary underline decoration-dotted underline-offset-2"
                            >
                              {source.label}
                            </a>
                            {i < arr.length - 2 ? ", " : i === arr.length - 2 ? " and " : ""}
                          </span>
                        );
                      })}
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Description */}
              {listing.description && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-dark mb-4">
                    About
                  </h2>
                  {listing.description.includes("<") ? (
                    <div
                      className="prose prose-gray max-w-none"
                      dangerouslySetInnerHTML={{ __html: listing.description }}
                    />
                  ) : (
                    <div className="prose prose-gray max-w-none">
                      {listing.description.split("\n\n").map((paragraph, i) => (
                        <p key={i} className="text-gray-700 leading-relaxed mb-4">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amenities */}
              {listing.amenities && listing.amenities.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-dark mb-4">
                    {listing.type === "hiking" ? "Trail Features" : listing.type === "parks" ? "Park Amenities" : "Amenities"}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {listing.amenities.map((amenity) => (
                      <div
                        key={amenity.id}
                        className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-lg"
                      >
                        <svg
                          className="w-4 h-4 text-sage flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        <span className="text-sm text-gray-700">
                          {amenity.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Google Reviews */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-dark">
                    Reviews {displayCount > 0 ? `(${displayCount.toLocaleString()})` : ""}
                  </h2>
                  {listing.google_place_id && (
                    <a
                      href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      See all on Google
                    </a>
                  )}
                </div>

                {/* Overall rating summary */}
                {displayRating > 0 && (
                  <div className="flex items-center justify-between mb-8 p-5 bg-cream/40 rounded-xl border border-sand/20">
                    <div className="flex items-center gap-5">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-dark">
                          {Number(displayRating).toFixed(1)}
                        </div>
                        <GoogleStars rating={Number(displayRating)} />
                        <p className="text-xs text-gray-500 mt-1">
                          {Number(displayCount).toLocaleString()} reviews
                        </p>
                      </div>
                      <div className="hidden sm:block h-14 w-px bg-gray-200" />
                      <div className="hidden sm:flex items-center gap-2">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-600">Google Reviews</span>
                      </div>
                    </div>
                    {listing.google_place_id && (
                      <a
                        href={`https://search.google.com/local/writereview?placeid=${listing.google_place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        Write a review
                      </a>
                    )}
                  </div>
                )}

                {/* Individual Google Reviews */}
                {hasGoogleReviews ? (
                  <div className="space-y-6">
                    {googleReviews.map((review: GoogleReview, idx: number) => (
                      <article
                        key={idx}
                        className="border-b border-gray-100 pb-6 last:border-0"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {review.author_photo ? (
                              <img
                                src={review.author_photo}
                                alt={review.author_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-sand/30 flex items-center justify-center text-sm font-semibold text-stone">
                                {review.author_name ? review.author_name.charAt(0) : "?"}
                              </div>
                            )}
                            <div>
                              {review.author_url ? (
                                <a
                                  href={review.author_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-gray-800 hover:text-primary transition-colors"
                                >
                                  {review.author_name || "Anonymous"}
                                </a>
                              ) : (
                                <p className="text-sm font-semibold text-gray-800">
                                  {review.author_name || "Anonymous"}
                                </p>
                              )}
                              <p className="text-xs text-gray-400">
                                {review.relative_time || (review.time ? formatLongDate(review.time) : "")}
                              </p>
                            </div>
                          </div>
                          <GoogleStars rating={review.rating} />
                        </div>
                        {review.text && (
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {review.text}
                          </p>
                        )}
                      </article>
                    ))}

                    {/* Powered by Google attribution */}
                    <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <span className="text-xs text-gray-400">Powered by Google</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-8 text-center">
                    No reviews yet for this listing.
                  </p>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* Sidebar (1/3)                                                */}
            {/* ============================================================ */}
            <aside className="w-full lg:w-[380px] flex-shrink-0">
              <div className="sticky top-[100px] space-y-6">
                {/* Contact card */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-dark mb-4">
                      Contact Information
                    </h3>

                    <div className="space-y-3">
                      {listing.address && (
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="text-sm text-gray-700">{listing.address}</span>
                        </div>
                      )}
                      {listing.phone && (
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                          </svg>
                          <a href={`tel:${listing.phone}`} className="text-sm text-primary hover:text-primary/80 transition-colors">{listing.phone}</a>
                        </div>
                      )}
                      {listing.email && (
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          <a href={`mailto:${listing.email}`} className="text-sm text-primary hover:text-primary/80 transition-colors">{listing.email}</a>
                        </div>
                      )}
                      {listing.website && (
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                          </svg>
                          <a href={listing.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-primary/80 transition-colors">Visit Website</a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Booking / CTA button */}
                  <div className="px-6 pb-6">
                    <a
                      href={listing.website || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-3 bg-primary hover:bg-primary/90 text-white text-center font-semibold rounded-xl transition-colors text-sm tracking-wide"
                    >
                      {listing.type === "hiking"
                        ? "Get Trail Info"
                        : listing.type === "lodging"
                          ? "Check Availability"
                          : listing.type === "experiences"
                            ? "Book Now"
                            : listing.type === "transportation"
                              ? "Reserve"
                              : "Visit Website"}
                    </a>
                  </div>
                </div>

                {/* Map */}
                {listing.lat && listing.lng ? (
                  <GoogleMap
                    lat={Number(listing.lat)}
                    lng={Number(listing.lng)}
                    name={listing.name}
                    address={listing.address}
                    googlePlaceId={listing.google_place_id}
                  />
                ) : listing.address ? (
                  <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="h-48 flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="mt-2 text-sm text-gray-500 px-4">{listing.address}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-200">
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(listing.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Get Directions
                      </a>
                    </div>
                  </div>
                ) : null}

                {/* ETA from Zion */}
                {etaFromZion && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-sage/10 border border-sage/20 rounded-xl">
                    <svg className="w-5 h-5 text-sage flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-dark">
                        {etaFromZion.driveMinutes < 60
                          ? `${etaFromZion.driveMinutes} min`
                          : `${Math.floor(etaFromZion.driveMinutes / 60)} hr ${etaFromZion.driveMinutes % 60} min`} drive from {siteConfig.etaOrigin.name.split(" ")[0]}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(etaFromZion.distanceKm * 0.621371).toFixed(0)} miles from {siteConfig.etaOrigin.name}
                      </p>
                    </div>
                  </div>
                )}

                {/* Business hours */}
                {listing.business_hours && listing.business_hours.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-dark mb-4">Hours</h3>
                    <div className="space-y-2">
                      {dayOrder.map((day) => {
                        const hours = listing.business_hours?.find((h) => h.day === day);
                        return (
                          <div key={day} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 font-medium">{formatDay(day)}</span>
                            <span className="text-gray-800">
                              {hours ? hours.is_closed ? "Closed" : `${hours.open_time} - ${hours.close_time}` : "Not available"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
    </>
  );
}
