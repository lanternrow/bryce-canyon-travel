// ============================================
// USFS Trail API — US Forest Service
// Enterprise Data Warehouse trail data.
// Fetches trail class, difficulty, surface,
// grade, season, and accessibility info.
// No API key required.
// ============================================

const USFS_TRAIL_URL =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query";

// ── Response Interface ──

export interface UsfsTrailData {
  trailName: string;
  distanceMiles: number;
  trailClass: string | null; // raw "1"-"5" or "TC1"-"TC5"
  difficulty: string | null; // mapped: "easy" | "moderate" | "hard" | "expert"
  surface: string | null;
  surfaceFirmness: string | null;
  typicalGrade: number | null; // percentage as number
  hikerManaged: string | null; // "Year-Long" or "06/01-10/31"
  accessibilityStatus: string | null;
  nationalTrailDesignation: string | null;
  seasonStart: string | null; // parsed month name
  seasonEnd: string | null;
}

// ── Name Matching (same approach as overpass-api.server.ts) ──

function normalizeTrailName(name: string): string {
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

function trailNameScoreSingle(query: string, candidate: string): number {
  const qNorm = normalizeTrailName(query);
  const cNorm = normalizeTrailName(candidate);

  if (qNorm === cNorm) return 1.0;
  if (cNorm.includes(qNorm) || qNorm.includes(cNorm)) return 0.8;

  const qWords = new Set(qNorm.split(" ").filter(Boolean));
  const cWords = new Set(cNorm.split(" ").filter(Boolean));
  let overlap = 0;
  for (const w of qWords) {
    if (cWords.has(w)) overlap++;
  }
  const union = new Set([...qWords, ...cWords]).size;
  return union > 0 ? overlap / union : 0;
}

function trailNameScore(query: string, candidate: string): number {
  let best = trailNameScoreSingle(query, candidate);
  if (best >= 1.0) return best;

  const parts = candidate.split(/\s*(?:--|\/|&)\s*/).filter(Boolean);
  if (parts.length > 1) {
    for (const part of parts) {
      const partScore = trailNameScoreSingle(query, part);
      if (partScore > best) best = partScore;
      if (best >= 1.0) return best;
    }
  }

  return best;
}

// ── Trail Class → Difficulty Mapping ──

/**
 * Map USFS TRAIL_CLASS codes to difficulty levels.
 * "1"/"TC1" and "2"/"TC2" → "easy"
 * "3"/"TC3" → "moderate"
 * "4"/"TC4" → "hard"
 * "5"/"TC5" → "expert"
 */
function mapDifficulty(trailClass: string | null): string | null {
  if (!trailClass) return null;
  const normalized = trailClass.toUpperCase().replace("TC", "");
  const map: Record<string, string> = {
    "1": "easy",
    "2": "easy",
    "3": "moderate",
    "4": "hard",
    "5": "expert",
  };
  return map[normalized] || null;
}

// ── Surface Type Mapping ──

/**
 * Map USFS TRAIL_SURFACE codes to human-readable surface names.
 * USFS uses uppercase values like "NATIVE", "AGGREGATE", etc.
 */
function mapSurfaceType(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    NATIVE: "native",
    AGGREGATE: "aggregate",
    ASPHALT: "asphalt",
    CONCRETE: "concrete",
    IMPORTED: "imported material",
    SNOW: "snow",
    ICE: "ice",
    WOOD: "wood",
    OTHER: "other",
    UNKNOWN: "unknown",
  };
  return map[code.toUpperCase()] || code.toLowerCase();
}

// ── Grade Parsing ──

/**
 * Parse USFS TYPICAL_TRAIL_GRADE strings like "5-8%" or "0-5%"
 * into a numeric average percentage.
 */
function parseGrade(grade: string | null): number | null {
  if (!grade) return null;
  const rangeMatch = grade.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)%?/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return Math.round(((low + high) / 2) * 10) / 10;
  }
  const singleMatch = grade.match(/(\d+(?:\.\d+)?)%?/);
  if (singleMatch) {
    return parseFloat(singleMatch[1]);
  }
  return null;
}

// ── Season Parsing ──

const MONTH_NAMES: Record<number, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

/**
 * Parse USFS HIKER_PEDESTRIAN_MANAGED season strings.
 * "Year-Long" → { start: null, end: null }
 * "06/01-10/31" → { start: "June", end: "October" }
 * null → not a hiking trail
 */
function parseSeason(managed: string | null): {
  start: string | null;
  end: string | null;
} {
  if (!managed) return { start: null, end: null };
  if (managed.toLowerCase().includes("year-long") || managed.toLowerCase().includes("year long")) {
    return { start: null, end: null };
  }
  const match = managed.match(/(\d{2})\/\d{2}\s*-\s*(\d{2})\/\d{2}/);
  if (match) {
    const startMonth = parseInt(match[1], 10);
    const endMonth = parseInt(match[2], 10);
    return {
      start: MONTH_NAMES[startMonth] || null,
      end: MONTH_NAMES[endMonth] || null,
    };
  }
  return { start: null, end: null };
}

