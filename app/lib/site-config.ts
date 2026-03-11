// ============================================
// SITE CONFIG — The One File That Changes Per Destination
// ============================================
// To deploy this system for a different destination (e.g., Bryce Canyon),
// update the values below. Every other file in the codebase imports from here.
// ============================================

export const siteConfig = {
  // ── Core Identity ──────────────────────────────
  siteName: "BRYCE CANYON TRAVEL",
  siteUrl: "https://brycecanyon.travel",
  contactEmail: "info@brycecanyon.travel",

  // ── Destination ────────────────────────────────
  parkName: "Bryce Canyon National Park",
  parkCode: "BRCA", // NPS park code
  regionName: "Southern Utah",
  stateAbbrev: "UT",
  stateFull: "Utah",

  // ── Geography ──────────────────────────────────
  /** Default map center (used when no markers exist) */
  mapCenter: { lat: 37.593, lng: -112.1871 } as const,
  /** ETA origin point for drive-time calculations */
  etaOrigin: {
    lat: 37.6241,
    lng: -112.1671,
    name: "Bryce Canyon Visitor Center",
  } as const,
  defaultZoom: 10,

  // ── Town Tiers (for AI context) ────────────────
  gatewayTowns: ["Bryce Canyon City", "Tropic", "Cannonville"],
  nearbyTowns: ["Panguitch", "Hatch", "Henrieville", "Escalante"],
  regionalTowns: [
    "Cedar City",
    "St. George",
    "Kanab",
    "Richfield",
    "Torrey",
  ],

  // ── AI Personality ─────────────────────────────
  aiLocale: "southern Utah",
  aiPersonality:
    "You're a knowledgeable local who lives near Bryce Canyon and has actually been to these places. You're telling a friend what's worth their time. Warm but not cheesy. Informative but not boring. Opinionated but fair.",

  // ── NPS Links ──────────────────────────────────
  npsUrl: "https://www.nps.gov/brca/",

  // ── Default Content (hardcoded fallbacks) ──────
  tagline: "Your guide to Bryce Canyon National Park and beyond",

  defaults: {
    /** Footer */
    footerTagline:
      "Your guide to Bryce Canyon National Park and the surrounding areas. Discover dining, lodging, experiences, and trails.",
    footerLocations: "Bryce Canyon City,Tropic,Panguitch,Escalante,Kanab",
    footerNewsletter: "Get tips and updates for your Bryce Canyon trip.",

    /** SEO */
    metaDescription:
      "Discover the best dining, lodging, hiking, and experiences in and around Bryce Canyon National Park.",
    titleTemplate: "%page_title% | BRYCE CANYON TRAVEL",

    /** Homepage */
    heroSubtitle: "Southern Utah",
    heroLine1: "YOUR GUIDE TO BRYCE",
    heroLine2: "CANYON NATIONAL PARK",
    heroAccent: "AND BEYOND",
    heroDescription:
      "Discover the best dining, lodging, experiences, hiking trails, and transportation in and around Bryce Canyon National Park.",
    searchPlaceholder: "Search restaurants, hotels, trails...",
    exploreTitle: "Explore Bryce Canyon",
    exploreSubtitle:
      "Everything you need for your perfect Bryce Canyon trip, all in one place.",
    featuredSubtitle:
      "Handpicked favorites from around the Bryce Canyon area.",
    popularPostsSubtitle:
      "Most-viewed Bryce Canyon guides readers are exploring right now.",
    recentPostsSubtitle:
      "The latest Bryce Canyon travel guides and updates from our newsroom.",
    planVisitSubtitle:
      "Tips and insights for making the most of your time at Bryce Canyon.",
    newsletterSubtitle:
      "Get seasonal tips, new listing alerts, and insider guides for planning your Bryce Canyon adventure. No spam, just the good stuff.",

    /** Plan Your Visit cards */
    weatherCard:
      "Bryce Canyon sits at over 8,000 feet elevation, making it cooler than most Utah parks. Summers are warm and pleasant with afternoon thunderstorms. Spring and fall bring crisp temperatures ideal for hiking. Winter transforms the hoodoos into a stunning snow-covered landscape, though some roads may close.",
    gettingThereCard:
      "Bryce Canyon is located in south-central Utah, about 4 hours from Las Vegas and 4.5 hours from Salt Lake City. The nearest town is Bryce Canyon City, right at the park entrance along Highway 12. Cedar City, about 80 miles west, has the closest regional airport.",
    bestTimeCard:
      "May through September offers the best weather and full access to all viewpoints and trails. June and July are busiest — book lodging early. For fewer crowds and spectacular photography, visit in April, October, or even winter when snow-dusted hoodoos create an otherworldly scene.",

    /** Contact page */
    contactSubtitle:
      "Have a question about Bryce Canyon National Park? Want to list your business? We'd love to hear from you.",
    contactSeoTitle:
      "Contact Bryce Canyon Travel | Questions and Listing Support",
    contactSeoDescription:
      "Contact Bryce Canyon Travel for trip-planning help, listing updates, and partnership questions. We support visitors and local businesses near Bryce Canyon.",
    contactAreaLabel: "Bryce Canyon City, UT & surrounding",
    contactAreaDetail: "Bryce Canyon National Park communities",
    contactListBizDescription:
      "Own a restaurant, hotel, or tour company near Bryce Canyon? Get your business in front of thousands of visitors planning their trip.",

    /** News page */
    newsHeroSubtitle:
      "Travel tips, trail guides, and everything you need for your Bryce Canyon adventure.",
    newsSeoTitle: "News & Guides: Bryce Canyon Travel Tips and Updates",
    newsSeoDescription:
      "Latest Bryce Canyon National Park news, travel tips, and trail guides. Explore helpful local insights to plan your trip with confidence.",

    /** Home page SEO */
    homeSeoTitle: "Your Guide to Bryce Canyon National Park",
    homeSeoDescription:
      "Plan your trip to Bryce Canyon National Park. Discover the best dining, lodging, experiences, hiking trails, and transportation in Bryce Canyon City, Tropic, Panguitch, Escalante, and beyond.",

    /** llms.txt */
    llmsDescription:
      "Your comprehensive guide to Bryce Canyon National Park — dining, lodging, hiking, experiences, golf, parks, and transportation near Bryce Canyon City, Utah and the Paunsaugunt Plateau.",

    /** Schema.org */
    schemaDescription: "Your guide to Bryce Canyon National Park",

    /** Default author for blog posts */
    defaultAuthor: "Bryce Canyon Travel Team",

    /** Seed / fallback blog posts (shown when DB has none) */
    seedPosts: [
      {
        id: "1",
        title:
          "The Complete Guide to Bryce Canyon's Hoodoos and Rim Trails",
        slug: "complete-guide-bryce-canyon-hoodoos-rim-trails",
        excerpt:
          "Everything you need to know about hiking among the world's largest collection of hoodoos, from Sunset Point to Bryce Point.",
        published_at: "2023-05-01",
        category: "Hiking",
        category_slug: "hiking",
        read_time: "9 min read",
      },
      {
        id: "2",
        title: "Best Viewpoints in Bryce Canyon: Where to Watch Sunrise and Sunset",
        slug: "best-viewpoints-bryce-canyon-sunrise-sunset",
        excerpt:
          "A photographer's guide to the most spectacular overlooks along the rim, including tips on timing and crowds.",
        published_at: "2023-04-01",
        category: "Trip Planning",
        category_slug: "trip-planning",
        read_time: "7 min read",
      },
      {
        id: "3",
        title:
          "Navajo Loop and Queens Garden: Bryce Canyon's Must-Do Combination Hike",
        slug: "navajo-loop-queens-garden-combination-hike",
        excerpt:
          "How to tackle the park's most popular trail combo, with tips on direction, timing, and what to expect below the rim.",
        published_at: "2023-03-01",
        category: "Hiking",
        category_slug: "hiking",
        read_time: "8 min read",
      },
      {
        id: "4",
        title: "The Best Time of Year to Visit Bryce Canyon National Park",
        slug: "best-time-of-year-to-visit-bryce-canyon",
        excerpt:
          "A month-by-month guide to weather, crowds, and seasonal highlights at 8,000 feet elevation.",
        published_at: "2023-02-01",
        category: "Trip Planning",
        category_slug: "trip-planning",
        read_time: "7 min read",
      },
      {
        id: "5",
        title:
          "Scenic Byway 12: The Ultimate Road Trip Through Red Rock Country",
        slug: "scenic-byway-12-road-trip-red-rock-country",
        excerpt:
          "Drive one of America's most beautiful highways connecting Bryce Canyon to Capitol Reef through Grand Staircase-Escalante.",
        published_at: "2023-01-01",
        category: "Trip Planning",
        category_slug: "trip-planning",
        read_time: "10 min read",
      },
    ],
  },

  // ── City Context Descriptions (for AI-generated listing content) ─
  cityDescriptions: {
    "Bryce Canyon City":
      "Bryce Canyon City is the small community closest to the park entrance, strung along Highway 12 with a handful of motels, restaurants, and outfitters. Visitors use it as a convenient base camp just minutes from the Bryce Amphitheater's iconic hoodoo formations.",
    Tropic:
      "Tropic is a quiet farming town on the east side of Bryce Canyon, offering a more relaxed atmosphere and affordable lodging options. The town sits in a scenic valley with views toward the pink cliffs and serves as a peaceful alternative to staying right at the park gate.",
    Cannonville:
      "Cannonville is a small community along Highway 12 southeast of Bryce Canyon, serving as a gateway to both the national park and the Kodachrome Basin State Park. Its rural setting and proximity to Grand Staircase-Escalante make it a practical stop for multi-destination travelers.",
    Panguitch:
      "Panguitch, the Garfield County seat, sits about 25 miles northwest of Bryce Canyon along Highway 89. The historic downtown offers a wider selection of dining and lodging at lower prices, and the town is a popular base for visitors exploring both Bryce Canyon and the surrounding national forests.",
    Hatch:
      "Hatch is a small ranching community in the Sevier River valley between Bryce Canyon and Cedar Breaks. Known as a gateway to excellent fly fishing on the Sevier River, it offers a handful of lodging options and a quiet, no-frills atmosphere for visitors seeking a more off-the-beaten-path experience.",
    Henrieville:
      "Henrieville is a tiny community along Highway 12 between Cannonville and Escalante, offering a remote and quiet stop near the northern edge of Grand Staircase-Escalante National Monument. Visitors passing through enjoy sweeping views of the surrounding mesa and canyon country.",
    Escalante:
      "Escalante is a small adventure hub along Scenic Byway 12, roughly an hour east of Bryce Canyon. The town is the primary gateway to Grand Staircase-Escalante National Monument and offers outfitters, restaurants, and lodging for hikers and canyoneers exploring the region's slot canyons and arches.",
    "Cedar City":
      "Cedar City, home to Southern Utah University and the Utah Shakespeare Festival, sits about 80 miles west of Bryce Canyon. The city has the nearest regional airport and provides a full range of urban amenities, making it a convenient base for visitors exploring both Bryce Canyon and Cedar Breaks National Monument.",
    Widtsoe:
      "Widtsoe is a ghost town area in Johns Valley along Scenic Byway 12 between Bryce Canyon and Escalante. The surrounding high-plateau ranchland offers wide-open views of the Aquarius Plateau and a glimpse into southern Utah's homesteading past.",
    "Panguitch Lake Resort":
      "Panguitch Lake Resort is a small recreation area near Panguitch Lake along Highway 143 in the Dixie National Forest. The lake draws visitors for fishing, boating, and camping at over 8,000 feet elevation, with easy access to both Bryce Canyon and Cedar Breaks.",
    "Duck Creek Village":
      "Duck Creek Village is a mountain community along Highway 14 in the Dixie National Forest at about 8,500 feet elevation. Popular year-round for snowmobiling, cross-country skiing, ATV riding, and fishing, it offers a cool alpine retreat between Bryce Canyon and Cedar Breaks.",
    Alton:
      "Alton is a small agricultural community south of Bryce Canyon along Highway 89. Situated in a scenic valley between the park and the highway corridor to Zion, it provides a quiet rural setting with views of the surrounding red rock country.",
    Glendale:
      "Glendale is a quiet community along Highway 89 in the Upper Virgin River valley between Bryce Canyon and Zion National Park. Its location midway between the two parks makes it a convenient stop for travelers exploring both destinations.",
    Orderville:
      "Orderville is a small town along Highway 89 just north of the east entrance to Zion National Park. Originally founded as a United Order community, it now serves as a convenient stop between Bryce Canyon and Zion with a handful of lodging and dining options.",
    Kanab:
      "Kanab, known as \"Little Hollywood\" for its filming history, sits south of Bryce Canyon near the Arizona border. The town serves as a hub for multi-park itineraries covering Bryce Canyon, Zion, Grand Canyon North Rim, and the famous Wave permit area.",
    "Bryce Canyon National Park":
      "Bryce Canyon National Park is famous for its otherworldly hoodoo formations — tall, thin rock spires rising from the amphitheaters carved into the Paunsaugunt Plateau. Visitors come from around the world to hike below the rim among thousands of these crimson and orange pillars, stargaze under some of the darkest skies in North America, and drive the 18-mile scenic road to Rainbow Point.",
  } as Record<string, string>,

  /** Fallback city description for unknown cities */
  cityDescriptionFallback:
    "The Bryce Canyon area in southern Utah is known for its otherworldly hoodoo formations, pink cliffs, and vast stretches of high-elevation forest and canyon country. Visitors come from around the world to hike among the spires, and the surrounding communities offer a welcoming range of services to support every kind of trip.",

  // ── Discovery Towns (for Google Places business scanning) ──
  // Each entry defines a town center + search radius for the Discover Listings tool.
  // To find coordinates: search the town on Google Maps, right-click → "What's here?"
  // Radius is in meters — 25 mi ≈ 40234m, 10 mi ≈ 16093m.
  discoveryTowns: [
    // Gateway (25-mile radius)
    { name: "Bryce Canyon City", lat: 37.672, lng: -112.156, radius: 40234 },
    // East side of Bryce Canyon
    { name: "Tropic", lat: 37.6188, lng: -112.0815, radius: 16093 },
    { name: "Cannonville", lat: 37.5714, lng: -112.057, radius: 16093 },
    { name: "Henrieville", lat: 37.5628, lng: -111.9944, radius: 16093 },
    // North / Highway 89 corridor
    { name: "Panguitch", lat: 37.8228, lng: -112.4356, radius: 16093 },
    { name: "Hatch", lat: 37.651, lng: -112.4317, radius: 16093 },
    // Scenic Byway 12 east
    { name: "Escalante", lat: 37.7702, lng: -111.6021, radius: 16093 },
    { name: "Widtsoe", lat: 37.8322, lng: -111.9950, radius: 16093 },
    // Mountain / Highway 143
    { name: "Panguitch Lake Resort", lat: 37.7082, lng: -112.6417, radius: 16093 },
    { name: "Duck Creek Village", lat: 37.5236, lng: -112.6630, radius: 16093 },
    // South / Highway 89 toward Zion
    { name: "Alton", lat: 37.4378, lng: -112.4827, radius: 16093 },
    { name: "Glendale", lat: 37.3258, lng: -112.6008, radius: 16093 },
    { name: "Orderville", lat: 37.2758, lng: -112.6377, radius: 16093 },
  ] as Array<{ name: string; lat: number; lng: number; radius: number }>,

  // ── Color Palette (defaults — overridable in admin) ─
  colors: {
    primary: { key: "color_primary", label: "Primary", default: "#d4652a" },
    sand: { key: "color_sand", label: "Sand", default: "#d4a574" },
    sage: { key: "color_sage", label: "Sage", default: "#7a8b6f" },
    sky: { key: "color_sky", label: "Sky", default: "#6ba3c7" },
    stone: { key: "color_stone", label: "Stone", default: "#8b7d6b" },
    cream: { key: "color_cream", label: "Cream", default: "#f5f0e8" },
    dark: { key: "color_dark", label: "Dark", default: "#2c2418" },
  },
} as const;

// ── Derived helpers ──────────────────────────────

/** Settings key → CSS variable name mapping */
export const COLOR_SETTINGS_TO_CSS: Record<string, string> = {
  color_primary: "--color-primary",
  color_sand: "--color-sand",
  color_sage: "--color-sage",
  color_sky: "--color-sky",
  color_stone: "--color-stone",
  color_cream: "--color-cream",
  color_dark: "--color-dark",
};

/** Default color values keyed by settings key */
export const DEFAULT_COLOR_VALUES: Record<string, string> = Object.fromEntries(
  Object.values(siteConfig.colors).map((c) => [c.key, c.default])
);

/** Color palette for admin settings UI */
export const COLOR_PALETTE: Record<string, { label: string; default: string }> =
  Object.fromEntries(
    Object.values(siteConfig.colors).map((c) => [
      c.key,
      { label: c.label, default: c.default },
    ])
  );
