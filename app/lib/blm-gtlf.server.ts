// ============================================
// BLM GTLF API — Bureau of Land Management
// Ground Transportation Linear Features data.
// Fetches trail names, distances, surface types,
// and transport modes. No API key required.
// ============================================

const BLM_GTLF_URL =
  "https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF/MapServer/0/query";

// ── Response Interface ──

export interface BlmTrailData {
  trailName: string;
  distanceMiles: number;
  surface: string | null;
  transportMode: string | null; // "Non-Mechanized", "Non-Motorized", etc.
  seasonRestriction: string | null;
  accessRestriction: string | null;
  managementObjective: string | null;
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

// ── Surface Type Mapping ──

/**
 * Map BLM OBSRVE_SRFCE_TYPE codes to human-readable surface names.
 */
function mapSurfaceType(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    AGG: "aggregate",
    AC: "asphalt",
    BST: "bituminous surface",
    CON: "concrete",
    IMP: "improved native",
    NAT: "native",
    OTHER: "other",
    SNOW: "snow",
    UNK: "unknown",
  };
  return map[code.toUpperCase()] || code.toLowerCase();
}

// ── Main API Function ──

/**
 * Fetch trail data from BLM GTLF ArcGIS REST endpoint.
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
export async function fetchBlmTrailData(
  trailName: string,
  lat: number,
  lng: number
): Promise<BlmTrailData | null> {
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
        "ROUTE_PRMRY_NM,GIS_MILES,BLM_MILES,OBSRVE_SRFCE_TYPE,PLAN_MODE_TRNSPRT,PLAN_SEASON_RSTRCT_CODE,PLAN_ACCESS_RSTRCT,PLAN_PRMRY_ROUTE_MNGT_OBJTV",
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${BLM_GTLF_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`BLM GTLF API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const features = data.features || [];

    if (features.length === 0) {
      console.log(
        `BLM GTLF: No trails found near ${lat},${lng}`
      );
      return null;
    }

    // Build candidates with name matching scores
    const candidates: {
      name: string;
      miles: number;
      surface: string | null;
      transportMode: string | null;
      seasonRestriction: string | null;
      accessRestriction: string | null;
      managementObjective: string | null;
      nameScore: number;
    }[] = [];

    for (const feature of features) {
      const attrs = feature.attributes || {};
      const name = attrs.ROUTE_PRMRY_NM || "";
      if (!name) continue;

      const score = trailNameScore(trailName, name);
      const miles = attrs.GIS_MILES || attrs.BLM_MILES || 0;

      candidates.push({
        name,
        miles,
        surface: mapSurfaceType(attrs.OBSRVE_SRFCE_TYPE),
        transportMode: attrs.PLAN_MODE_TRNSPRT || null,
        seasonRestriction: attrs.PLAN_SEASON_RSTRCT_CODE || null,
        accessRestriction: attrs.PLAN_ACCESS_RSTRCT || null,
        managementObjective: attrs.PLAN_PRMRY_ROUTE_MNGT_OBJTV || null,
        nameScore: score,
      });
    }

    if (candidates.length === 0) {
      console.log(
        `BLM GTLF: Found ${features.length} features near ${lat},${lng} but none had names`
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
        `BLM GTLF: No good name match for "${trailName}" (best: "${best.name}", score: ${best.nameScore.toFixed(2)})`
      );
      return null;
    }

    console.log(
      `BLM GTLF: Found "${best.name}" (score=${best.nameScore.toFixed(2)}) — ${best.miles.toFixed(1)} mi, surface=${best.surface || "unknown"}, mode=${best.transportMode || "unknown"}`
    );

    return {
      trailName: best.name,
      distanceMiles: Math.round(best.miles * 10) / 10,
      surface: best.surface,
      transportMode: best.transportMode,
      seasonRestriction: best.seasonRestriction,
      accessRestriction: best.accessRestriction,
      managementObjective: best.managementObjective,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("BLM GTLF API timed out (10s)");
    } else {
      console.error("BLM GTLF API error:", error);
    }
    return null;
  }
}
