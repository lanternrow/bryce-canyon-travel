// ============================================
// ZION TRAVEL — JSON-LD Schema Builders
// ============================================
// Pure functions with zero React / server deps.
// Safe to call inside React Router v7 meta().
// ============================================

import { getNewsArticleUrl } from "./news-url";
import { siteConfig } from "./site-config";

const SITE_URL = siteConfig.siteUrl;
const SITE_NAME = siteConfig.siteName;

// ── Helpers ──────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return phone;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// ── Schema @type mapping ─────────────────────

const LISTING_TYPE_TO_SCHEMA: Record<string, string> = {
  dining: "Restaurant",
  lodging: "LodgingBusiness",
  experiences: "TouristAttraction",
  hiking: "TouristAttraction",
  transportation: "LocalBusiness",
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  dining: "Dining",
  lodging: "Lodging",
  experiences: "Experiences",
  hiking: "Hiking",
  transportation: "Transportation",
};

// ── Shared nodes ─────────────────────────────

export function buildWebSiteSchema() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description: siteConfig.defaults.schemaDescription,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/dining?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbs(
  items: { name: string; url?: string }[],
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => {
      const entry: Record<string, unknown> = {
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
      };
      // Last item (current page) omits the URL per schema.org spec
      if (item.url) entry.item = item.url;
      return entry;
    }),
  };
}

// ── Business hours → OpeningHoursSpecification ─

function mapBusinessHours(hours: any[]): any[] | undefined {
  if (!hours || hours.length === 0) return undefined;
  const specs = hours
    .filter((h: any) => !h.is_closed && h.open_time && h.close_time)
    .map((h: any) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: capitalize(h.day),
      opens: h.open_time,
      closes: h.close_time,
    }));
  return specs.length > 0 ? specs : undefined;
}

// ── Listing schema (LocalBusiness family) ────

export function buildListingSchema(
  listing: any,
  googleRating: number | null | undefined,
  googleReviewCount: number | null | undefined,
) {
  const canonicalUrl = `${SITE_URL}/listing/${listing.type}/${listing.slug}`;
  const schemaType =
    LISTING_TYPE_TO_SCHEMA[listing.type] || "LocalBusiness";
  const typeLabel = LISTING_TYPE_LABELS[listing.type] || capitalize(listing.type);

  // Main entity
  const entity: Record<string, unknown> = {
    "@type": schemaType,
    "@id": `${canonicalUrl}/#listing`,
    name: listing.name,
    url: canonicalUrl,
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };

  // Description
  if (listing.meta_description || listing.tagline || listing.description) {
    entity.description = listing.meta_description
      || listing.tagline
      || stripHtml(listing.description).slice(0, 250);
  }

  // Image
  if (listing.featured_image) {
    entity.image = listing.featured_image;
  }

  // Telephone
  if (listing.phone) {
    entity.telephone = formatPhoneE164(listing.phone);
  }

  // Address
  if (listing.address || listing.city) {
    const addr: Record<string, unknown> = {
      "@type": "PostalAddress",
    };
    if (listing.address) addr.streetAddress = listing.address;
    if (listing.city) addr.addressLocality = listing.city;
    if (listing.state) addr.addressRegion = listing.state;
    if (listing.zip) addr.postalCode = listing.zip;
    addr.addressCountry = "US";
    entity.address = addr;
  }

  // Geo
  if (listing.lat && listing.lng) {
    entity.geo = {
      "@type": "GeoCoordinates",
      latitude: listing.lat,
      longitude: listing.lng,
    };
  }

  // Price range
  if (listing.price_range) {
    entity.priceRange = listing.price_range;
  }

  // Aggregate rating (prefer Google data)
  const rating = googleRating || listing.avg_rating;
  const reviewCount = googleReviewCount || listing.review_count;
  if (rating && rating > 0 && reviewCount && reviewCount > 0) {
    entity.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating,
      reviewCount: reviewCount,
    };
  }

  // Business hours
  const hoursSpec = mapBusinessHours(listing.business_hours);
  if (hoursSpec) {
    entity.openingHoursSpecification = hoursSpec;
  }

  // Website
  if (listing.website) {
    entity.sameAs = listing.website;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildWebSiteSchema(),
      buildBreadcrumbs([
        { name: "Home", url: SITE_URL },
        { name: typeLabel, url: `${SITE_URL}/${listing.type}` },
        { name: listing.name },
      ]),
      entity,
    ],
  };
}

// ── Blog post schema (BlogPosting) ──────────

export function buildBlogPostSchema(post: any) {
  const canonicalUrl = getNewsArticleUrl(post.slug);

  const article: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${canonicalUrl}/#article`,
    headline: post.meta_title || post.title,
    url: canonicalUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  // Description
  if (post.meta_description || post.excerpt) {
    article.description = post.meta_description || post.excerpt;
  }

  // Dates
  if (post.published_at) {
    article.datePublished = post.published_at;
  }
  if (post.updated_at) {
    article.dateModified = post.updated_at;
  } else if (post.published_at) {
    article.dateModified = post.published_at;
  }

  // Image
  if (post.featured_image) {
    article.image = post.featured_image;
  }

  // Category
  if (post.category) {
    article.articleSection = post.category;
  }

  // Word count (computed from content HTML)
  if (post.content) {
    const plainText = stripHtml(post.content).trim();
    const wc = plainText.split(/\s+/).filter(Boolean).length;
    if (wc > 0) article.wordCount = wc;
  }

  // Keywords
  if (post.focus_keyphrase) {
    article.keywords = post.focus_keyphrase;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildWebSiteSchema(),
      buildBreadcrumbs([
        { name: "Home", url: SITE_URL },
        { name: "News", url: `${SITE_URL}/news` },
        { name: post.meta_title || post.title },
      ]),
      article,
    ],
  };
}
