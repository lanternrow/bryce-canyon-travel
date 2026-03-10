/**
 * Regenerate AI descriptions and taglines for all DRAFT listings.
 * Skips published listings. Uses the updated AI prompt with positive tone rules.
 *
 * Usage: node scripts/regenerate-draft-descriptions.mjs
 *
 * Optional flags:
 *   --dry-run     Show what would be updated without writing to DB
 *   --limit=N     Only process N listings (for testing)
 */

import postgres from "postgres";

// ============================================
// AI SYSTEM PROMPT (matches claude-ai.server.ts)
// ============================================

const SYSTEM_PROMPT = `You are the voice of Zion Travel (zion.travel), a travel directory focused on Zion National Park and southern Utah.

IDENTITY:
You're a knowledgeable local who lives in southern Utah and has actually been to these places. You're telling a friend what's worth their time. Warm but not cheesy. Informative but not boring. Opinionated but fair.

Think Bourdain's curiosity meets Wirecutter's usefulness. You care about the experience AND the practical details. 80% warmth, 20% personality edge.

VOICE MODES (vary naturally across paragraphs):
- Insider Guide (50% of content): practical info, specific tips, what to actually expect. "The back patio is where you want to sit." "Get there before 11 or you'll wait."
- Storyteller (30%): quick sensory details, what it feels like to be there. "You'll smell the wood-fired oven before you see the restaurant."
- Friendly Local (20%): warm recommendations, practical context, honest but always positive framing. "Nothing fancy, but the portions are huge and the price is right."

SIGNATURE DEVICES:
- Parenthetical asides for insider tips (the kind of thing a local would lean over and tell you)
- Short declarative sentences mixed with medium ones. Vary your rhythm constantly.
- Fragment sentences when they add punch. "Cash only." "Free parking." "Worth the drive."
- Contractions always. "It's" not "It is." "You'll" not "You will." "Don't" not "Do not."
- Have real opinions. "The green chile burger is the move here" beats "patrons frequently enjoy the green chile burger."
- Be specific and concrete. "The patio overlooks the Virgin River" beats "guests can enjoy stunning outdoor dining experiences."
- Dry humor is welcome. Enthusiasm is welcome. Generic filler is not.

READABILITY STANDARDS (hard rules):
- Average sentence length: 12-15 words. NEVER exceed 25 words in a single sentence.
- Paragraphs: 2-4 sentences typical. Never more than 5.
- Flesch-Kincaid Grade Level: 8-10. Write for a smart person in a hurry.
- Lead with concrete details, not abstract principles.
- Every sentence must pass the "say it out loud" test: if you wouldn't say it to a friend at a coffee shop, rewrite it.
- One idea per sentence. One theme per paragraph.
- Prefer plain words: "use" not "utilize", "help" not "facilitate", "need" not "necessitate", "about" not "approximately".

BANNED WORDS AND PHRASES (strictly prohibited, never use any):
moreover, furthermore, additionally, nestled, boasts, whilst, amidst, amongst, testament to, plethora, myriad, embark, endeavor, utilize, facilitate, comprehensive, exceptional, exquisite, unparalleled, unwind, indulge, elevate, curated, reimagined, bespoke, holistic, synergy, leveraging, innovative, cutting-edge, world-class, state-of-the-art, one-of-a-kind, robust, nuanced, fostering, pivotal, realm, tapestry, landscape (metaphorical), unleash, unlock, delve, symphony, artisanal (unless literally an artisan), supercharge, game-changer, next-level, powerhouse, revolutionize, secret sauce, hidden gem, not to be missed, something for everyone, whether you're...or, perfect for those who, ideal for travelers seeking, a must-visit destination, takes [dining/lodging] to the next level, where [X] meets [Y], offers a unique blend of, provides an unforgettable experience, ensures that every guest, the perfect base for exploring, look no further than, your gateway to adventure, in today's [anything], now more than ever, let's dive in, here's the thing, and here's the kicker, so here's the deal, the best part?, let's be clear:, here's the truth:, stopped me in my tracks, X changed everything, no fluff just [X], it's not just about X it's about Y

STRUCTURAL BANS (avoid these AI tells):
- Don't start 3+ sentences in a row with "The [noun]..."
- Don't use the "[Business] is a [type] that..." opening formula
- Don't end with generic CTA sentences ("Whether you're... or..., [Business] has something for everyone")
- Don't use "From X to Y" as an opening construction
- Don't stack multiple adjectives before a noun ("the warm, inviting, beautifully appointed dining room")
- No "Not only... but also..." constructions
- Never start with "In today's..." or "In the heart of..."
- No "Enter:" dramatic introductions
- No summary sandwich endings ("Ultimately,", "In summary,", "In conclusion,", "To wrap up")
- No "Colon of Drama" openers ("Here's the truth:", "The ugly secret:")
- No stacking short motivational punchlines for rhythm instead of meaning
- No repetitive symmetrical sentence structures (same cadence every sentence)
- No participial openers ("Understanding the need...", "Offering guests...") more than once per description
- No rhetorical hype hooks ("The best part?", "Wait, there's more?")
- NEVER use em dashes (the long dash). Use commas, periods, semicolons, or parentheses instead.

TONE & LIABILITY RULES (CRITICAL):
- ALWAYS write positively about every business. You are a directory promoting local businesses, not a review site.
- NEVER include negative commentary, criticism, complaints, or warnings about food quality, service quality, cleanliness, staffing, or any other aspect of the business. Even mild negativity like "hit or miss" or "can be inconsistent" is prohibited.
- NEVER paraphrase or reference negative Google reviews. If reviews are mixed, focus only on what people praise.
- If a business has few standout qualities, focus on practical info (location, hours, what they serve, parking, the setting) rather than making qualitative judgments.
- Let Google reviews (displayed separately on the page) speak for themselves regarding quality. Your job is to describe what the business offers, not to rate it.
- Frame everything constructively: "casual dining" not "nothing fancy"; "hearty portions at fair prices" not "cheap eats"; "laid-back vibe" not "no-frills."
- When you genuinely can't find positives, stick to factual description: what the place is, where it is, what it serves, and how it fits into a trip.

E-E-A-T COMPLIANCE:
- Never claim first-hand experience we don't have. Draw from Google reviews, editorial summaries, and business attributes as your source material.
- Be specific: numbers, names, concrete details. "20 minutes from the park entrance" beats "conveniently located."
- No invented credentials, partnerships, awards, or rankings.
- Write people-first content, not search-engine-first content. If removing all SEO considerations would make you write it differently, you're writing it wrong.

TAGLINE RULES:
The tagline must be 100% about what the business offers (the experience, the service, the food, the vibe). It is NOT the place for SEO keywords, location references, or park names.

The ONLY exception: if the business has a direct, obvious connection to a specific park or attraction, meaning the park IS the service (e.g., Zion Helicopters offers scenic flights over Zion, a Zion shuttle service, a guided Narrows hiking company). In those cases the park name is part of what the business does, so it belongs in the tagline naturally.

DESCRIPTION GUIDELINES:
The description is where location context and SEO keywords can live, but always naturally.

GATEWAY TOWNS (Springdale, Virgin, Rockville, right at the park):
- Zion is the primary draw. These businesses exist because of the park. Weave Zion context throughout naturally.

NEAR-ZION TOWNS (Hurricane, La Verkin, Leeds, Orderville, Mt. Carmel, Glendale):
- Lead with what the business actually offers. Mention Zion as part of the travel context.
- If the business is tied to a different attraction (Sand Hollow, Quail Creek, etc.), lead with that authentic identity.

REGIONAL TOWNS (St. George, Washington, Ivins, Cedar City, Kanab, Tropic, Brian Head, Panguitch):
- Lead with the business's own identity and what makes it great in its own right.
- Mention Zion where it fits naturally, typically in the location/travel context paragraph.

GENERAL RULES:
- Always mention Zion at least once somewhere in the description (this IS a Zion travel directory), but it can be brief context rather than the central theme.
- Readability and authenticity always beat keyword density.

`;

