// ============================================
// OpenStreetMap Overpass API — Trail Geometry
// Fetches trail distance, difficulty, surface,
// dog policy, water, elevation, and more.
// No API key required.
// ============================================

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// ── Response Interface ──

export interface OverpassTrailData {
  distanceMiles: number;
  sacScale: string | null;     // raw OSM sac_scale tag
  difficulty: string | null;   // mapped: "easy" | "moderate" | "hard" | "expert"
  surface: string | null;      // e.g., "rock", "paved", "gravel"
  trailType: string | null;    // "out_and_back" | "loop" | "point_to_point" (inferred)
  osmName: string;             // actual name from OSM
  // Enhanced OSM tags
  dogPolicy: string | null;        // "yes", "no", "leashed" from tag:dog
  drinkingWater: string | null;    // "yes", "no" from tag:drinking_water
  wheelchair: string | null;       // "yes", "no", "limited" from tag:wheelchair
  trailVisibility: string | null;  // from tag:trail_visibility
  description: string | null;      // from tag:description
  access: string | null;           // "yes", "permissive", "private" from tag:access
  elevationGainFt: number | null;  // calculated from node ele tags
  polylineCoords: [number, number][] | null; // raw coords for USGS elevation
}

// ── SAC Scale to Difficulty Mapping ──

const SAC_SCALE_MAP: Record<string, string> = {
  hiking: "easy",
  mountain_hiking: "moderate",
  demanding_mountain_hiking: "hard",
  alpine_hiking: "expert",
  demanding_alpine_hiking: "expert",
  difficult_alpine_hiking: "expert",
};

// ── Haversine Distance Calculation ──

/**
 * Calculate distance between two lat/lng points in meters.
 */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate total distance along a polyline of coordinate pairs.
 * Returns distance in miles.
 */
function calculatePolylineDistance(coords: [number, number][]): number {
  let totalMeters = 0;
  for (let i = 1; i < coords.length; i++) {
    totalMeters += haversineMeters(
      coords[i - 1][0], coords[i - 1][1],
      coords[i][0], coords[i][1]
    );
  }
  return totalMeters / 1609.344; // meters to miles
}

/**
 * Infer trail type from geometry: loop vs out-and-back vs point-to-point.
 */
function inferTrailType(coords: [number, number][]): string | null {
  if (coords.length < 3) return null;

  const start = coords[0];
  const end = coords[coords.length - 1];
  const distBetween = haversineMeters(start[0], start[1], end[0], end[1]);

  // If start and end are within 100m, it's a loop
  if (distBetween < 100) return "loop";

  // Otherwise assume out-and-back (most common for hiking)
  return "out_and_back";
}

/**
 * Find the midpoint of a way's coordinates (for proximity ranking).
 */
function wayMidpoint(coords: [number, number][]): [number, number] | null {
  if (coords.length === 0) return null;
  const mid = Math.floor(coords.length / 2);
  return coords[mid];
}

// ── Elevation Gain Calculation ──

/**
 * Calculate cumulative elevation gain from a sequence of node IDs.
 * Uses the `ele` tag on OSM nodes (elevation in meters).
 * Returns gain in feet, or null if insufficient elevation data.
 */
function calculateElevationGain(
  nodeIds: number[],
  nodes: Map<number, { lat: number; lon: number; ele: number | null }>
): number | null {
  const elevations: number[] = [];
  for (const nodeId of nodeIds) {
    const node = nodes.get(nodeId);
    if (node?.ele !== null && node?.ele !== undefined) {
      elevations.push(node.ele);
    }
  }
  if (elevations.length < 2) return null;

  let gain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) gain += diff;
  }
  // Convert meters to feet
  const gainFt = Math.round(gain * 3.28084);
  return gainFt > 0 ? gainFt : null;
}

