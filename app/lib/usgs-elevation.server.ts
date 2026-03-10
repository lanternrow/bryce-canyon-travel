// ============================================
// USGS Elevation Point Query Service
// Queries elevation at specific coordinates
// to calculate trail elevation gain.
// No API key required.
// ============================================

const USGS_EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

// ── Response Interface ──

export interface UsgsElevationResult {
  trailheadElevationFt: number | null;
  estimatedGainFt: number | null;
  peakElevationFt: number | null;
  samplePoints: number;
}

// ── Single Point Query ──

/**
 * Query elevation at a single coordinate point.
 * Returns elevation in feet, or null if outside US boundaries or on error.
 */
async function queryElevation(
  lat: number,
  lng: number
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      x: lng.toString(),
      y: lat.toString(),
      units: "Feet",
      wkid: "4326",
    });

    const res = await fetch(`${USGS_EPQS_URL}?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`USGS Elevation API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const value = data.value;

    // -1000000 means outside US boundaries
    if (value === -1000000 || value === undefined || value === null) {
      return null;
    }

    return typeof value === "number" ? value : parseFloat(value);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error(`USGS Elevation API timed out (5s) for ${lat},${lng}`);
    } else {
      console.error("USGS Elevation API error:", error);
    }
    return null;
  }
}

// ── Polyline Sampling ──

/**
 * Sample evenly spaced points from a polyline, always including first and last.
 * @param coords - Array of [lat, lng] coordinate pairs
 * @param maxSamples - Maximum number of sample points (default: 8)
 * @returns Array of [lat, lng] points evenly distributed along the polyline
 */
function samplePolylinePoints(
  coords: [number, number][],
  maxSamples: number = 8
): [number, number][] {
  if (coords.length <= maxSamples) {
    return coords;
  }

  const sampled: [number, number][] = [];
  const step = (coords.length - 1) / (maxSamples - 1);

  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round(i * step);
    sampled.push(coords[index]);
  }

  return sampled;
}

// ── Elevation Gain Calculation ──

/**
 * Calculate elevation gain and peak from an array of elevation samples.
 * Filters out null values, then sums positive differences between consecutive points.
 */
function calculateGainFromElevations(
  elevations: (number | null)[]
): { gain: number | null; peak: number | null } {
  const valid = elevations.filter(
    (e): e is number => e !== null && !isNaN(e)
  );

  if (valid.length < 2) {
    return { gain: null, peak: valid.length === 1 ? valid[0] : null };
  }

  let gain = 0;
  let peak = valid[0];

  for (let i = 1; i < valid.length; i++) {
    const diff = valid[i] - valid[i - 1];
    if (diff > 0) {
      gain += diff;
    }
    if (valid[i] > peak) {
      peak = valid[i];
    }
  }

  return {
    gain: Math.round(gain),
    peak: Math.round(peak),
  };
}

// ── Main Export ──

/**
 * Fetch elevation data for a trail.
 *
 * If polylineCoords are provided (with enough points), samples 8 points
 * along the polyline and queries elevations in parallel to estimate gain.
 * Otherwise, queries just the trailhead point for elevation only.
 *
 * @param trailheadLat - Trailhead latitude
 * @param trailheadLng - Trailhead longitude
 * @param polylineCoords - Optional array of [lat, lng] pairs along the trail
 * @returns Elevation data including trailhead elevation, estimated gain, and peak
 */
export async function fetchElevationData(
  trailheadLat: number,
  trailheadLng: number,
  polylineCoords?: [number, number][]
): Promise<UsgsElevationResult | null> {
  try {
    // 12s overall timeout safety net
    const controller = new AbortController();
    const overallTimeout = setTimeout(() => controller.abort(), 12000);

    let result: UsgsElevationResult;

    try {
      if (polylineCoords && polylineCoords.length >= 2) {
        // Sample points along the polyline
        const samples = samplePolylinePoints(polylineCoords, 8);

        // Query all sample points in parallel
        const elevationPromises = samples.map(([lat, lng]) =>
          queryElevation(lat, lng)
        );
        const settled = await Promise.allSettled(elevationPromises);

        const elevations = settled.map((r) =>
          r.status === "fulfilled" ? r.value : null
        );

        // First sample point is the trailhead elevation
        const trailheadElevationFt =
          elevations[0] !== null ? Math.round(elevations[0]) : null;

        const { gain, peak } = calculateGainFromElevations(elevations);

        const validCount = elevations.filter((e) => e !== null).length;

        result = {
          trailheadElevationFt,
          estimatedGainFt: gain,
          peakElevationFt: peak,
          samplePoints: validCount,
        };
      } else {
        // No polyline — query trailhead only
        const elevation = await queryElevation(trailheadLat, trailheadLng);

        result = {
          trailheadElevationFt:
            elevation !== null ? Math.round(elevation) : null,
          estimatedGainFt: null,
          peakElevationFt: null,
          samplePoints: elevation !== null ? 1 : 0,
        };
      }
    } finally {
      clearTimeout(overallTimeout);
    }

    console.log(
      `USGS Elevation: trailhead=${result.trailheadElevationFt}ft, gain=${result.estimatedGainFt}ft (${result.samplePoints} samples)`
    );

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("USGS Elevation: overall timeout (12s)");
    } else {
      console.error("USGS Elevation error:", error);
    }
    return null;
  }
}