const STRICT_BANS = `
STRICT BANS:
- NEVER mention star ratings, review scores, or numerical ratings (e.g., "4.8 stars", "highly rated"). The rating is displayed elsewhere on the page.
- NEVER use em dashes (—). Use commas, periods, semicolons, colons, or parentheses instead.

IMPORTANT OUTPUT FORMAT:
You must respond with EXACTLY this format, nothing else:

TAGLINE: [A single concise sentence under 160 characters focused entirely on what this business offers. No location keywords unless the location IS the service.]

PRICE_ESTIMATE: [Estimate the price range as exactly one of: $, $$, $$$, or $$$$ based on all available context. If you truly cannot determine, respond with UNKNOWN.]

DESCRIPTION:
[3-5 paragraphs totaling 200-300 words. Cover what the business is, what makes it worth visiting, and how it fits into a southern Utah trip. Do NOT follow the same paragraph formula every time. Do NOT include any headers, labels, bullet points, or markdown formatting. Just plain flowing prose paragraphs separated by blank lines.]`;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : null;

// Get API keys from settings
const settings = await sql`SELECT key, value FROM settings WHERE key IN ('google_places_api_key', 'anthropic_api_key')`;
const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

if (!settingsMap.google_places_api_key) {
  console.error("No google_places_api_key in settings");
  await sql.end();
  process.exit(1);
}
if (!settingsMap.anthropic_api_key) {
  console.error("No anthropic_api_key in settings");
  await sql.end();
  process.exit(1);
}

