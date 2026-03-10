# Hiking Listing Data Pipeline

How trail information is extracted, compiled, and published on Zion Travel.

---

## Table of Contents

1. [Overview](#overview)
2. [Three-Button Workflow](#three-button-workflow)
3. [Stage 1 — Pull from Google](#stage-1--pull-from-google)
4. [Stage 2 — Pull Trail Data](#stage-2--pull-trail-data)
   - [NPS Things To Do API](#1-nps-things-to-do-api)
   - [OpenStreetMap / Overpass API](#2-openstreetmap--overpass-api)
   - [USFS ArcGIS API](#3-usfs-arcgis-api)
   - [USGS Elevation Point Query](#4-usgs-elevation-point-query)
   - [Wikidata SPARQL + Wikipedia](#5-wikidata-sparql--wikipedia)
   - [BLM GTLF ArcGIS API](#6-blm-gtlf-arcgis-api)
   - [Recreation.gov RIDB API](#7-recreationgov-ridb-api)
   - [AI Attribute Inference](#8-ai-attribute-inference-gap-filler)
5. [Trickle-Down Priority Resolution](#trickle-down-priority-resolution)
6. [Stage 3 — Generate Content](#stage-3--generate-content)
7. [Database Schema](#database-schema)
8. [Perfect Output Example](#perfect-output-example)
9. [Source Attribution](#source-attribution)

---

## Overview

Each hiking listing is built in three discrete stages through the admin panel. The system pulls structured data from **7 external APIs**, runs them through a priority-based conflict resolver, optionally fills remaining gaps with **AI inference**, and then feeds the complete data package to Claude for long-form content generation.

```
Google Places ──┐
NPS API ────────┤
OSM/Overpass ───┤
USFS ArcGIS ────┤── Trickle-Down ──► Admin Form ──► AI Content ──► Published Listing
USGS Elevation ─┤   Resolution        (review)      Generation
Wikidata/Wiki ──┤
BLM GTLF ───────┤
Recreation.gov ─┘
```

The pipeline is designed so that **no data is saved without human review**. APIs populate form fields; the admin reviews, corrects, and then saves.

---

## Three-Button Workflow

The admin edit panel for hiking listings has three action buttons, each triggering a distinct stage:

| Button | Scope | What It Does |
|--------|-------|--------------|
| **Pull from Google** | `google` | Fetches business/location data from Google Places API. Fills name, slug, category, price range, address, phone, website, coordinates. Saves business hours and amenities to DB immediately. |
| **Pull Trail Data** | `trail` | Fires all 7 trail APIs in parallel, resolves conflicts, fills hiking-specific form fields (distance, elevation, difficulty, etc.). Nothing saved to DB yet. |
| **Generate Content** | `content` | Takes the current form field values (including any admin corrections) plus cached API enrichment data, sends everything to Claude AI, and generates a tagline + description. |

The separation is intentional: the admin can correct any auto-populated field before AI content generation uses those values.

---

## Stage 1 — Pull from Google

**Trigger:** Admin enters a Google Place ID and clicks "Pull from Google."

### What Gets Fetched

The system calls the **Google Places API (New)** with this field mask:

```
displayName, formattedAddress, addressComponents, nationalPhoneNumber,
websiteUri, regularOpeningHours, rating, userRatingCount, types,
primaryType, primaryTypeDisplayName, location, priceLevel, priceRange,
editorialSummary, reviews, generativeSummary, googleMapsUri,
businessStatus, photos,
servesBreakfast, servesLunch, servesDinner, servesBrunch,
servesBeer, servesWine, servesCocktails, servesCoffee,
servesDessert, servesVegetarianFood,
outdoorSeating, liveMusic, restroom,
allowsDogs, goodForChildren, menuForChildren,
goodForGroups, goodForWatchingSports,
dineIn, takeout, delivery, curbsidePickup, reservable,
accessibilityOptions, parkingOptions, paymentOptions, evChargeOptions
```

If the New API fails, it falls back to the **Legacy Places API** and normalizes the response to the same shape.

### What Gets Set in the Form

| Form Field | Source | Fill Mode |
|-----------|--------|-----------|
| Name | `displayName` | Only if empty |
| Slug | Auto-generated from name | Only if empty |
| Category | Suggested from Google `types` mapping | Only if empty |
| Price Range | `priceLevel` mapped to `free/$/$$/$$$/$$$$` | Only if empty |
| Address | Parsed from `addressComponents` | Force overwrite |
| City | Parsed from `addressComponents` | Force overwrite |
| State | Parsed from `addressComponents` | Force overwrite |
| ZIP | Parsed from `addressComponents` | Force overwrite |
| Phone | `nationalPhoneNumber` | Force overwrite |
| Website | `websiteUri` | Force overwrite |
| Lat/Lng | `location.latitude/longitude` | Force overwrite |
| Google Maps URI | `googleMapsUri` | Force overwrite |
| Google Types | `types[]` | Force overwrite |
| Google Primary Type | `primaryType` | Force overwrite |

### What Gets Saved to DB Immediately

These three operations happen server-side before the response returns:

1. **Business hours** — Upserted to the `business_hours` table from `regularOpeningHours`.
2. **Amenity auto-linking** — Google boolean signals (e.g., `allowsDogs`, `restroom`, `outdoorSeating`) are mapped to amenity slugs and linked in the `listing_amenities` table.
3. **Google metadata** — `google_place_id`, `google_maps_uri`, `google_primary_type`, `google_types`, `lat`, `lng` are persisted to the `listings` row.

### Category Suggestion Logic

Google place types are mapped to internal category slugs. For hiking listings, the mapping is:

- `hiking_area` maps to `"day-hike"`
- `national_park`, `state_park`, `national_monument`, `national_forest`, `wilderness_area`, `conservation_area`, `city_park` map to park categories
- `historical_landmark`, `observation_deck` map to `"points-of-interest"`

### Park Code Detection

The system maps the listing's city to an NPS park code for trail API calls:

| Cities | Park Code |
|--------|-----------|
| Springdale, Virgin, La Verkin, Rockville, Grafton | `zion` |
| Tropic, Cannonville, Henrieville, Bryce Canyon City, Panguitch | `brca` |
| Torrey, Teasdale, Bicknell, Loa | `care` |
| Moab | `arch` |
| All other Utah locations | `zion` (default) |

---

## Stage 2 — Pull Trail Data

**Trigger:** Admin clicks "Pull Trail Data."

**Prerequisite:** The listing must have coordinates (lat/lng from Stage 1) and a name. If missing, the button shows a validation error.

### Parallel API Architecture

All trail APIs fire simultaneously in two waves:

**Wave 1 (7 parallel calls):**

1. NPS Things To Do
2. NPS Alerts
3. OSM/Overpass trail search
4. Recreation.gov permit lookup
5. BLM GTLF trail search
6. USFS trail search
7. Wikidata trail search

**Wave 2 (2 parallel calls, depend on Wave 1):**

1. USGS Elevation (needs OSM polyline coordinates from Wave 1)
2. Wikipedia Extract (needs Wikipedia URL from Wikidata in Wave 1)

Each API has independent error handling. If one fails, the others still return their data. The system never blocks on a single source.

---

### 1. NPS Things To Do API

**Endpoint:** `https://developer.nps.gov/api/v1/thingstodo`

**Authentication:** `X-Api-Key` header

**Query:** Searches by park code and trail name. Returns up to 10 results.

**Candidate Selection:** Results are scored by fuzzy name matching (Jaccard word-overlap on normalized names). Name normalization strips words like "trailhead", "trail", "hike", "hiking", "path". Minimum match score: **0.2**.

#### Fields Extracted

| Field | Source Field | Notes |
|-------|-------------|-------|
| Title | `title` | |
| Short Description | `shortDescription` | HTML stripped |
| Long Description | `longDescription` | HTML stripped |
| Duration | `duration` | e.g., "2-4 Hours" |
| Season | `season[]` | Array of season names |
| Fees Apply | `doFeesApply` | Boolean |
| Pets Permitted | `arePetsPermitted` | String: "true"/"false"/"Yes, with restrictions" |
| Pets Description | `petsDescription` | Details on leash rules, etc. |
| Accessibility Info | `accessibilityInformation` | HTML stripped. Primary source for distance/elevation parsing. |
| Images | `images[]` | URL, alt text, title |
| Alerts | Separate alerts endpoint | Category: "Danger", "Caution", "Park Closure" only |

#### Trail Spec Parsing

The `parseNpsTrailSpecs` function extracts structured numbers from NPS free-text fields. It searches through `accessibilityInformation`, `longDescription`, `shortDescription`, and `relatedAccessibilityTexts` (for multi-segment trails like Angels Landing).

**Distance patterns recognized:**

| Pattern | Example | Interpretation |
|---------|---------|----------------|
| `X mi round-trip` | "5.4 mi round-trip" | Round-trip distance |
| `X-mile round trip` | "5.4-mile round trip" | Round-trip distance |
| `X mi one-way` | "2.7 mi one-way" | Doubled to round-trip |
| `Length (one way) \| X mi` | NPS structured format | Doubled to round-trip |
| `Length (round trip) \| X mi` | NPS structured format | Round-trip distance |
| `over X miles` | "over 5 miles" | Approximate round-trip |

**Elevation gain patterns recognized:**

| Pattern | Example |
|---------|---------|
| `Xft elevation` | "1037ft elevation" |
| `X ft of elevation` | "1,489 ft of elevation" |
| `elevation gain: X ft` | "elevation gain: 1,489 ft" |
| `elevation change of X ft` | "elevation change of 1037 ft" |
| `Gain: X ft` | NPS structured: "Gain: 1187 ft" |
| `Gain: X ft (Ym)` | "Gain: 1,489 ft (361.8 m)" |

#### Multi-Segment Trail Handling

NPS often splits a trail across multiple entries. For example, Angels Landing has separate entries for the chain section and the Scout Lookout approach. The system collects `accessibilityInformation` text from ALL search results into `relatedAccessibilityTexts`, so the parser can find distance and elevation data even if it lives in a related entry rather than the best-matched one.

---

### 2. OpenStreetMap / Overpass API

**Endpoint:** `https://overpass-api.de/api/interpreter` (POST)

**Authentication:** None required.

**Timeout:** 15 seconds.

#### Overpass Query Structure

```
[out:json][timeout:15];
(
  relation["route"="hiking"]["name"~"REGEX",i](BBOX);
  way["highway"~"path|footway|track"]["name"~"REGEX",i](BBOX);
  way["highway"~"path|footway|track"]["sac_scale"](BBOX);
  way["highway"~"path|footway|track"]["name"](BBOX);
);
out body;
>;
out body qt;
```

The bounding box is a ~5km radius (`delta = 0.05`) around the listing's coordinates. The regex is built from the core words of the trail name for loose matching.

#### Element Processing

- **Nodes** are stored in a lookup map with `lat`, `lon`, and `ele` (elevation from OSM tags).
- **Relations** (hiking routes) are the highest-fidelity source because they group multiple way segments into a single named route.
- **Ways** with the same name are merged into a single candidate, collecting coordinates and tags across all segments. This handles trails that are mapped as multiple way segments in OSM.

#### Tags Extracted

| OSM Tag | Maps To | Values |
|---------|---------|--------|
| `sac_scale` | Difficulty | `hiking` = easy, `mountain_hiking` = moderate, `demanding_mountain_hiking` = hard, `alpine_hiking`/`demanding_alpine_hiking`/`difficult_alpine_hiking` = expert |
| `surface` | Surface Type | e.g., "rock", "paved", "gravel", "dirt" |
| `dog` | Dogs Allowed | "yes", "no", "leashed" |
| `drinking_water` | Water Available | "yes", "no" |
| `wheelchair` | Accessibility | "yes", "no", "limited" |
| `trail_visibility` | (informational) | |
| `description` | (informational) | |
| `access` | (informational) | "yes", "permissive", "private" |

#### Distance Calculation

Distance is calculated from the polyline using the **Haversine formula**:

1. For each consecutive pair of coordinate points, calculate great-circle distance in meters.
2. Sum all segment distances.
3. Convert meters to miles (divide by 1,609.344).
4. **Trail type adjustment:** If the trail is inferred as `out_and_back`, the raw polyline distance is **doubled** to represent the round-trip. Loop trails use the raw distance.

#### Trail Type Inference

- If the start point and end point of the polyline are within **100 meters** of each other: `loop`.
- Otherwise: `out_and_back` (default assumption).

#### Elevation Gain from OSM

If enough nodes have `ele` (elevation) tags:

1. Iterate through ordered node elevations.
2. Sum all **positive** differences between consecutive nodes (ascent only).
3. Convert meters to feet (multiply by 3.28084).
4. Returns `null` if fewer than 2 elevation-tagged nodes.

---

### 3. USFS ArcGIS API

**Endpoint:** `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0/query`

**Authentication:** None required.

**Query type:** Spatial envelope query within ~3km (`delta = 0.03`) of coordinates.

#### Fields Requested

```
TRAIL_NAME, TRAIL_CLASS, TRAIL_SURFACE, SURFACE_FIRMNESS,
TYPICAL_TRAIL_GRADE, GIS_MILES, HIKER_PEDESTRIAN_MANAGED,
PACK_SADDLE_MANAGED, BICYCLE_MANAGED, ACCESSIBILITY_STATUS,
NATIONAL_TRAIL_DESIGNATION
```

#### Field Mappings

| USFS Field | Maps To | Conversion |
|-----------|---------|------------|
| `GIS_MILES` | Distance | Used directly (miles) |
| `TRAIL_CLASS` | Difficulty | TC1/TC2 = easy, TC3 = moderate, TC4 = hard, TC5 = expert |
| `TRAIL_SURFACE` | Surface | NATIVE, AGGREGATE, ASPHALT, CONCRETE, etc. |
| `TYPICAL_TRAIL_GRADE` | (informational) | Parsed from range strings like "5-8%" to numeric average |
| `HIKER_PEDESTRIAN_MANAGED` | (filter) | Confirms it's a hiking trail |
| `ACCESSIBILITY_STATUS` | (informational) | |
| `NATIONAL_TRAIL_DESIGNATION` | (informational) | |

#### Season Parsing

- `"Year-Long"` returns `{ start: null, end: null }` (no seasonal restriction).
- `"06/01-10/31"` returns `{ start: "June", end: "October" }` (month names derived from numeric dates).

---

### 4. USGS Elevation Point Query

**Endpoint:** `https://epqs.nationalmap.gov/v1/json`

**Authentication:** None required.

**Timeout:** 5 seconds per point, 12 seconds overall safety net.

#### Two Operating Modes

**Mode A — Polyline Sampling** (when OSM provides trail coordinates):

1. The system samples **8 evenly-spaced points** along the OSM polyline using `samplePolylinePoints`.
2. All 8 elevation queries fire **in parallel** (`Promise.allSettled`).
3. The first sample point provides the **trailhead elevation**.
4. **Elevation gain** is calculated by summing all positive differences between consecutive valid samples.
5. **Peak elevation** is the highest value among all samples.
6. Points returning `-1000000` (outside US boundaries) are filtered out.

**Mode B — Trailhead Only** (no polyline available):

1. Queries just the listing's lat/lng coordinates.
2. Returns only `trailheadElevationFt`. No gain or peak can be calculated.

#### Return Values

| Field | Unit | Notes |
|-------|------|-------|
| `trailheadElevationFt` | Feet | Elevation at the start of the trail |
| `estimatedGainFt` | Feet | Sum of all uphill segments (Mode A only) |
| `peakElevationFt` | Feet | Highest point along the trail (Mode A only) |

---

### 5. Wikidata SPARQL + Wikipedia

#### Wikidata

**Endpoint:** `https://query.wikidata.org/sparql` (POST)

**Authentication:** None, but a `User-Agent` header is required (`ZionTravel/1.0`).

**Query:** Searches for entities within a **5km radius** that are instances of `Q2143825` (hiking trail) or `Q628909` (trail).

**Properties queried:**

| Wikidata Property | What It Returns |
|-------------------|-----------------|
| P625 | Geographic coordinates (for radius search) |
| P31/P279* | Instance of / subclass of (trail classification) |
| P2044 | Elevation above sea level (meters) |
| P2043 | Length (km, converted to miles: `km * 0.621371`) |
| P137 | Managing agency (e.g., "National Park Service") |
| P18 | Wikimedia Commons image URL |
| Wikipedia link | English Wikipedia article URL |

**Candidate selection:** Fuzzy name matching with threshold **0.3**.

#### Wikipedia Extract

**Endpoint:** `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`

If the Wikidata result includes a Wikipedia article URL, the system fetches the article's plain-text summary extract. This is capped at **1,500 characters** to keep AI prompts manageable.

The Wikipedia extract is fed to the AI during content generation to provide factual context about the trail's history, geology, and significance.

---

### 6. BLM GTLF ArcGIS API

**Endpoint:** `https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF/MapServer/0/query`

**Authentication:** None required.

**Query type:** Spatial envelope query around coordinates.

#### Fields Extracted

| Field | Notes |
|-------|-------|
| `trailName` | Official BLM trail name |
| `distanceMiles` | Trail distance |
| `surface` | Surface type (gravel, native, etc.) |
| `transportMode` | Confirms hiking is a valid use |
| `seasonRestriction` | Seasonal closure info |
| `accessRestriction` | Access limitations |
| `managementObjective` | BLM management classification |

This source is particularly useful for trails on BLM-managed public land that don't appear in NPS or USFS systems.

---

### 7. Recreation.gov RIDB API

**Endpoint:** `https://ridb.recreation.gov/api/v1`

**Authentication:** RIDB API key required.

**Search strategy:** Three-step lookup:

1. Search recreation areas by park name.
2. Search facilities within that area by trail name.
3. Fetch permit details for matching facilities.

#### Fields Extracted

| Field | Notes |
|-------|-------|
| `permitRequired` | Boolean: is a permit needed? |
| `permitDescription` | Details about the permit system |
| `fee` | Permit fee amount |
| `facilityName` | Official facility name |
| `facilityUrl` | Link to Recreation.gov booking page |
| `recAreaName` | Parent recreation area name |

---

### 8. AI Attribute Inference (Gap Filler)

**Model:** Claude Haiku (fast, cost-efficient for structured extraction).

**Temperature:** 0 (deterministic output).

**When it runs:** After all 7 structured APIs have returned. Only called if `skipAI` is `false`.

**Critical rule:** AI-inferred values **never override** data from structured APIs. They only fill fields that remain empty after all API sources are exhausted.

#### Fields AI Can Infer

| Field | When Inferred | Input Signals |
|-------|---------------|---------------|
| Difficulty | No OSM `sac_scale`, no USFS `trail_class` | Distance, elevation mentions in reviews, descriptive language |
| Estimated Time | No NPS `duration` | Standard hiking pace (2-3 mph), adjusted for difficulty and elevation |
| Elevation Gain | No NPS, USGS, or OSM elevation data | Specific numbers from review text |
| Trail Type | No OSM geometry | Review mentions of "loop", "out and back", landmarks |
| Season Start/End | No NPS or USFS season data | Southern Utah climate patterns, elevation considerations |
| Dogs Allowed | No NPS or OSM dog policy | Review mentions of dogs, pets, leashes; BLM land = generally on-leash |
| Kid Friendly | Always requested (no API provides this) | Review mentions of families, children, strollers, difficulty level |
| Water Available | No OSM `drinking_water` tag | Review mentions of "bring water", springs, creeks |
| Shade Level | Always requested (no API provides this) | Review mentions of sun exposure, shade, canyons, slot canyons |
| Permit Required | No RIDB data | Review mentions of permits, reservations, lottery |

#### Confidence Levels

Each AI inference includes a confidence rating:

- **High** — Directly stated in reviews or summaries (e.g., "no dogs allowed" in a review).
- **Medium** — Strongly implied by multiple signals (e.g., several reviews mention bringing kids).
- **Low** — Reasonable inference from general context (e.g., assuming a short, flat trail is kid-friendly).

#### Input Data for Inference

The AI receives:

- Trail name, city, state
- Up to 8 Google review snippets (truncated to 400 characters each)
- Google editorial summary and generative summary
- All fields already known from APIs (so it knows what NOT to re-infer)
- A list of specifically which fields still need values

---

## Trickle-Down Priority Resolution

When multiple APIs return data for the same field, the system uses a fixed priority order. The first non-null value wins.

| Field | Priority Chain (highest to lowest) |
|-------|-----------------------------------|
| **Distance (miles)** | NPS (parsed, one-way doubled) > USFS `GIS_MILES` > BLM > Wikidata `P2043` > OSM (Haversine polyline, doubled if out-and-back) |
| **Elevation Gain (ft)** | NPS (parsed) > USGS (calculated from 8-point polyline sampling) > OSM (node `ele` tags) |
| **Difficulty** | OSM `sac_scale` > USFS `trail_class` > AI inference |
| **Surface Type** | OSM `surface` > BLM > USFS `TRAIL_SURFACE` |
| **Trail Type** | OSM (geometry inference: endpoints within 100m = loop) > AI inference |
| **Estimated Time** | NPS `duration` > AI inference (pace-based calculation) |
| **Season Start/End** | NPS `season[]` > USFS season field > AI inference |
| **Dogs Allowed** | NPS `arePetsPermitted` > OSM `dog` tag > AI inference |
| **Water Available** | OSM `drinking_water` tag > AI inference |
| **Permit Required** | RIDB `permitRequired` > AI inference |
| **Shade Level** | AI inference only (no structured API provides this) |
| **Kid Friendly** | AI inference only (no structured API provides this) |

### Distance Normalization

All distances are normalized to **round-trip miles**:

- NPS distances labeled "one-way" are **doubled**.
- OSM polyline distances for `out_and_back` trails are **doubled** (the polyline represents one direction).
- Loop trail distances are used as-is from any source.
- All values are rounded to 2 decimal places.

---

## Stage 3 — Generate Content

**Trigger:** Admin clicks "Generate Content" after reviewing auto-populated fields.

**Model:** Configurable via admin settings. Default: `claude-opus-4-20250514`.

**Temperature:** 0.7.

**Max tokens:** 2,048 (hiking is double the standard listing limit of 1,024).

### What Gets Fed to the AI

The AI receives the **complete data package** — user-corrected form values take precedence over cached API data:

**From admin form (user-corrected):**
- Trail name, city, state, listing type
- Distance, elevation gain, difficulty, estimated time
- Trail type, season start/end, surface type
- Dogs allowed, water available, permit required/info

**From cached API enrichment:**
- NPS: description, duration, season, pets policy, fees, accessibility info, alerts
- OSM: distance, difficulty, surface, trail type, dog policy, drinking water
- RIDB: permit details, fee, facility URL
- BLM: distance, surface, transport mode
- USFS: trail class, typical grade, accessibility, national designation
- USGS: trailhead elevation, estimated gain, peak elevation
- Wikidata: description, managing agency
- Wikipedia: article extract (up to 1,500 chars)
- Google: editorial summary, generative summary, up to 8 review snippets (300 chars each)

**From RAG keyword context:**
- Active keyword documents from the database are prepended to the system prompt as an SEO reference section.

### System Prompt Personality

The AI writes as a **knowledgeable southern Utah local** who has hiked these trails, using a blend of three voice modes:

| Voice | Weight | Style |
|-------|--------|-------|
| Insider Guide | 50% | Practical tips, specific conditions, local knowledge |
| Storyteller | 30% | Sensory details, emotional moments, scenic descriptions |
| Friendly Local | 20% | Casual warmth, personal recommendations |

### Writing Constraints

- **Readability:** 12-15 word average sentence length, max 25 words per sentence, Flesch-Kincaid Grade Level 8-10.
- **Length:** 500-750 words across 5-8 paragraphs.
- **Structure:** Flexible 6-theme approach (Hook, Experience, Logistics, Access/Permits, Practical Tips, Context) — not rigid sections but woven naturally.
- **Banned content:** Over 100 banned words/phrases to avoid AI-sounding language (e.g., "nestled", "hidden gem", "embark", "journey", "vibrant tapestry").
- **Tone rules:** Positive-only (directory site, not review site). No star ratings referenced. No stale data that will age poorly.
- **E-E-A-T compliance:** Demonstrates Experience, Expertise, Authoritativeness, Trustworthiness through specific detail rather than claims.

### Expected Output Format

```
TAGLINE: [Under 160 characters. Trail essence in one sentence. Experience-focused.]
PRICE_ESTIMATE: [Free | $ | $$ | $$$ | $$$$ | UNKNOWN]
DESCRIPTION: [5-8 paragraphs, 500-750 words, plain prose without markdown headers]
```

The tagline is typically experience-focused rather than generic. For example:
- Good: "A dramatic chain-assisted climb to a narrow sandstone summit with 360-degree canyon views"
- Bad: "A popular hiking trail in Zion National Park"

Price estimate for hiking is almost always `Free` unless the trail requires a paid permit.

### Post-Processing

The `enforceMaxLength` function truncates AI output at a sentence boundary if it exceeds the target length while preserving at least 70% of the content. This prevents mid-sentence cutoffs.

---

## Database Schema

### `listings` Table (Shared Fields)

Every hiking listing stores these fields in the main `listings` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `type` | ENUM | `"hiking"` |
| `name` | VARCHAR(500) | Trail name |
| `slug` | VARCHAR(500) | URL slug, unique per type |
| `tagline` | VARCHAR(500) | AI-generated one-line summary |
| `description` | TEXT | AI-generated long-form content |
| `category_id` | INTEGER | FK to categories (e.g., "Day Hike", "Points of Interest") |
| `location_id` | INTEGER | FK to locations (e.g., "Zion Canyon") |
| `address` | VARCHAR(500) | Trailhead address |
| `city` | VARCHAR(255) | |
| `state` | VARCHAR(100) | Default: "UT" |
| `zip` | VARCHAR(20) | |
| `lat` | DECIMAL(10,7) | Listing coordinates (for map display + ETA calculation) |
| `lng` | DECIMAL(10,7) | |
| `phone` | VARCHAR(50) | Usually null for trails |
| `website` | VARCHAR(500) | NPS or managing agency URL |
| `featured_image` | TEXT | Image URL |
| `gallery` | JSONB | Array of image URLs |
| `price_range` | ENUM | `"free"` for most trails |
| `status` | ENUM | `draft` / `pending` / `published` |
| `google_place_id` | VARCHAR | Google Place ID |
| `google_maps_uri` | VARCHAR | Google Maps link |
| `google_primary_type` | VARCHAR | e.g., `"hiking_area"` |
| `google_types` | TEXT[] | Full array of Google types |
| `meta_title` | VARCHAR(500) | SEO title |
| `meta_description` | VARCHAR(1000) | SEO description |
| `avg_rating` | DECIMAL(3,2) | From Google reviews |
| `review_count` | INTEGER | From Google reviews |

### `hiking_details` Table (Trail-Specific Fields)

One-to-one relationship with `listings` via `listing_id`:

| Column | Type | Source Priority | Notes |
|--------|------|-----------------|-------|
| `listing_id` | UUID PK | — | FK to `listings(id)`, cascade delete |
| `difficulty` | ENUM | OSM > USFS > AI | `easy` / `moderate` / `hard` / `expert` |
| `trail_type` | ENUM | OSM > AI | `out_and_back` / `loop` / `point_to_point` |
| `distance_miles` | DECIMAL(5,2) | NPS > USFS > BLM > Wiki > OSM | Always round-trip |
| `elevation_gain_ft` | INTEGER | NPS > USGS > OSM | Feet of ascent |
| `estimated_time` | VARCHAR(100) | NPS > AI | e.g., "2-3 hours" |
| `trailhead_lat` | DECIMAL(10,7) | Google / listing coords | |
| `trailhead_lng` | DECIMAL(10,7) | Google / listing coords | |
| `trailhead_address` | VARCHAR(500) | Manual entry | |
| `permit_required` | BOOLEAN | RIDB > AI | Default: false |
| `permit_info` | TEXT | RIDB description | Details about the permit |
| `dogs_allowed` | BOOLEAN | NPS > OSM > AI | Default: false |
| `season_start` | VARCHAR(20) | NPS > USFS > AI | Month name: "March" |
| `season_end` | VARCHAR(20) | NPS > USFS > AI | Month name: "November" |
| `water_available` | BOOLEAN | OSM > AI | Default: false |
| `shade_level` | VARCHAR(50) | AI only | "Full Sun" / "Partial Shade" / "Mostly Shaded" / "Full Shade" |
| `kid_friendly` | BOOLEAN | AI only | Default: false |
| `surface_type` | VARCHAR(100) | OSM > BLM > USFS | "rock", "paved", "gravel", "dirt", "native" |
| `data_sources` | TEXT | Auto-generated | Comma-separated: "NPS,OSM,RIDB,BLM,USFS,USGS,Wikidata,AI" |

---

## Perfect Output Example

Here is what a fully-populated hiking listing looks like after all three stages complete successfully, using Angels Landing as the reference:

### After Stage 1 (Pull from Google)

```
name:              "Angels Landing"
slug:              "angels-landing"
category:          Day Hike
price_range:       free
address:           "Zion National Park"
city:              "Springdale"
state:             "UT"
zip:               "84767"
lat:               37.2693910
lng:               -112.9468690
google_place_id:   "ChIJ..."
google_maps_uri:   "https://maps.google.com/..."
google_primary_type: "hiking_area"
website:           "https://www.nps.gov/zion/..."
avg_rating:        4.8
review_count:      12,453
```

### After Stage 2 (Pull Trail Data)

```
distance_miles:     5.40          (NPS: parsed "2.7 mi one-way" x 2)
elevation_gain_ft:  1,488         (NPS: parsed from accessibility text)
difficulty:         hard          (OSM: sac_scale = demanding_mountain_hiking)
trail_type:         out_and_back  (OSM: endpoints > 100m apart)
estimated_time:     "4 hours"     (NPS: duration field)
season_start:       "March"       (NPS: season array)
season_end:         "November"    (NPS: season array)
surface_type:       "rock"        (OSM: surface tag)
dogs_allowed:       false         (NPS: arePetsPermitted = "false")
water_available:    false         (OSM: no drinking_water tag)
permit_required:    true          (RIDB: Angels Landing permit system)
permit_info:        "Seasonal lottery permit required..."  (RIDB)
shade_level:        "Full Sun"    (AI: inferred from review mentions of sun exposure)
kid_friendly:       false         (AI: inferred from chain section, exposure, difficulty)
trailhead_lat:      37.2591000
trailhead_lng:      -112.9507000
data_sources:       "NPS,OSM,RIDB,USGS,AI"
```

### After Stage 3 (Generate Content)

```
tagline:  "A dramatic chain-assisted climb to a narrow sandstone summit
           with 360-degree canyon views above the Virgin River"

description: [500-750 words of prose covering:]
  - The trail experience from Grotto Trailhead up Walter's Wiggles
  - The chain section and exposure level
  - What you see from the summit
  - Permit system details and how to enter the lottery
  - Best times to hike (season, time of day)
  - What to bring (water, sun protection, footwear)
  - Connection to broader Zion context
```

### Diagnostic Message (Shown to Admin)

After Stage 2, the admin sees a diagnostic summary like:

```
Filled from NPS:
  - Distance: 5.4 mi (round-trip, doubled from 2.7 mi one-way)
  - Elevation Gain: 1,488 ft
  - Estimated Time: 4 hours
  - Season: March – November
  - Dogs: Not permitted

Filled from OSM:
  - Difficulty: Hard (sac_scale: demanding_mountain_hiking)
  - Trail Type: Out and Back
  - Surface: Rock

Filled from RIDB:
  - Permit: Required
  - Permit Info: Seasonal lottery permit required...

Filled from AI (inference):
  - Shade Level: Full Sun (confidence: high)
  - Kid Friendly: No (confidence: high)

Still needs manual input:
  - Trailhead Address
```

---

## Source Attribution

Every hiking listing tracks which APIs contributed data in the `data_sources` column. Possible values:

| Source | When Included |
|--------|---------------|
| `NPS` | NPS Things To Do API returned matching data |
| `OSM` | Overpass/OpenStreetMap returned trail data |
| `RIDB` | Recreation.gov returned permit information |
| `BLM` | BLM GTLF returned trail data |
| `USFS` | USFS ArcGIS returned trail data |
| `USGS` | USGS Elevation API returned elevation data |
| `Wikidata` | Wikidata/Wikipedia returned trail information |
| `AI` | Claude AI inferred one or more attribute values |

This field is informational and helps the admin understand where data came from when reviewing or debugging a listing.