// ── Main API Function ──

/**
 * Fetch trail data from USFS ArcGIS REST endpoint.
 *
 * Strategy:
 * 1. Spatial query: bounding box ~3km around given coordinates
 * 2. Match by name similarity (reuse same fuzzy matching as Overpass)
 * 3. Fall back to nearest/longest trail within bbox if no name match
 *
 * @param trailName - Name of the trail to search for
 * @param lat - Latitude of the trailhead or area
 * @param lng - Longitude of the trailhead or area
 * @returns Trail data or null if not found
 */
export async function fetchUsfsTrailData(
  trailName: string,
  lat: number,
  lng: number
): Promise<UsfsTrailData | null> {
  try {
    // Build a ~3km bounding box around the coordinates
    const delta = 0.03; // ~3km at mid-latitudes
    const xmin = lng - delta;
    const ymin = lat - delta;
    const xmax = lng + delta;
    const ymax = lat + delta;

    const params = new URLSearchParams({
      where: "1=1",
      geometry: `${xmin},${ymin},${xmax},${ymax}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields:
        "TRAIL_NAME,TRAIL_CLASS,TRAIL_SURFACE,SURFACE_FIRMNESS,TYPICAL_TRAIL_GRADE,GIS_MILES,HIKER_PEDESTRIAN_MANAGED,PACK_SADDLE_MANAGED,BICYCLE_MANAGED,ACCESSIBILITY_STATUS,NATIONAL_TRAIL_DESIGNATION",
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${USFS_TRAIL_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`USFS Trail API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const features = data.features || [];

    if (features.length === 0) {
      console.log(
        `USFS Trails: No trails found near ${lat},${lng}`
      );
      return null;
    }

    // Build candidates with name matching scores
    const candidates: {
      name: string;
      miles: number;
      trailClass: string | null;
      difficulty: string | null;
      surface: string | null;
      surfaceFirmness: string | null;
      typicalGrade: number | null;
      hikerManaged: string | null;
      accessibilityStatus: string | null;
      nationalTrailDesignation: string | null;
      seasonStart: string | null;
      seasonEnd: string | null;
      nameScore: number;
    }[] = [];

    for (const feature of features) {
      const attrs = feature.attributes || {};
      const name = attrs.TRAIL_NAME || "";
      if (!name) continue;

      const score = trailNameScore(trailName, name);
      const miles = attrs.GIS_MILES || 0;
      const season = parseSeason(attrs.HIKER_PEDESTRIAN_MANAGED);

      candidates.push({
        name,
        miles,
        trailClass: attrs.TRAIL_CLASS || null,
        difficulty: mapDifficulty(attrs.TRAIL_CLASS),
        surface: mapSurfaceType(attrs.TRAIL_SURFACE),
        surfaceFirmness: attrs.SURFACE_FIRMNESS || null,
        typicalGrade: parseGrade(attrs.TYPICAL_TRAIL_GRADE),
        hikerManaged: attrs.HIKER_PEDESTRIAN_MANAGED || null,
        accessibilityStatus: attrs.ACCESSIBILITY_STATUS || null,
        nationalTrailDesignation: attrs.NATIONAL_TRAIL_DESIGNATION || null,
        seasonStart: season.start,
        seasonEnd: season.end,
        nameScore: score,
      });
    }

    if (candidates.length === 0) {
      console.log(
        `USFS Trails: Found ${features.length} features near ${lat},${lng} but none had names`
      );
      return null;
    }

    // Sort: best name matches first, then by distance (longer = more useful)
    candidates.sort((a, b) => {
      if (Math.abs(a.nameScore - b.nameScore) > 0.1) {
        return b.nameScore - a.nameScore;
      }
      return b.miles - a.miles;
    });

    const best = candidates[0];

    // Require at least some name match quality (0.3 = one word overlap)
    if (best.nameScore < 0.2) {
      console.log(
        `USFS Trails: No good name match for "${trailName}" (best: "${best.name}", score: ${best.nameScore.toFixed(2)})`
      );
      return null;
    }

    console.log(
      `USFS Trails: Found "${best.name}" (score=${best.nameScore.toFixed(2)}) — ${best.miles.toFixed(1)} mi, class=${best.trailClass || "unknown"}, difficulty=${best.difficulty || "unknown"}`
    );

    return {
      trailName: best.name,
      distanceMiles: Math.round(best.miles * 10) / 10,
      trailClass: best.trailClass,
      difficulty: best.difficulty,
      surface: best.surface,
      surfaceFirmness: best.surfaceFirmness,
      typicalGrade: best.typicalGrade,
      hikerManaged: best.hikerManaged,
      accessibilityStatus: best.accessibilityStatus,
      nationalTrailDesignation: best.nationalTrailDesignation,
      seasonStart: best.seasonStart,
      seasonEnd: best.seasonEnd,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("USFS Trail API timed out (10s)");
    } else {
      console.error("USFS Trail API error:", error);
    }
    return null;
  }
}
