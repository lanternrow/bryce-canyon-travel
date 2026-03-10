import { getSettings } from "./queries.server";

// ============================================
// NPS API — National Park Service Data
// Fetches trail descriptions, activity info,
// and park alerts from developer.nps.gov
// ============================================

const NPS_BASE_URL = "https://developer.nps.gov/api/v1";

/**
 * Get the NPS API key from settings or environment variable.
 */
async function getNpsApiKey(): Promise<string | null> {
  try {
    const settings = await getSettings();
    if (settings.nps_api_key) {
      return settings.nps_api_key;
    }
  } catch {
    // Fall through to env var
  }
  return process.env.NPS_API_KEY || null;
}

// ── Response Interfaces ──

export interface NpsThingsToDo {
  title: string;
  shortDescription: string;
  longDescription: string;
  duration: string;
  season: string[];
  doFeesApply: boolean;
  arePetsPermitted: string;
  arePetsPermittedWithRestrictions: boolean;
  petsDescription: string;
  images: { url: string; altText: string; title: string }[];
  url: string;
  topics: string[];
  activities: string[];
  accessibilityInformation: string;
  // Accessibility text from ALL related NPS results (not just primary match).
  // NPS splits multi-segment trails into separate entries (e.g., "Angels Landing"
  // = chain section only, "West Rim to Scout Lookout" = approach trail with full specs).
  // This allows parseNpsTrailSpecs() to find distance/elevation across all results.
  relatedAccessibilityTexts: string[];
}

export interface NpsAlert {
  title: string;
  description: string;
  category: string; // "Danger", "Caution", "Park Closure", "Information"
  url: string;
}

// ── Fuzzy Name Matching ──

/**
 * Normalize a trail name for comparison.
 * Strips common suffixes, lowercases, removes punctuation.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\btrailhead\b/g, "")
    .replace(/\btrail\b/g, "")
    .replace(/\bhike\b/g, "")
    .replace(/\bhiking\b/g, "")
    .replace(/\bpath\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well two names match (0-1, higher = better).
 * Uses word overlap as a simple similarity metric.
 */
function nameMatchScore(query: string, candidate: string): number {
  const qWords = new Set(normalizeName(query).split(" ").filter(Boolean));
  const cWords = new Set(normalizeName(candidate).split(" ").filter(Boolean));

  if (qWords.size === 0 || cWords.size === 0) return 0;

  let overlap = 0;
  for (const w of qWords) {
    if (cWords.has(w)) overlap++;
  }

  // Jaccard-like: overlap / union
  const union = new Set([...qWords, ...cWords]).size;
  return overlap / union;
}

// ── API Functions ──

/**
 * Fetch "Things To Do" from NPS that match a trail name.
 * Returns the best-matching activity entry, or null.
 */
export async function fetchNpsThingsToDo(
  trailName: string,
  parkCode: string
): Promise<NpsThingsToDo | null> {
  const apiKey = await getNpsApiKey();
  if (!apiKey) {
    console.log("NPS API: No API key configured, skipping");
    return null;
  }

  try {
    const params = new URLSearchParams({
      parkCode,
      q: trailName,
      limit: "10",
    });

    const res = await fetch(`${NPS_BASE_URL}/thingstodo?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`NPS API /thingstodo error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const items = data.data || [];

    if (items.length === 0) return null;

    // Find best match by name similarity
    let bestMatch = items[0];
    let bestScore = nameMatchScore(trailName, items[0].title);

    for (let i = 1; i < items.length; i++) {
      const score = nameMatchScore(trailName, items[i].title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = items[i];
      }
    }

    // Require at least some match quality
    if (bestScore < 0.2) {
      console.log(`NPS API: No good match for "${trailName}" (best: "${bestMatch.title}", score: ${bestScore.toFixed(2)})`);
      return null;
    }

    const item = bestMatch;

    // Note: NPS often splits multi-segment trails into separate entries (e.g., "Angels
    // Landing" = chain section only, "West Rim to Scout Lookout" = approach trail).
    // We don't merge across entries because name matching can't reliably determine which
    // entries belong to the same trail. The two-stage auto-fill workflow allows admins
    // to review and correct distance values before content generation.
    const relatedAccessibilityTexts: string[] = [];

    return {
      title: item.title || "",
      shortDescription: stripHtml(item.shortDescription || ""),
      longDescription: stripHtml(item.longDescription || ""),
      duration: item.duration || "",
      season: item.season || [],
      doFeesApply: item.doFeesApply === "true" || item.doFeesApply === true,
      arePetsPermitted: item.arePetsPermitted || "",
      arePetsPermittedWithRestrictions: item.arePetsPermittedWithRestrictions === "true" || item.arePetsPermittedWithRestrictions === true,
      petsDescription: stripHtml(item.petsDescription || ""),
      images: (item.images || []).map((img: any) => ({
        url: img.url || "",
        altText: img.altText || "",
        title: img.title || "",
      })),
      url: item.url || "",
      topics: (item.topics || []).map((t: any) => t.name || t),
      activities: (item.activities || []).map((a: any) => a.name || a),
      accessibilityInformation: stripHtml(item.accessibilityInformation || ""),
      relatedAccessibilityTexts,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("NPS API /thingstodo timed out (10s)");
    } else {
      console.error("NPS API /thingstodo error:", error);
    }
    return null;
  }
}

/**
 * Fetch active park alerts (closures, danger, caution).
 * Returns alerts relevant to trail conditions.
 */
export async function fetchNpsAlerts(
  parkCode: string
): Promise<NpsAlert[]> {
  const apiKey = await getNpsApiKey();
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      parkCode,
      limit: "50",
    });

    const res = await fetch(`${NPS_BASE_URL}/alerts?${params}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`NPS API /alerts error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data.data || [];

    // Filter to actionable alert categories
    const relevantCategories = ["Danger", "Caution", "Park Closure"];

    return items
      .filter((item: any) => relevantCategories.includes(item.category))
      .map((item: any) => ({
        title: item.title || "",
        description: stripHtml(item.description || ""),
        category: item.category || "",
        url: item.url || "",
      }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("NPS API /alerts timed out (10s)");
    } else {
      console.error("NPS API /alerts error:", error);
    }
    return [];
  }
}

