import { getSettings } from "./queries.server";

// ============================================
// Recreation.gov RIDB API — Permit & Facility Data
// Fetches permit requirements, fees, and
// campground info from ridb.recreation.gov
// ============================================

const RIDB_BASE_URL = "https://ridb.recreation.gov/api/v1";

/**
 * Get the RIDB API key from settings or environment variable.
 */
async function getRidbApiKey(): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (settings.ridb_api_key) {
      return settings.ridb_api_key;
    }
  } catch {
    // Fall through to env var
  }
  return process.env.RIDB_API_KEY || null;
}

// ── Response Interface ──

export interface RidbPermitInfo {
  permitRequired: boolean;
  permitDescription: string;
  fee: string | null;
  facilityName: string;
  facilityUrl: string | null;
  recAreaName: string | null;
}

// ── API Functions ──

/**
 * Fetch permit information for a trail or facility.
 *
 * Strategy:
 * 1. Search recreation areas by park name
 * 2. Search facilities within that area by trail name
 * 3. Fetch permit details for matching facilities
 *
 * @param trailName - Name of the trail (e.g., "Angels Landing")
 * @param parkName - Name of the park (e.g., "Zion National Park")
 * @returns Permit info or null if not found / no permits
 */
export async function fetchPermitInfo(
  trailName: string,
  parkName: string
): Promise<RidbPermitInfo | null> {
  const apiKey = await getRidbApiKey();
  if (!apiKey) {
    console.log("RIDB API: No API key configured, skipping");
    return null;
  }

  try {
    // Step 1: Find the recreation area
    const recArea = await findRecArea(apiKey, parkName);
    if (!recArea) {
      console.log(`RIDB: No recreation area found for "${parkName}"`);
      return null;
    }

    // Step 2: Search facilities within the recreation area
    const facility = await findFacility(apiKey, recArea.RecAreaID, trailName);
    if (!facility) {
      // Also try a broader facility search without the rec area filter
      const broadFacility = await searchFacilityDirect(apiKey, trailName, parkName);
      if (!broadFacility) {
        console.log(`RIDB: No facility found for "${trailName}" in "${parkName}"`);
        return null;
      }
      return await getPermitDetails(apiKey, broadFacility, recArea.RecAreaName);
    }

    return await getPermitDetails(apiKey, facility, recArea.RecAreaName);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("RIDB API timed out (10s)");
    } else {
      console.error("RIDB API error:", error);
    }
    return null;
  }
}

// ── Internal Helpers ──

async function findRecArea(
  apiKey: string,
  parkName: string
): Promise<{ RecAreaID: string; RecAreaName: string } | null> {
  const params = new URLSearchParams({
    query: parkName,
    limit: "5",
  });

  const res = await fetch(`${RIDB_BASE_URL}/recareas?${params}`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.error(`RIDB /recareas error: HTTP ${res.status}`);
    return null;
  }

  const data = await res.json();
  const items = data.RECDATA || [];

  if (items.length === 0) return null;

  // Find best match by name
  const normalizedPark = parkName.toLowerCase();
  let best = items[0];
  for (const item of items) {
    if (item.RecAreaName?.toLowerCase().includes(normalizedPark)) {
      best = item;
      break;
    }
  }

  return {
    RecAreaID: String(best.RecAreaID),
    RecAreaName: best.RecAreaName || parkName,
  };
}

async function findFacility(
  apiKey: string,
  recAreaId: string,
  trailName: string
): Promise<any | null> {
  const params = new URLSearchParams({
    query: trailName,
    limit: "10",
  });

  const res = await fetch(
    `${RIDB_BASE_URL}/recareas/${recAreaId}/facilities?${params}`,
    {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const items = data.RECDATA || [];

  if (items.length === 0) return null;

  // Find best match
  const normalizedTrail = trailName.toLowerCase();
  for (const item of items) {
    const facName = (item.FacilityName || "").toLowerCase();
    if (facName.includes(normalizedTrail) || normalizedTrail.includes(facName)) {
      return item;
    }
  }

  // Return first result if no exact match
  return items[0];
}

async function searchFacilityDirect(
  apiKey: string,
  trailName: string,
  parkName: string
): Promise<any | null> {
  // Try searching facilities directly with combined query
  const params = new URLSearchParams({
    query: `${trailName} ${parkName}`,
    limit: "5",
  });

  const res = await fetch(`${RIDB_BASE_URL}/facilities?${params}`, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const items = data.RECDATA || [];

  if (items.length === 0) return null;

  const normalizedTrail = trailName.toLowerCase();
  for (const item of items) {
    const facName = (item.FacilityName || "").toLowerCase();
    if (facName.includes(normalizedTrail) || normalizedTrail.includes(facName)) {
      return item;
    }
  }

  return null;
}

async function getPermitDetails(
  apiKey: string,
  facility: any,
  recAreaName: string | null
): Promise<RidbPermitInfo | null> {
  const facilityId = facility.FacilityID;
  const facilityName = facility.FacilityName || "";

  // Try to fetch permits for this facility
  const res = await fetch(
    `${RIDB_BASE_URL}/facilities/${facilityId}/permits`,
    {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    // No permits endpoint or error — but the facility itself may indicate permits
    return buildFromFacilityDescription(facility, recAreaName);
  }

  const data = await res.json();
  const permits = data.RECDATA || [];

  if (permits.length === 0) {
    return buildFromFacilityDescription(facility, recAreaName);
  }

  // Compile permit information
  const descriptions: string[] = [];
  let fee: string | null = null;

  for (const permit of permits) {
    if (permit.PermitDescription) {
      descriptions.push(stripHtml(permit.PermitDescription));
    }
    if (permit.PermitFee && !fee) {
      fee = `$${permit.PermitFee}`;
    }
  }

  const facilityUrl = facility.FacilityReservationURL ||
    (facilityId ? `https://www.recreation.gov/permits/${facilityId}` : null);

  return {
    permitRequired: true,
    permitDescription: descriptions.join(" ") || `A permit is required for ${facilityName}.`,
    fee,
    facilityName,
    facilityUrl,
    recAreaName,
  };
}

/**
 * Build permit info from facility description text when no explicit permits exist.
 */
function buildFromFacilityDescription(
  facility: any,
  recAreaName: string | null
): RidbPermitInfo | null {
  const desc = (facility.FacilityDescription || "").toLowerCase();
  const name = facility.FacilityName || "";

  // Check if the description mentions permits
  const mentionsPermit = desc.includes("permit") || desc.includes("lottery") || desc.includes("reservation required");

  if (!mentionsPermit) return null;

  const facilityUrl = facility.FacilityReservationURL ||
    (facility.FacilityID ? `https://www.recreation.gov/permits/${facility.FacilityID}` : null);

  return {
    permitRequired: true,
    permitDescription: stripHtml(facility.FacilityDescription || `A permit may be required for ${name}.`),
    fee: null,
    facilityName: name,
    facilityUrl,
    recAreaName,
  };
}

/**
 * Strip HTML tags from RIDB text fields.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