// ── Name Matching ──

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

  // Exact match
  if (qNorm === cNorm) return 1.0;

  // Substring match
  if (cNorm.includes(qNorm) || qNorm.includes(cNorm)) return 0.8;

  // Word overlap
  const qWords = new Set(qNorm.split(" ").filter(Boolean));
  const cWords = new Set(cNorm.split(" ").filter(Boolean));
  let overlap = 0;
  for (const w of qWords) {
    if (cWords.has(w)) overlap++;
  }
  const union = new Set([...qWords, ...cWords]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * Score trail names, handling composite names like "Angels Landing Trail--West Rim Trail".
 * Splits on common delimiters (--, /, &) and scores each part separately,
 * returning the highest score. This ensures a relation named
 * "Trail A--Trail B" scores 1.0 against a query of "Trail A".
 */
function trailNameScore(query: string, candidate: string): number {
  // Score against the full name first
  let best = trailNameScoreSingle(query, candidate);
  if (best >= 1.0) return best;

  // Split composite names on common delimiters and score each part
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

// ── Main API Function ──

/**
 * Fetch trail data from OpenStreetMap via Overpass API.
 *
 * Strategy:
 * 1. Search for hiking routes or tagged paths within a bounding box
 *    around the given coordinates, then match by name.
 * 2. If no name match, fall back to the nearest/longest trail
 *    within close proximity to the given coordinates.
 *
 * @param trailName - Name of the trail to search for
 * @param lat - Latitude of the trailhead or area
 * @param lng - Longitude of the trailhead or area
 * @returns Trail data or null if not found
 */
export async function fetchTrailFromOverpass(
  trailName: string,
  lat: number,
  lng: number
): Promise<OverpassTrailData | null> {
  try {
    // Build a ~5km bounding box around the coordinates
    const delta = 0.05; // ~5km at this latitude
    const south = lat - delta;
    const north = lat + delta;
    const west = lng - delta;
    const east = lng + delta;
    const bbox = `${south},${west},${north},${east}`;

    // Extract core name words for a looser regex match
    const coreWords = normalizeTrailName(trailName).split(" ").filter(Boolean);
    // Build regex that matches any trail containing the core words (case-insensitive)
    const looseRegex = coreWords.length > 0
      ? coreWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
      : trailName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Query: Find hiking routes AND tagged footways/paths
    // Uses three approaches to maximize hits:
    // 1. relation[route=hiking] with loose name match
    // 2. way[highway~"path|footway|track"] with loose name match
    // 3. ALL nearby trails with sac_scale (for proximity fallback)
    // `out body qt` for nodes returns tags (including `ele` for elevation)
    const query = `
[out:json][timeout:15];
(
  relation["route"="hiking"]["name"~"${looseRegex}",i](${bbox});
  way["highway"~"path|footway|track"]["name"~"${looseRegex}",i](${bbox});
  way["highway"~"path|footway|track"]["sac_scale"](${bbox});
  way["highway"~"path|footway|track"]["name"](${bbox});
);
out body;
>;
out body qt;
`;

    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Overpass API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const elements = data.elements || [];

    // Separate nodes (with elevation), ways, and relations
    const nodes = new Map<number, { lat: number; lon: number; ele: number | null }>();
    const ways: any[] = [];
    const relations: any[] = [];

    for (const el of elements) {
      if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
        nodes.set(el.id, {
          lat: el.lat,
          lon: el.lon,
          ele: el.tags?.ele ? parseFloat(el.tags.ele) : null,
        });
      } else if (el.type === "way") {
        ways.push(el);
      } else if (el.type === "relation") {
        relations.push(el);
      }
    }

    // ── Build candidates from named matches ──
    const candidates: {
      name: string;
      sacScale: string | null;
      surface: string | null;
      coords: [number, number][];
      nodeIds: number[];
      nameScore: number;
      proximityMeters: number;
      dogPolicy: string | null;
      drinkingWater: string | null;
      wheelchair: string | null;
      trailVisibility: string | null;
      description: string | null;
      access: string | null;
    }[] = [];

    // Process relations (hiking routes)
    for (const rel of relations) {
      const name = rel.tags?.name || "";
      if (!name) continue;

      const score = trailNameScore(trailName, name);
      if (score < 0.3) continue;

      // Collect all way coordinates and node IDs for this relation
      const memberWayIds = (rel.members || [])
        .filter((m: any) => m.type === "way")
        .map((m: any) => m.ref);

      const coords: [number, number][] = [];
      const nodeIds: number[] = [];
      for (const wayId of memberWayIds) {
        const way = ways.find(w => w.id === wayId);
        if (way?.nodes) {
          for (const nodeId of way.nodes) {
            const nd = nodes.get(nodeId);
            if (nd) {
              coords.push([nd.lat, nd.lon]);
              nodeIds.push(nodeId);
            }
          }
        }
      }

      const mid = wayMidpoint(coords);
      const proximity = mid ? haversineMeters(lat, lng, mid[0], mid[1]) : 99999;

      candidates.push({
        name,
        sacScale: rel.tags?.sac_scale || null,
        surface: rel.tags?.surface || null,
        coords,
        nodeIds,
        nameScore: score,
        proximityMeters: proximity,
        dogPolicy: rel.tags?.dog || null,
        drinkingWater: rel.tags?.drinking_water || null,
        wheelchair: rel.tags?.wheelchair || null,
        trailVisibility: rel.tags?.trail_visibility || null,
        description: rel.tags?.description || null,
        access: rel.tags?.access || null,
      });
    }

    // Process individual ways (trail segments), merging same-named ways
    // into single candidates so we get the full trail distance, not just
    // one short segment. E.g., if "Emerald Pools Trail" has 5 way segments,
    // they all get combined into one candidate.
    const wayGroupsByName = new Map<string, {
      name: string;
      score: number;
      ways: typeof ways;
    }>();

    for (const way of ways) {
      const name = way.tags?.name || "";
      if (!name) continue;

      const score = trailNameScore(trailName, name);
      const normKey = normalizeTrailName(name);

      const existing = wayGroupsByName.get(normKey);
      if (existing) {
        existing.ways.push(way);
        // Keep the best score and original name
        if (score > existing.score) {
          existing.score = score;
          existing.name = name;
        }
      } else {
        wayGroupsByName.set(normKey, { name, score, ways: [way] });
      }
    }

    for (const group of wayGroupsByName.values()) {
      const allCoords: [number, number][] = [];
      const allNodeIds: number[] = [];
      let bestSacScale: string | null = null;
      let bestSurface: string | null = null;
      let bestDogPolicy: string | null = null;
      let bestDrinkingWater: string | null = null;
      let bestWheelchair: string | null = null;
      let bestTrailVisibility: string | null = null;
      let bestDescription: string | null = null;
      let bestAccess: string | null = null;

      for (const way of group.ways) {
        if (way.nodes) {
          for (const nodeId of way.nodes) {
            const nd = nodes.get(nodeId);
            if (nd) {
              allCoords.push([nd.lat, nd.lon]);
              allNodeIds.push(nodeId);
            }
          }
        }
        // Collect tags from whichever segment has them
        if (!bestSacScale && way.tags?.sac_scale) bestSacScale = way.tags.sac_scale;
        if (!bestSurface && way.tags?.surface) bestSurface = way.tags.surface;
        if (!bestDogPolicy && way.tags?.dog) bestDogPolicy = way.tags.dog;
        if (!bestDrinkingWater && way.tags?.drinking_water) bestDrinkingWater = way.tags.drinking_water;
        if (!bestWheelchair && way.tags?.wheelchair) bestWheelchair = way.tags.wheelchair;
        if (!bestTrailVisibility && way.tags?.trail_visibility) bestTrailVisibility = way.tags.trail_visibility;
        if (!bestDescription && way.tags?.description) bestDescription = way.tags.description;
        if (!bestAccess && way.tags?.access) bestAccess = way.tags.access;
      }

      const mid = wayMidpoint(allCoords);
      const proximity = mid ? haversineMeters(lat, lng, mid[0], mid[1]) : 99999;

      // Accept good name matches, OR any named trail very close to coordinates
      if (group.score >= 0.3 || proximity < 500) {
        candidates.push({
          name: group.name,
          sacScale: bestSacScale,
          surface: bestSurface,
          coords: allCoords,
          nodeIds: allNodeIds,
          nameScore: group.score,
          proximityMeters: proximity,
          dogPolicy: bestDogPolicy,
          drinkingWater: bestDrinkingWater,
          wheelchair: bestWheelchair,
          trailVisibility: bestTrailVisibility,
          description: bestDescription,
          access: bestAccess,
        });
      }
    }

    if (candidates.length === 0) {
      console.log(`Overpass: No trail match found for "${trailName}" near ${lat},${lng}`);
      return null;
    }

    // Sort: prioritize name matches, then proximity, then geometry completeness
    candidates.sort((a, b) => {
      // Strong name matches always win
      if (a.nameScore >= 0.5 && b.nameScore < 0.5) return -1;
      if (b.nameScore >= 0.5 && a.nameScore < 0.5) return 1;

      // Among similar name scores, prefer closer trails
      if (Math.abs(a.nameScore - b.nameScore) < 0.15) {
        // If one is much closer, prefer it
        if (a.proximityMeters < b.proximityMeters * 0.5) return -1;
        if (b.proximityMeters < a.proximityMeters * 0.5) return 1;
        // Otherwise prefer more complete geometry
        return b.coords.length - a.coords.length;
      }

      return b.nameScore - a.nameScore;
    });

    const best = candidates[0];

    if (best.coords.length < 2) {
      console.log(`Overpass: Found "${best.name}" but geometry too sparse (${best.coords.length} points)`);
      return null;
    }

    const rawDistanceMiles = calculatePolylineDistance(best.coords);
    const trailType = inferTrailType(best.coords);
    const difficulty = best.sacScale ? (SAC_SCALE_MAP[best.sacScale] || null) : null;
    const elevationGainFt = calculateElevationGain(best.nodeIds, nodes);

    // For out-and-back trails, OSM geometry represents the one-way path.
    // The hiking convention (NPS, AllTrails, etc.) is to report round-trip distance.
    // Double the polyline distance to match the standard. Loop trails already
    // represent the full loop distance, so no adjustment needed.
    const distanceMiles = trailType === "out_and_back"
      ? rawDistanceMiles * 2
      : rawDistanceMiles;

    console.log(`Overpass: Found "${best.name}" (score=${best.nameScore.toFixed(2)}, ${best.proximityMeters.toFixed(0)}m away) — ${distanceMiles.toFixed(1)} mi${trailType === "out_and_back" ? " (RT, raw=" + rawDistanceMiles.toFixed(1) + ")" : ""}, sac_scale=${best.sacScale || "none"}, surface=${best.surface || "unknown"}, dog=${best.dogPolicy || "unknown"}, ele_gain=${elevationGainFt || "unknown"}ft`);

    return {
      distanceMiles: Math.round(distanceMiles * 10) / 10, // round to 1 decimal
      sacScale: best.sacScale,
      difficulty,
      surface: best.surface,
      trailType,
      osmName: best.name,
      dogPolicy: best.dogPolicy,
      drinkingWater: best.drinkingWater,
      wheelchair: best.wheelchair,
      trailVisibility: best.trailVisibility,
      description: best.description,
      access: best.access,
      elevationGainFt,
      polylineCoords: best.coords.length > 0 ? best.coords : null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("Overpass API timed out (15s)");
    } else {
      console.error("Overpass API error:", error);
    }
    return null;
  }
}
