// ============================================
// PUBLISH GATE — Minimum content requirements
// for a listing to be published.
// Pure functions — works on both server and client.
// ============================================

export interface PublishCheckItem {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface PublishCheckResult {
  canPublish: boolean;
  checks: PublishCheckItem[];
  metCount: number;
  totalCount: number;
}

const VALID_TYPES = ["dining", "lodging", "experiences", "hiking", "transportation", "parks", "golf"];
const MIN_DESCRIPTION_WORDS = 150;

// Category slugs that don't require business contact info (address, phone)
const NON_BUSINESS_CATEGORY_SLUGS = ["points-of-interest", "airport"];

/**
 * Check whether a listing meets minimum requirements for publishing.
 */
export function checkPublishRequirements(listing: {
  name?: string | null;
  type?: string | null;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  has_no_phone?: boolean | null;
  google_place_id?: string | null;
  has_no_google_place_id?: boolean | null;
  city?: string | null;
  category_id?: number | string | null;
  location_id?: number | string | null;
  category_slug?: string | null;
}): PublishCheckResult {
  const descWordCount = countWords(listing.description);

  const isHiking = listing.type === "hiking";
  const isParks = listing.type === "parks";
  const isNonBusiness = isHiking || isParks || NON_BUSINESS_CATEGORY_SLUGS.includes(listing.category_slug || "");

  const checks: PublishCheckItem[] = [
    {
      key: "name",
      label: isNonBusiness ? (isHiking ? "Trail name" : isParks ? "Park name" : "Name") : "Business name",
      met: Boolean(listing.name && listing.name.trim().length > 0),
      detail: isHiking ? "A trail name is required." : "A listing name is required.",
    },
    {
      key: "type",
      label: "Listing type",
      met: Boolean(listing.type && VALID_TYPES.includes(listing.type)),
      detail: "Select a listing type (Dining, Lodging, Experiences, Hiking, Transportation, or Parks).",
    },
    {
      key: "description",
      label: `Description (${MIN_DESCRIPTION_WORDS}+ words)`,
      met: descWordCount >= MIN_DESCRIPTION_WORDS,
      detail: descWordCount === 0
        ? "A description is required."
        : `Currently ${descWordCount} words — minimum is ${MIN_DESCRIPTION_WORDS}.`,
    },
    // Address and phone are optional for hiking trails and points of interest
    ...(!isNonBusiness
      ? [
          {
            key: "address",
            label: "Street address",
            met: Boolean(listing.address && listing.address.trim().length > 0),
            detail: "A street address is required.",
          },
          {
            key: "phone",
            label: "Phone number (or mark no phone)",
            met: Boolean(listing.phone && listing.phone.trim().length > 0) || Boolean(listing.has_no_phone),
            detail: "Add a phone number or check \"Has no phone number.\"",
          },
        ]
      : []),
    {
      key: "google_place_id",
      label: "Google Place ID (or mark N/A)",
      met: Boolean(listing.google_place_id && listing.google_place_id.trim().length > 0) || Boolean(listing.has_no_google_place_id),
      detail: "Add a Google Place ID or check \"No Google Place ID available.\"",
    },
    {
      key: "city",
      label: isNonBusiness ? "City / nearest town" : "City",
      met: Boolean(listing.city && listing.city.trim().length > 0),
      detail: isNonBusiness ? "A nearest town is required." : "A city is required.",
    },
    {
      key: "category_id",
      label: "Category",
      met: Boolean(listing.category_id && Number(listing.category_id) > 0),
      detail: "Select a category for this listing.",
    },
    {
      key: "location_id",
      label: "Location (town/area)",
      met: Boolean(listing.location_id && Number(listing.location_id) > 0),
      detail: "Select a location from the town/area dropdown.",
    },
  ];

  const metCount = checks.filter((c) => c.met).length;

  return {
    canPublish: checks.every((c) => c.met),
    checks,
    metCount,
    totalCount: checks.length,
  };
}

/**
 * Count words in a string (strips HTML tags first).
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const plain = text.replace(/<[^>]*>/g, " ");
  return plain.trim().split(/\s+/).filter(Boolean).length;
}