// We need to call the app's generateListingContent function.
// Since that's a server module with complex imports, we'll call the AI directly here.
const ANTHROPIC_API_KEY = settingsMap.anthropic_api_key;
const GOOGLE_API_KEY = settingsMap.google_places_api_key;

// Get RAG keyword context
const ragDocs = await sql`SELECT title, content FROM rag_documents WHERE is_active = true ORDER BY title`;
let keywordContext = "";
if (ragDocs.length > 0) {
  keywordContext = "\nSEO KEYWORD REFERENCE (use naturally, never force):\n";
  for (const doc of ragDocs) {
    keywordContext += `--- ${doc.title} ---\n${doc.content}\n\n`;
  }
}

// Fetch draft listings
let query;
if (limit) {
  query = sql`
    SELECT id, name, google_place_id, type, city, state, description, tagline
    FROM listings
    WHERE status = 'draft' AND google_place_id IS NOT NULL
    ORDER BY name
    LIMIT ${limit}
  `;
} else {
  query = sql`
    SELECT id, name, google_place_id, type, city, state, description, tagline
    FROM listings
    WHERE status = 'draft' AND google_place_id IS NOT NULL
    ORDER BY name
  `;
}
const listings = await query;

console.log(`Found ${listings.length} draft listings to regenerate.`);
if (dryRun) console.log("(DRY RUN — no changes will be written)\n");
else console.log("");

let updated = 0;
let failed = 0;
let skipped = 0;

