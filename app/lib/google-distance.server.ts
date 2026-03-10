// ============================================
// GOOGLE DISTANCE MATRIX — Drive time from destination hub
// Uses the existing Google Places API key from settings.
// ============================================

import { getSettings } from "./queries.server";
import { siteConfig } from "./site-config";

// In-memory cache: key = "lat,lng" → { driveMinutes, distanceKm, fetchedAt }
const etaCache = new Map<
  string,
  { driveMinutes: number; distanceKm: number; fetchedAt: number }
>();
const ETA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Configured reference point for drive-time calculations
const ETA_ORIGIN = siteConfig.etaOrigin;

export interface ETAResult {
  driveMinutes: number;
  distanceKm: number;
}

/**
 * Get estimated drive time from Zion Canyon Visitor Center to a destination.
 * Uses Google Distance Matrix API with the same API key as Google Places.
 * Results are cached in memory for 7 days.
 */
export async function getETAFromZion(
  destLat: number,
  destLng: number
): Promise<ETAResult | null> {
  const cacheKey = `${destLat.toFixed(5)},${destLng.toFixed(5)}`;

  // Check cache
  const cached = etaCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ETA_CACHE_TTL) {
    return { driveMinutes: cached.driveMinutes, distanceKm: cached.distanceKm };
  }

  // Get API key from settings
  let apiKey: string | null = null;
  try {
    const settings = await getSettings();
    apiKey = settings.google_places_api_key || null;
  } catch {
    // Fall through to env
  }
  apiKey = apiKey || process.env.GOOGLE_PLACES_API_KEY || null;
  if (!apiKey) return null;

  try {
    const origin = `${ETA_ORIGIN.lat},${ETA_ORIGIN.lng}`;
    const destination = `${destLat},${destLng}`;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=imperial&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error("[GoogleDistance] API request failed:", res.status);
      return null;
    }

    const data = await res.json();

    if (data.status !== "OK") {
      console.error("[GoogleDistance] API error:", data.status, data.error_message);
      return null;
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      console.error("[GoogleDistance] No route found:", element?.status);
      return null;
    }

    // duration.value is in seconds, distance.value is in meters
    const driveMinutes = Math.round(element.duration.value / 60);
    const distanceKm = Math.round((element.distance.value / 1000) * 10) / 10;

    // Cache it
    etaCache.set(cacheKey, { driveMinutes, distanceKm, fetchedAt: Date.now() });

    return { driveMinutes, distanceKm };
  } catch (error) {
    console.error("[GoogleDistance] Fetch error:", error);
    return null;
  }
}
