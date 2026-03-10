# New Destination Spinup Guide

Complete instructions for cloning the travel directory platform for a new national park destination. This guide uses Bryce Canyon as the example, but the process is identical for any destination.

---

## Prerequisites

Before starting, you need:
- GitHub account with access to `lanternrow/zion-travel`
- Railway account (https://railway.app)
- Cloudflare account with R2 enabled (for image storage)
- Google Cloud project with Places API, Distance Matrix API enabled
- Anthropic API key (for AI content generation)
- A domain name for the new site

Optional API keys (features degrade gracefully without them):
- NPS API key (https://www.nps.gov/subjects/developer/get-started.htm) — trail/park data
- Recreation.gov RIDB API key (https://ridb.recreation.gov) — permits/campgrounds
- Mailchimp API key — newsletter signups
- Google Search Console service account — indexing/analytics

---

## Phase 1: Local Setup

### 1.1 Clone the repository

```bash
cd ~/Websites
git clone https://github.com/lanternrow/zion-travel.git bryce-travel
cd bryce-travel
npm install
```

### 1.2 Create a new GitHub repository

Go to https://github.com/new and create `lanternrow/bryce-travel` (empty, no README).

```bash
git remote remove origin
git remote add origin https://github.com/lanternrow/bryce-travel.git
```

Don't push yet — we'll edit the config first.

### 1.3 Edit `app/lib/site-config.ts`

This is the **only code file you need to change**. Replace the entire `siteConfig` object with values for the new destination. Every field is documented below.

#### Core Identity
```ts
siteName: "BRYCE CANYON TRAVEL",       // ALL CAPS — used in meta titles, admin header, copyright
siteUrl: "https://brycecanyon.travel", // Production domain (no trailing slash)
contactEmail: "info@brycecanyon.travel",
```

#### Destination
```ts
parkName: "Bryce Canyon National Park",  // Full official park name
parkCode: "BRCA",                        // NPS park code (used for API queries)
regionName: "Southern Utah",             // Geographic region label
stateAbbrev: "UT",                       // Two-letter state code
stateFull: "Utah",                       // Full state name (used in search queries)
```

#### Geography
```ts
// Default map center — use the center of your coverage area
// To find: Google Maps → right-click the area → "What's here?"
mapCenter: { lat: 37.5930, lng: -112.1871 },

// ETA origin — the main visitor center for drive-time calculations
etaOrigin: {
  lat: 37.6241,
  lng: -112.1671,
  name: "Bryce Canyon Visitor Center",
},
defaultZoom: 10,
```

#### Town Tiers
These define your directory coverage area and feed into AI prompts, admin placeholders, park detection logic, and the footer.
```ts
// Towns at the park entrance
gatewayTowns: ["Bryce Canyon City", "Tropic", "Cannonville"],

// Towns within ~30 min drive
nearbyTowns: ["Panguitch", "Hatch", "Henrieville", "Escalante"],

// Broader region (~1-2 hr drive)
regionalTowns: ["Cedar City", "St. George", "Kanab", "Richfield", "Torrey"],
```

#### AI Personality
```ts
aiLocale: "southern Utah",  // Used in AI prompts for geographic context
aiPersonality:
  "You're a knowledgeable local who lives near Bryce Canyon and has actually been to these places. You're telling a friend what's worth their time. Warm but not cheesy. Informative but not boring. Opinionated but fair.",
```

#### NPS Link
```ts
npsUrl: "https://www.nps.gov/brca/",
```

#### Tagline
```ts
tagline: "Your guide to Bryce Canyon National Park and beyond",
```

#### defaults (all the copywriting)

Every string in the `defaults` object is destination-specific marketing copy. Replace all of them. Key sections:

- **Footer**: `footerTagline`, `footerLocations`, `footerNewsletter`
- **SEO**: `metaDescription`, `titleTemplate` (e.g., `"%page_title% | BRYCE CANYON TRAVEL"`)
- **Homepage hero**: `heroSubtitle`, `heroLine1`, `heroLine2`, `heroAccent`, `heroDescription`
- **Homepage sections**: `exploreTitle`, `exploreSubtitle`, `featuredSubtitle`, `popularPostsSubtitle`, `recentPostsSubtitle`, `planVisitSubtitle`, `newsletterSubtitle`
- **Plan Your Visit cards**: `weatherCard`, `gettingThereCard`, `bestTimeCard` — write 2-3 sentences each about the new park
- **Contact page**: `contactSubtitle`, `contactSeoTitle`, `contactSeoDescription`, `contactAreaLabel`, `contactAreaDetail`, `contactListBizDescription`
- **News page**: `newsHeroSubtitle`, `newsSeoTitle`, `newsSeoDescription`
- **Home SEO**: `homeSeoTitle`, `homeSeoDescription`
- **llms.txt**: `llmsDescription`
- **Schema.org**: `schemaDescription`
- **Author**: `defaultAuthor` (e.g., `"Bryce Canyon Travel Team"`)

#### seedPosts

Replace with 3-5 starter blog post stubs for the new destination. These show as fallback content when the database has no posts yet. They should have realistic titles, slugs, excerpts, categories, and read times. Example:

```ts
seedPosts: [
  {
    id: "1",
    title: "The Complete Guide to Bryce Canyon's Hoodoos and Rim Trails",
    slug: "complete-guide-bryce-canyon-hoodoos-rim-trails",
    excerpt: "Everything you need to know about hiking among the world's largest collection of hoodoos.",
    published_at: "2023-05-01",
    category: "Hiking",
    category_slug: "hiking",
    read_time: "9 min read",
  },
  // ... more posts
],
```

#### cityDescriptions

Write one editorial paragraph per town describing its relationship to the park. These are used in AI-generated listing descriptions. Include at least every town in your `gatewayTowns` and `nearbyTowns` arrays, plus the park itself.

```ts
cityDescriptions: {
  "Bryce Canyon City": "Bryce Canyon City is the small community closest to the park entrance...",
  Tropic: "Tropic is a quiet farming town on the east side of Bryce Canyon...",
  Panguitch: "Panguitch, the Garfield County seat, sits about 25 miles northwest...",
  "Bryce Canyon National Park": "Bryce Canyon National Park is famous for its otherworldly hoodoo formations...",
  // ... one per town
},
```

#### cityDescriptionFallback

A generic paragraph for any town not in the map above:
```ts
cityDescriptionFallback:
  "The Bryce Canyon area in southern Utah is known for its otherworldly hoodoo formations...",
```

#### discoveryTowns

This defines the geographic search area for the Discover Listings scanner. Each entry is a GPS pin with a search radius.

To find coordinates: search the town on Google Maps, right-click → "What's here?" to get lat/lng.
Radius is in meters: 8000-10000 for small towns, 15000-20000 for cities.

```ts
discoveryTowns: [
  { name: "Bryce Canyon City", lat: 37.6720, lng: -112.1560, radius: 15000 },
  { name: "Tropic", lat: 37.6188, lng: -112.0815, radius: 10000 },
  { name: "Cannonville", lat: 37.5714, lng: -112.0570, radius: 8000 },
  { name: "Panguitch", lat: 37.8228, lng: -112.4356, radius: 15000 },
  { name: "Hatch", lat: 37.6510, lng: -112.4317, radius: 10000 },
  { name: "Henrieville", lat: 37.5678, lng: -111.9827, radius: 8000 },
  { name: "Escalante", lat: 37.7702, lng: -111.6021, radius: 15000 },
  { name: "Cedar City", lat: 37.6775, lng: -113.0619, radius: 20000 },
  { name: "Kanab", lat: 37.0475, lng: -112.5263, radius: 20000 },
],
```

#### colors

Pick a brand color palette. The defaults are Zion's red rock tones — for Bryce you might want more orange/amber/pink hoodoo tones. These are CSS hex values that become the site's color scheme. They can also be overridden later in Admin → Settings.

```ts
colors: {
  primary: { key: "color_primary", label: "Primary", default: "#d4652a" },
  sand:    { key: "color_sand",    label: "Sand",    default: "#d4a574" },
  sage:    { key: "color_sage",    label: "Sage",    default: "#7a8b6f" },
  sky:     { key: "color_sky",     label: "Sky",     default: "#6ba3c7" },
  stone:   { key: "color_stone",   label: "Stone",   default: "#8b7d6b" },
  cream:   { key: "color_cream",   label: "Cream",   default: "#f5f0e8" },
  dark:    { key: "color_dark",    label: "Dark",    default: "#2c2418" },
},
```

### 1.4 Verify the build

```bash
npx tsc --noEmit          # Should output nothing (0 errors)
npx react-router build    # Should complete with "built in X.XXs"
```

### 1.5 Commit and push

```bash
git add -A
git commit -m "feat: configure site for Bryce Canyon National Park"
git push -u origin master
```

---

## Phase 2: Infrastructure Setup

### 2.1 Create a Railway project

1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo" → select `lanternrow/bryce-travel`
3. Railway will detect the Dockerfile and start building

### 2.2 Add a Postgres database

1. In the Railway project, click "+ New" → "Database" → "PostgreSQL"
2. Railway automatically creates a `DATABASE_URL` variable and links it to your app
3. Connect to the database and run the schema + migrations:

```bash
# Using Railway CLI or any Postgres client connected to the new database:
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrations/004-redirects.sql
psql $DATABASE_URL -f db/migrations/005-recategorize.sql
psql $DATABASE_URL -f db/migrations/006-enhanced-google-data.sql
psql $DATABASE_URL -f db/migrations/007-parks-listing-type.sql
psql $DATABASE_URL -f db/migrations/008-pages-and-menus.sql
psql $DATABASE_URL -f db/migrations/009-golf-listing-type.sql
psql $DATABASE_URL -f db/migrations/010-has-no-phone-override.sql
psql $DATABASE_URL -f db/migrations/011-media-folder-nesting.sql
psql $DATABASE_URL -f db/migrations/012-submission-token.sql
psql $DATABASE_URL -f db/migrations/013-free-price-range.sql
psql $DATABASE_URL -f db/migrations/014-hiking-fields-upgrade.sql
psql $DATABASE_URL -f db/migrations/015-rename-color-settings.sql
```

### 2.3 Create a Cloudflare R2 bucket

1. Cloudflare dashboard → R2 → Create Bucket (e.g., `bryce-travel-media`)
2. Create an API token with Object Read & Write permissions for this bucket
3. Set up a public access domain (either R2.dev subdomain or custom domain)

### 2.4 Set environment variables in Railway

Go to your Railway app → Variables tab and add:

**Required:**
```
DATABASE_URL        = (auto-set by Railway when you link the database)
ADMIN_EMAIL         = your-email@example.com
ADMIN_PASSWORD      = your-secure-password
GOOGLE_PLACES_API_KEY = AIza...
ANTHROPIC_API_KEY   = sk-ant-...
```

**Image storage (required for media uploads):**
```
R2_ACCOUNT_ID       = your-cloudflare-account-id
R2_ACCESS_KEY_ID    = your-r2-token-key
R2_SECRET_ACCESS_KEY = your-r2-token-secret
R2_BUCKET_NAME      = bryce-travel-media
R2_PUBLIC_URL       = https://media.brycecanyon.travel (or your R2.dev URL)
```

**Optional (features degrade gracefully without these):**
```
NPS_API_KEY                  = for National Park Service trail data
RIDB_API_KEY                 = for Recreation.gov permit/campground data
GOOGLE_SERVICE_ACCOUNT_JSON  = for Search Console integration (full JSON, single line)
MAILCHIMP_API_KEY            = for newsletter signups
MAILCHIMP_SERVER_PREFIX      = e.g., us21
MAILCHIMP_AUDIENCE_ID        = your list ID
CRON_SECRET                  = any random string (protects cron endpoints)
```

### 2.5 Deploy

Railway should auto-deploy when you push. If not, trigger a manual deploy. First deploy takes ~2 minutes.

### 2.6 Connect your domain

1. In Railway → Settings → Domains → Add Custom Domain
2. Point your domain's DNS (CNAME) to the Railway-provided target
3. Railway handles SSL automatically

---

## Phase 3: Populate the Directory

### 3.1 Log into admin

Go to `https://yourdomain.com/admin` and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in the environment variables.

### 3.2 Upload logos

Go to Admin → Settings → upload a dark logo (for light backgrounds) and a light logo (for dark backgrounds). Set the favicon too.

### 3.3 Discover and import listings

1. Go to Admin → Discover Listings
2. Click "Start Scan" — this uses your `discoveryTowns` config to search Google Places for businesses in your coverage area
3. Review results, check the ones you want, click "Import Selected"
4. For each imported listing, click into it and use:
   - "Pull from Google" — fills in hours, phone, address, photos, ratings
   - "Generate Content" — AI writes a description and tagline using your config's personality and locale

### 3.4 Create blog categories

Go to Admin → News → Categories and create your taxonomy (e.g., Hiking, Trip Planning, Lodging, Dining, etc.)

### 3.5 Write initial blog posts

Go to Admin → News → New Post. The AI tools (Generate, Readability, SEO Scorecard) all use your site-config to produce destination-appropriate content.

---

## Checklist

- [ ] Repository cloned to new folder
- [ ] New GitHub repo created and remote swapped
- [ ] `app/lib/site-config.ts` fully updated for new destination
- [ ] TypeScript check passes (`npx tsc --noEmit`)
- [ ] Production build succeeds (`npx react-router build`)
- [ ] Committed and pushed to new repo
- [ ] Railway project created and connected to repo
- [ ] Postgres database provisioned and schema + all 12 migrations applied
- [ ] Cloudflare R2 bucket created with API token
- [ ] All required environment variables set in Railway
- [ ] First deploy successful
- [ ] Custom domain connected with SSL
- [ ] Admin login works
- [ ] Logos and favicon uploaded
- [ ] Discover Listings scan run, businesses imported
- [ ] Listings have AI-generated descriptions
- [ ] Blog categories created
- [ ] At least one blog post published

---

## Reference: site-config.ts Field Summary

| Section | Fields | Purpose |
|---------|--------|---------|
| Core Identity | `siteName`, `siteUrl`, `contactEmail` | Brand name, URLs, email throughout the site |
| Destination | `parkName`, `parkCode`, `regionName`, `stateAbbrev`, `stateFull` | Park-specific identifiers for APIs and display |
| Geography | `mapCenter`, `etaOrigin`, `defaultZoom` | Map positioning and drive-time calculations |
| Town Tiers | `gatewayTowns`, `nearbyTowns`, `regionalTowns` | AI context, park detection, admin placeholders |
| AI | `aiLocale`, `aiPersonality` | Personality and geographic awareness for AI content |
| NPS | `npsUrl` | Link to official NPS park page |
| Defaults | `tagline`, `defaults.*` | All fallback marketing copy across every page |
| City Descriptions | `cityDescriptions`, `cityDescriptionFallback` | Editorial town blurbs for AI listing descriptions |
| Discovery | `discoveryTowns` | GPS pins + radii for Google Places business scanning |
| Colors | `colors.*` | CSS color palette (overridable in admin) |