/**
 * Strip HTML tags from NPS text fields.
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

// ── NPS Accessibility Data Parser ──

export interface NpsTrailSpecs {
  distanceMiles: number | null;
  distanceType: "round-trip" | "one-way" | "unknown";
  elevationGainFt: number | null;
}

/**
 * Parse structured trail distance and elevation from NPS accessibilityInformation.
 * The NPS "Things To Do" API includes no dedicated distance field, but the
 * accessibilityInformation field often contains structured data like:
 *   "1037ft / 316m of elevation change over 14mi / 22.5km"
 *   "Length (one way) | 1 mi (1.6 km)"
 *   "3.9 mi round-trip"
 *   "1.9 mi one-way"
 *
 * Also checks longDescription and shortDescription as fallbacks.
 */
export function parseNpsTrailSpecs(nps: NpsThingsToDo): NpsTrailSpecs {
  const result: NpsTrailSpecs = {
    distanceMiles: null,
    distanceType: "unknown",
    elevationGainFt: null,
  };

  // Combine all text fields for searching (accessibility is richest, check it first).
  // Then fall back to relatedAccessibilityTexts from other NPS results for the same
  // search. This handles multi-segment trails where the primary match (e.g., "Angels
  // Landing" chain section) has no distance data, but a related entry (e.g., "West Rim
  // to Scout Lookout") has full structured specs.
  const texts = [
    nps.accessibilityInformation,
    nps.longDescription,
    nps.shortDescription,
    ...(nps.relatedAccessibilityTexts || []),
  ].filter(Boolean);

  for (const text of texts) {
    if (!text) continue;

    // ── Extract distance ──
    if (result.distanceMiles === null) {
      // Pattern: "X.X mi round-trip" or "X.X-mile round trip"
      const rtMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*mi(?:les?)?\s*(?:\([^)]*\))?\s*round[\s-]*trip/i);
      if (rtMatch) {
        result.distanceMiles = parseFloat(rtMatch[1]);
        result.distanceType = "round-trip";
        continue; // Found round-trip, this is the best form — move on
      }

      // Pattern: "X.X mi one-way" or "X.X miles one way"
      const owMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*mi(?:les?)?\s*(?:\([^)]*\))?\s*one[\s-]*way/i);
      if (owMatch) {
        result.distanceMiles = parseFloat(owMatch[1]);
        result.distanceType = "one-way";
        continue;
      }

      // Pattern: "Length (one way) | X mi" or "Length (round trip) | X mi"
      const lengthMatch = text.match(/length\s*\(([^)]+)\)\s*\|?\s*(\d+(?:\.\d+)?)\s*mi/i);
      if (lengthMatch) {
        result.distanceMiles = parseFloat(lengthMatch[2]);
        result.distanceType = lengthMatch[1].toLowerCase().includes("round") ? "round-trip" : "one-way";
        continue;
      }

      // Pattern: "over Xmi" or "over X.X mi" (common in accessibility text)
      const overMatch = text.match(/over\s+(\d+(?:\.\d+)?)\s*mi(?:les?)?/i);
      if (overMatch) {
        result.distanceMiles = parseFloat(overMatch[1]);
        result.distanceType = "unknown";
        continue;
      }
    }

    // ── Extract elevation gain ──
    if (result.elevationGainFt === null) {
      // Pattern: "1037ft elevation" or "1,489 ft of elevation" or "1037ft / 316m of elevation"
      const eleMatch = text.match(/(\d[\d,]*(?:\.\d+)?)\s*ft\s*(?:\/\s*\d+\s*m\s*)?(?:of\s+)?elevation/i);
      if (eleMatch) {
        result.elevationGainFt = parseInt(eleMatch[1].replace(/,/g, ""));
      }
      // Pattern: "elevation gain: 1,489 ft" or "elevation change of 1037 ft"
      if (result.elevationGainFt === null) {
        const eleMatch2 = text.match(/elevation\s+(?:gain|change)\s*(?:of|:)?\s*(\d[\d,]*(?:\.\d+)?)\s*ft/i);
        if (eleMatch2) {
          result.elevationGainFt = parseInt(eleMatch2[1].replace(/,/g, ""));
        }
      }
      // Pattern: "Gain: 1187 ft" or "Gain: 1,489 ft (361.8 m)" (NPS structured accessibility format)
      if (result.elevationGainFt === null) {
        const gainMatch = text.match(/Gain:\s*(\d[\d,]*(?:\.\d+)?)\s*ft/i);
        if (gainMatch) {
          result.elevationGainFt = parseInt(gainMatch[1].replace(/,/g, ""));
        }
      }
    }
  }

  if (result.distanceMiles !== null) {
    console.log(`NPS trail specs: ${result.distanceMiles} mi (${result.distanceType}), elevation gain: ${result.elevationGainFt ?? "unknown"} ft`);
  }

  return result;
}
