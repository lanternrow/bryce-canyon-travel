// ============================================
// Wikidata SPARQL API — Trail Metadata
// Fetches trail descriptions, elevation,
// managing agency, Wikipedia links, and images.
// No API key required.
// ============================================

const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

import { siteConfig } from "./site-config";

const WIKIDATA_USER_AGENT =
  `${siteConfig.siteName.replace(/\s+/g, "")}/1.0 (${siteConfig.siteUrl}; ${siteConfig.contactEmail})`;

// ── Response Interface ──

export interface WikidataTrailData {
  label: string;
  description: string | null;
  distanceMiles: number | null; // converted from P2043 length in km
  elevationMeters: number | null; // P2044
  managingAgency: string | null; // P137
  wikipediaUrl: string | null;
  wikimediaImageUrl: string | null;
  wikidataId: string; // e.g. "Q3398242"
}

// ── Name Matching (same approach as blm-gtlf.server.ts) ──

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

// ── Main API Function ──

/**
 * Fetch trail metadata from Wikidata via SPARQL.
 *
 * Strategy:
 * 1. Geo-radius query: find trail entities within 5km of coordinates
 * 2. Match by name similarity using shared fuzzy matching logic
 * 3. Return best match above score threshold (0.3)
 *
 * @param trailName - Name of the trail to search for
 * @param lat - Latitude of the trailhead or area
 * @param lng - Longitude of the trailhead or area
 * @returns Trail metadata or null if not found
 */
export async function fetchWikidataTrailInfo(
  trailName: string,
  lat: number,
  lng: number
): Promise<WikidataTrailData | null> {
  try {
    const query = `
SELECT ?item ?itemLabel ?itemDescription ?elevation ?length ?agencyLabel ?article ?image WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "5" .
  }
  { ?item wdt:P31/wdt:P279* wd:Q2143825 . }
  UNION
  { ?item wdt:P31/wdt:P279* wd:Q628909 . }
  OPTIONAL { ?item wdt:P2044 ?elevation . }
  OPTIONAL { ?item wdt:P2043 ?length . }
  OPTIONAL { ?item wdt:P137 ?agency . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 20`;

    const res = await fetch(WIKIDATA_SPARQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
        "User-Agent": WIKIDATA_USER_AGENT,
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`Wikidata SPARQL API error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const bindings = data.results?.bindings || [];

    if (bindings.length === 0) {
      console.log(
        `Wikidata: No trail match for "${trailName}" near ${lat},${lng}`
      );
      return null;
    }

    // Build candidates with name matching scores
    const candidates: {
      label: string;
      description: string | null;
      distanceMiles: number | null;
      elevationMeters: number | null;
      managingAgency: string | null;
      wikipediaUrl: string | null;
      wikimediaImageUrl: string | null;
      wikidataId: string;
      nameScore: number;
    }[] = [];

    for (const binding of bindings) {
      const itemUri = binding.item?.value || "";
      const wikidataId = itemUri.replace(
        "http://www.wikidata.org/entity/",
        ""
      );
      const label = binding.itemLabel?.value || "";
      if (!label || !wikidataId) continue;

      const description = binding.itemDescription?.value || null;

      const elevationRaw = binding.elevation?.value;
      const elevationMeters = elevationRaw
        ? parseFloat(elevationRaw)
        : null;

      const lengthRaw = binding.length?.value;
      let distanceMiles: number | null = null;
      if (lengthRaw) {
        const lengthKm = parseFloat(lengthRaw);
        if (!isNaN(lengthKm)) {
          distanceMiles = Math.round(lengthKm * 0.621371 * 10) / 10;
        }
      }

      const managingAgency = binding.agencyLabel?.value || null;
      const wikipediaUrl = binding.article?.value || null;
      const wikimediaImageUrl = binding.image?.value || null;

      const nameScore = trailNameScore(trailName, label);

      candidates.push({
        label,
        description,
        distanceMiles,
        elevationMeters:
          elevationMeters !== null && !isNaN(elevationMeters)
            ? elevationMeters
            : null,
        managingAgency,
        wikipediaUrl,
        wikimediaImageUrl,
        wikidataId,
        nameScore,
      });
    }

    if (candidates.length === 0) {
      console.log(
        `Wikidata: No trail match for "${trailName}" near ${lat},${lng}`
      );
      return null;
    }

    // Sort by best name match
    candidates.sort((a, b) => b.nameScore - a.nameScore);

    const best = candidates[0];

    // Require minimum name match quality
    if (best.nameScore < 0.3) {
      console.log(
        `Wikidata: No trail match for "${trailName}" near ${lat},${lng}`
      );
      return null;
    }

    console.log(
      `Wikidata: Found "${best.label}" (${best.wikidataId}, score=${best.nameScore.toFixed(2)}) — agency=${best.managingAgency || "unknown"}`
    );

    return {
      label: best.label,
      description: best.description,
      distanceMiles: best.distanceMiles,
      elevationMeters: best.elevationMeters,
      managingAgency: best.managingAgency,
      wikipediaUrl: best.wikipediaUrl,
      wikimediaImageUrl: best.wikimediaImageUrl,
      wikidataId: best.wikidataId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("Wikidata SPARQL API timed out (10s)");
    } else {
      console.error("Wikidata SPARQL API error:", error);
    }
    return null;
  }
}

// ── Wikipedia Article Extract ──

/**
 * Fetch the plain-text summary extract from a Wikipedia article.
 *
 * Uses the Wikimedia REST API `/page/summary/{title}` endpoint.
 * Returns the first ~1500 characters of the article extract —
 * enough context for AI content generation without hitting limits.
 *
 * @param wikipediaUrl - Full Wikipedia article URL (e.g., "https://en.wikipedia.org/wiki/Angels_Landing")
 * @returns Plain-text extract string or null if unavailable
 */
export async function fetchWikipediaExtract(
  wikipediaUrl: string
): Promise<string | null> {
  try {
    // Extract the article title from the URL
    // e.g., "https://en.wikipedia.org/wiki/Angels_Landing" → "Angels_Landing"
    const match = wikipediaUrl.match(
      /\/wiki\/([^#?]+)/
    );
    if (!match) {
      console.log(`Wikipedia: Could not extract title from URL: ${wikipediaUrl}`);
      return null;
    }
    const title = decodeURIComponent(match[1]);

    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      {
        headers: {
          "User-Agent": WIKIDATA_USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      console.error(`Wikipedia REST API error: HTTP ${res.status} for "${title}"`);
      return null;
    }

    const data = await res.json();
    const extract = data.extract;

    if (!extract || extract.length < 20) {
      console.log(`Wikipedia: No useful extract for "${title}"`);
      return null;
    }

    // Cap at ~1500 chars to keep AI prompts manageable
    const trimmed = extract.length > 1500
      ? extract.substring(0, 1500).replace(/\s+\S*$/, "…")
      : extract;

    console.log(`Wikipedia: Got ${trimmed.length}-char extract for "${title}"`);
    return trimmed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("Wikipedia REST API timed out (8s)");
    } else {
      console.error("Wikipedia extract error:", error);
    }
    return null;
  }
}