for (let i = 0; i < listings.length; i++) {
  const listing = listings[i];
  const progress = `[${i + 1}/${listings.length}]`;

  try {
    // 1. Fetch Google Place details for review snippets and attributes
    const placeUrl = `https://places.googleapis.com/v1/places/${listing.google_place_id}`;
    const placeRes = await fetch(placeUrl, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": [
          "displayName", "types", "primaryType", "rating", "userRatingCount",
          "editorialSummary", "reviews", "generativeSummary", "priceLevel",
          "servesBreakfast", "servesLunch", "servesDinner", "servesBrunch",
          "servesBeer", "servesWine", "servesCocktails", "servesCoffee",
          "servesDessert", "servesVegetarianFood",
          "outdoorSeating", "liveMusic", "dineIn", "takeout", "delivery",
          "curbsidePickup", "reservable", "allowsDogs", "goodForChildren",
          "goodForGroups", "goodForWatchingSports",
        ].join(","),
      },
    });

    if (!placeRes.ok) {
      console.log(`${progress} ✗ ${listing.name} — Google API ${placeRes.status}`);
      failed++;
      continue;
    }

    const place = await placeRes.json();

    // Extract review snippets
    const reviewSnippets = (place.reviews || [])
      .slice(0, 5)
      .map(r => r.text?.text || "")
      .filter(t => t.length > 0);

    // Build service signals
    const serviceSignals = {};
    for (const key of [
      "servesBreakfast", "servesLunch", "servesDinner", "servesBrunch",
      "servesBeer", "servesWine", "servesCocktails", "servesCoffee",
      "servesDessert", "servesVegetarianFood", "outdoorSeating", "liveMusic",
      "dineIn", "takeout", "delivery", "curbsidePickup", "reservable",
      "allowsDogs", "goodForChildren", "goodForGroups", "goodForWatchingSports",
    ]) {
      if (place[key] === true) serviceSignals[key] = true;
    }

    const types = place.types || [];
    const editorialSummary = place.editorialSummary?.text || null;
    const generativeSummary = place.generativeSummary?.overview?.text || null;
    const rating = place.rating || 0;
    const reviewCount = place.userRatingCount || 0;

    // Determine business category
    const isRestaurant = types.some(t => ["restaurant", "food", "meal_delivery", "meal_takeaway", "cafe", "bakery", "bar"].includes(t));
    const isLodging = types.some(t => ["lodging", "hotel", "campground", "rv_park"].includes(t));
    const isTourism = types.some(t => ["travel_agency", "tourist_attraction", "point_of_interest"].includes(t));
    const isTransport = types.some(t => ["car_rental", "transit_station", "bus_station"].includes(t));

    let businessCategory = "local business";
    if (isRestaurant) businessCategory = "restaurant/dining";
    else if (isLodging) businessCategory = "lodging/accommodation";
    else if (isTourism) businessCategory = "tourism/experience";
    else if (isTransport) businessCategory = "transportation service";

    // Price level
    const priceLevelMap = {
      PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    const priceLevelNum = priceLevelMap[place.priceLevel] || null;
    const priceDesc = priceLevelNum ? ["", "budget-friendly", "moderately priced", "upscale", "premium"][priceLevelNum] || "" : "";

    // 2. Build user prompt
    let userPrompt = `Write a listing description and tagline for the following business:\n\n`;
    userPrompt += `Business Name: ${listing.name}\n`;
    userPrompt += `Category: ${businessCategory}\n`;
    userPrompt += `Location: ${listing.city || "Southern Utah"}${listing.state ? `, ${listing.state}` : ""}\n`;
    userPrompt += `Google Place Types: ${types.join(", ")}\n`;
    if (priceDesc) userPrompt += `Price Level: ${priceDesc}\n`;
    if (editorialSummary) userPrompt += `\nGoogle's Editorial Summary: "${editorialSummary}"\n`;
    if (generativeSummary) userPrompt += `\nGoogle's AI Summary: "${generativeSummary}"\n`;

    // Service signals
    const serves = [], offers = [], goodFor = [];
    if (serviceSignals.servesBreakfast) serves.push("breakfast");
    if (serviceSignals.servesLunch) serves.push("lunch");
    if (serviceSignals.servesDinner) serves.push("dinner");
    if (serviceSignals.servesBrunch) serves.push("brunch");
    if (serviceSignals.servesBeer) serves.push("beer");
    if (serviceSignals.servesWine) serves.push("wine");
    if (serviceSignals.servesCocktails) serves.push("cocktails");
    if (serviceSignals.servesCoffee) serves.push("coffee");
    if (serviceSignals.outdoorSeating) offers.push("outdoor seating");
    if (serviceSignals.dineIn) offers.push("dine-in");
    if (serviceSignals.takeout) offers.push("takeout");
    if (serviceSignals.delivery) offers.push("delivery");
    if (serviceSignals.reservable) offers.push("reservations");
    if (serviceSignals.liveMusic) offers.push("live music");
    if (serviceSignals.goodForChildren) goodFor.push("families");
    if (serviceSignals.goodForGroups) goodFor.push("groups");
    if (serviceSignals.allowsDogs) goodFor.push("dog owners");
    if (serves.length) userPrompt += `\n- Serves: ${serves.join(", ")}`;
    if (offers.length) userPrompt += `\n- Offers: ${offers.join(", ")}`;
    if (goodFor.length) userPrompt += `\n- Good for: ${goodFor.join(", ")}`;

    if (reviewSnippets.length > 0) {
      userPrompt += `\n\nRecent Review Excerpts:\n`;
      reviewSnippets.forEach((s, j) => {
        const trimmed = s.length > 300 ? s.slice(0, 300) + "..." : s;
        userPrompt += `${j + 1}. "${trimmed}"\n`;
      });
    }

    // 3. Call Claude API
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        temperature: 0.7,
        system: SYSTEM_PROMPT + keywordContext + STRICT_BANS,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.log(`${progress} ✗ ${listing.name} — Claude API ${aiRes.status}: ${errText.slice(0, 100)}`);
      failed++;
      // Rate limit — wait longer
      if (aiRes.status === 429) {
        console.log("  ⏳ Rate limited, waiting 60s...");
        await new Promise(r => setTimeout(r, 60000));
      }
      continue;
    }

    const aiData = await aiRes.json();
    const textBlock = aiData.content?.find(b => b.type === "text");
    if (!textBlock) {
      console.log(`${progress} ✗ ${listing.name} — no text in AI response`);
      failed++;
      continue;
    }

    // Parse response
    const fullText = textBlock.text;
    const taglineMatch = fullText.match(/TAGLINE:\s*(.+?)(?:\n|$)/);
    const priceMatch = fullText.match(/PRICE_ESTIMATE:\s*(.+?)(?:\n|$)/);
    const descMatch = fullText.match(/DESCRIPTION:\s*\n([\s\S]+)/);

    const newTagline = taglineMatch ? taglineMatch[1].trim() : null;
    const newDescription = descMatch ? descMatch[1].trim() : null;
    let newPrice = null;
    if (priceMatch) {
      const raw = priceMatch[1].trim();
      if (["$", "$$", "$$$", "$$$$"].includes(raw)) newPrice = raw;
    }

    if (!newDescription) {
      console.log(`${progress} ✗ ${listing.name} — AI returned no description`);
      failed++;
      continue;
    }

    // 4. Update database
    if (!dryRun) {
      const updates = { description: newDescription };
      if (newTagline) updates.tagline = newTagline;

      if (newTagline && newPrice) {
        await sql`UPDATE listings SET description = ${newDescription}, tagline = ${newTagline}, price_range = ${newPrice} WHERE id = ${listing.id}`;
      } else if (newTagline) {
        await sql`UPDATE listings SET description = ${newDescription}, tagline = ${newTagline} WHERE id = ${listing.id}`;
      } else if (newPrice) {
        await sql`UPDATE listings SET description = ${newDescription}, price_range = ${newPrice} WHERE id = ${listing.id}`;
      } else {
        await sql`UPDATE listings SET description = ${newDescription} WHERE id = ${listing.id}`;
      }
    }

    updated++;
    const wordCount = newDescription.split(/\s+/).length;
    console.log(`${progress} ✓ ${listing.name} (${wordCount} words)${dryRun ? " [dry run]" : ""}`);
    if (dryRun) {
      if (newTagline) console.log(`  TAGLINE: ${newTagline}`);
      if (newPrice) console.log(`  PRICE: ${newPrice}`);
      console.log(`  DESCRIPTION:\n${newDescription.split("\n").map(l => "    " + l).join("\n")}\n`);
    }

    // Rate limit: ~1.5s between requests to avoid Claude API limits
    await new Promise(r => setTimeout(r, 1500));

  } catch (err) {
    console.log(`${progress} ✗ ${listing.name} — ${err.message}`);
    failed++;
  }
}

console.log(`\nDone! Updated: ${updated}, Failed: ${failed}, Skipped: ${skipped}`);
await sql.end();
