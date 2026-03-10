import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "./queries.server";
import { getActiveRagDocuments } from "./queries.server";
import { getNewsArticlePath, getNewsCategoryPath } from "./news-url";
import { siteConfig } from "./site-config";

// ============================================
// CLAUDE AI — Content Generation for Listings
// ============================================

const DEFAULT_MODEL = "claude-opus-4-20250514";

/**
 * Get a configured Anthropic client.
 * Reads API key from admin settings, falls back to environment variable.
 */
async function getAnthropicClient(): Promise<Anthropic | null> {
  let apiKey: string | null = null;

  try {
    const settings = await getSettings();
    if (settings.anthropic_api_key) {
      apiKey = settings.anthropic_api_key;
    }
  } catch {
    // Fall through to env var
  }

  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY || null;
  }

  if (!apiKey) return null;

  return new Anthropic({ apiKey });
}

/**
 * Get the configured AI model name.
 */
async function getAiModel(): Promise<string> {
  try {
    const settings = await getSettings();
    if (settings.ai_model) {
      return settings.ai_model;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_MODEL;
}

/**
 * Build a keyword/SEO context string from active RAG documents.
 */
async function buildKeywordContext(): Promise<string> {
  try {
    const docs = await getActiveRagDocuments();
    if (!docs || (docs as any[]).length === 0) return "";

    const sections = (docs as any[]).map(
      (doc: any) => `### ${doc.title}\n${doc.content}`
    );

    return `## SEO KEYWORD REFERENCE\nThe following keywords and phrases are strategically important for this travel website. Incorporate them naturally where relevant; do not force them in. Prioritize keywords that match the specific business type and location.\n\n---\n${sections.join("\n\n---\n")}`;
  } catch {
    return "";
  }
}

/**
 * Enforce a hard maximum character length on AI-generated text.
 * Tries to truncate at the last sentence boundary (period + space) that fits.
 * Falls back to the last word boundary if no sentence boundary works.
 */
function enforceMaxLength(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  // Try to cut at the last sentence boundary (". ") that fits
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf(". ");
  if (lastPeriod >= maxLen * 0.7) {
    // Only use sentence boundary if it preserves at least 70% of the max length
    return text.slice(0, lastPeriod + 1);
  }

  // Fall back to last word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 0) {
    return text.slice(0, lastSpace);
  }

  // Last resort: hard chop
  return truncated;
}

/**
 * Generate SEO-optimized filename and alt text for an image using Claude Vision.
 *
 * Filename format: zion-travel-[12-15 descriptive/keyword words separated by hyphens].ext
 * Alt text: 15-20 words, grammatically sound, with select keywords woven in naturally.
 */
export async function generateImageMeta(input: {
  imageUrl: string;
  currentFilename?: string;
  field: "filename" | "alt" | "both";
}): Promise<{ filename?: string; altText?: string } | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const keywordContext = await buildKeywordContext();

  const { imageUrl, currentFilename, field } = input;

  // Detect file extension from current filename or URL
  const extMatch = (currentFilename || imageUrl).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";

  const filenamePrefix = siteConfig.siteName.toLowerCase().replace(/\s+/g, "-");
  const systemPrompt = `You are an expert SEO image optimizer for ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel directory website focused on ${siteConfig.parkName} and the surrounding ${siteConfig.regionName.toLowerCase()} region.

You will be shown an image. Your job is to generate SEO-optimized metadata for it.

${keywordContext}

FILENAME RULES:
- Must start with "${filenamePrefix}-"
- Followed by 12-15 descriptive words separated by hyphens
- Words should describe the image content and include relevant SEO keywords from the keyword list
- All lowercase, no special characters, hyphens only
- Do NOT include the file extension — just the stem
- Be specific and descriptive about what is actually in the image
- Example: ${filenamePrefix}-red-rock-canyon-overlook-sunset-hiking-trail-${siteConfig.regionName.toLowerCase().replace(/\s+/g, "-")}-national-park-scenic-landscape

ALT TEXT RULES:
- Must be exactly 15-20 words total
- Must be a grammatically correct, natural English sentence or phrase
- Describe what is visually in the image
- Weave in select keywords from the keyword list where they fit naturally
- NO keyword stuffing — readability and accuracy come first
- Do not start with "Image of" or "Photo of" — just describe the scene directly

IMPORTANT OUTPUT FORMAT:
Respond with EXACTLY this format, nothing else:

FILENAME: [the filename stem without extension]
ALT: [the alt text]`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 0.5,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl },
            },
            {
              type: "text",
              text: `Analyze this image and generate an SEO-optimized ${field === "filename" ? "filename" : field === "alt" ? "alt text" : "filename and alt text"} for it.${currentFilename ? ` Current filename: ${currentFilename}` : ""}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const fullText = textBlock.text;
    const result: { filename?: string; altText?: string } = {};

    const filenameMatch = fullText.match(/FILENAME:\s*(.+?)(?:\n|$)/);
    const altMatch = fullText.match(/ALT:\s*(.+?)(?:\n|$)/);

    if (filenameMatch && (field === "filename" || field === "both")) {
      let stem = filenameMatch[1].trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      // Ensure it starts with the site filename prefix
      if (!stem.startsWith(filenamePrefix + "-")) {
        stem = filenamePrefix + "-" + stem;
      }
      result.filename = `${stem}.${ext}`;
    }

    if (altMatch && (field === "alt" || field === "both")) {
      result.altText = altMatch[1].trim();
    }

    return result;
  } catch (error) {
    console.error("Claude AI image meta generation failed:", error);
    return null;
  }
}

/**
 * Generate SEO-optimized meta title and/or meta description using Claude AI.
 *
 * Works for listings, blog posts, directory pages, and blog category pages.
 * Returns null if AI is not configured or the call fails.
 */
export async function generateSeoMeta(input: {
  field: "title" | "description" | "both";
  // Page context
  name: string;
  pageType: "listing" | "blog_post" | "directory" | "blog_category" | "page";
  slug: string;
  description?: string;
  tagline?: string;
  excerpt?: string;
  category?: string;
  city?: string;
  listingType?: string;
  focusKeyphrase?: string;
  currentMetaTitle?: string;
  currentMetaDescription?: string;
}): Promise<{ metaTitle?: string; metaDescription?: string } | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const keywordContext = await buildKeywordContext();

  const { field, name, pageType, slug, description, tagline, excerpt, category, city, listingType, focusKeyphrase, currentMetaTitle, currentMetaDescription } = input;

  const systemPrompt = `You are an expert SEO specialist for ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel directory and news site about ${siteConfig.parkName} and surrounding ${siteConfig.regionName.toLowerCase()}.

Your job is to write meta titles and meta descriptions that maximize click-through rates from Google search results and AI search summaries while accurately representing the page content.

${keywordContext}

META TITLE RULES:
- Target length: 50-60 characters. Absolute maximum 65 characters. Never under 50.
- Front-load the most important keyword/phrase — Google bolds matching terms
- Include the business or article name prominently
- Make it compelling and specific — searchers should know exactly what the page is about
- Do NOT include the site name (it gets appended automatically via the title template in Settings)
- Do NOT use em dashes (the long dash). Prefer colons, pipes, or commas if a separator is needed.
- Avoid generic filler words like "best", "top", "ultimate" unless truly warranted
- NATURAL LANGUAGE TEST: Read the title out loud. If it sounds like an SEO exercise instead of something a human would say, rewrite it. "Commercial Photography in Colorado Springs" passes. "Commercial Photography Services Colorado Springs: Professional Guide" fails.
- NEVER use these AI/SEO filler words in titles: comprehensive, ultimate, definitive, essential, exceptional, unparalleled, premier
- For listings: include the business name and what it is (e.g., "Bit & Spur: Mexican & Southwestern Dining in ${siteConfig.gatewayTowns[0]}")
- For news articles: capture the main topic in a way that answers the searcher's question
- For directory pages: capture the category and location context (e.g., "${siteConfig.parkName} Dining: Restaurants & Cafes Near the Park")
- For news category pages: include the category name and make clear this is a collection of articles
- For static/core pages: clearly describe the purpose of the page (home, contact, etc.) and align with visitor intent

META DESCRIPTION RULES:
- Target length: 140-155 characters. Absolute maximum is 160 characters. Shorter is better than longer.
- CRITICAL: Descriptions over 160 characters will be REJECTED AND TRUNCATED. Aim for 145-155 to be safe.
- Write a compelling summary that gives searchers a reason to click
- Include 1-2 natural keyword phrases from the keyword reference (only if they fit naturally)
- Use active voice and be specific about what the visitor will find on the page
- Include a subtle call-to-action when natural (e.g., "Discover...", "Plan your...", "Find...")
- Do NOT stuff keywords — this is for humans reading search results
- NEVER use banned AI phrases: hidden gem, not to be missed, something for everyone, unforgettable experience, your gateway to adventure, whether you're...or, look no further
- Write like a knowledgeable local giving a quick recommendation, not like a brochure
- For listings: mention what makes the business unique, its location context, and what visitors can expect
- For news articles: summarize the key value the reader will get
- For directory pages: describe the breadth of options available and entice visitors to explore the listings
- For news category pages: describe the topic scope and the kinds of guides readers will find
- For static/core pages: explain what users can do on the page in plain, direct language

FOCUS KEYPHRASE:
${focusKeyphrase ? `The focus keyphrase for this page is: "${focusKeyphrase}"
- The meta title MUST include this keyphrase (or a very close natural variation). Front-load it when possible.
- The meta description MUST include this keyphrase naturally within the first 100 characters if possible.
- Do NOT awkwardly force it — it should read naturally to a human scanning Google results.` : "No focus keyphrase has been set. Use your best judgment based on the content and keyword reference."}

VARIATION REQUIREMENT:
${currentMetaTitle && (field === "title" || field === "both") ? `The current meta title is: "${currentMetaTitle}"\nYou MUST generate a DIFFERENT meta title. Use different wording, different structure, or a different angle. Do NOT return anything similar to this.` : ""}${currentMetaDescription && (field === "description" || field === "both") ? `${currentMetaTitle && field === "both" ? "\n" : ""}The current meta description is: "${currentMetaDescription}"\nYou MUST generate a DIFFERENT meta description. Use different wording, different structure, or a different angle. Do NOT return anything similar to this.` : ""}${!currentMetaTitle && !currentMetaDescription ? "Generate a fresh, compelling option." : ""}

IMPORTANT OUTPUT FORMAT:
Respond with EXACTLY this format, nothing else.

TITLE: [the meta title, 50-60 characters, no site name suffix]
DESCRIPTION: [the meta description, 140-155 characters, NEVER over 160]`;

  // Build user prompt with page context
  const pageTypeLabel =
    pageType === "listing"
      ? "business listing"
      : pageType === "blog_post"
        ? "news article"
        : pageType === "directory"
          ? "directory/category"
          : pageType === "blog_category"
            ? "news category archive"
            : "core/static";
  let userPrompt = `Generate a ${field === "title" ? "meta title" : field === "description" ? "meta description" : "meta title and meta description"} for this ${pageTypeLabel} page:\n\n`;
  userPrompt += `Name/Title: ${name}\n`;

  if (pageType === "directory") {
    userPrompt += `URL: ${siteConfig.siteUrl}/${slug}\n`;
    userPrompt += `Page Type: Directory listing page — this is a category index page that shows all ${name.toLowerCase()} options near ${siteConfig.parkName}.\n`;
    if (description) {
      userPrompt += `Subtitle: ${description}\n`;
    }
  } else if (pageType === "blog_category") {
    userPrompt += `URL: ${siteConfig.siteUrl}${getNewsCategoryPath(slug)}\n`;
    userPrompt += `Page Type: News category archive page — this page groups multiple articles under one topic.\n`;
    if (description) {
      userPrompt += `Category Description: ${description}\n`;
    }
  } else if (pageType === "page") {
    const path = slug ? `/${slug}` : "/";
    userPrompt += `URL: ${siteConfig.siteUrl}${path}\n`;
    userPrompt += `Page Type: Core static page.\n`;
    if (description) {
      userPrompt += `Page Summary: ${description}\n`;
    }
  } else if (pageType === "blog_post") {
    userPrompt += `URL: ${siteConfig.siteUrl}${getNewsArticlePath(slug)}\n`;
  } else {
    userPrompt += `URL: ${siteConfig.siteUrl}/${pageType === "listing" ? `listing/${listingType || "dining"}/${slug}` : slug}\n`;
  }

  if (pageType === "listing") {
    if (listingType) userPrompt += `Listing Type: ${listingType}\n`;
    if (city) userPrompt += `Location: ${city}, UT\n`;
    if (category) userPrompt += `Category: ${category}\n`;
  } else if (pageType === "blog_post") {
    if (category) userPrompt += `News Category: ${category}\n`;
  }

  if (tagline) userPrompt += `\nTagline: ${tagline}\n`;
  if (excerpt) userPrompt += `\nExcerpt: ${excerpt}\n`;

  if (description) {
    // Send first 600 chars of description for context without overwhelming the prompt
    const descClean = description.replace(/<[^>]*>/g, "").trim();
    const descTrunc = descClean.length > 600 ? descClean.slice(0, 600) + "..." : descClean;
    userPrompt += `\nPage Content Summary:\n${descTrunc}\n`;
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 200,
      temperature: currentMetaTitle || currentMetaDescription ? 0.9 : 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const fullText = textBlock.text;
    const result: { metaTitle?: string; metaDescription?: string } = {};

    const titleMatch = fullText.match(/TITLE:\s*(.+?)(?:\n|$)/);
    const descMatch = fullText.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/);

    if (titleMatch && (field === "title" || field === "both")) {
      result.metaTitle = enforceMaxLength(titleMatch[1].trim(), 65);
    }

    if (descMatch && (field === "description" || field === "both")) {
      result.metaDescription = enforceMaxLength(descMatch[1].trim(), 165);
    }

    return result;
  } catch (error) {
    console.error("Claude AI SEO meta generation failed:", error);
    return null;
  }
}

/**
 * Generate listing description and tagline using Claude AI.
 *
 * Returns null if AI is not configured or the call fails.
 * The caller should fall back to template-based generation.
 */
export async function generateListingContent(input: {
  name: string;
  types: string[];
  city: string;
  state: string;
  editorialSummary: string | null;
  reviewSnippets: string[];
  priceLevel: number | null;
  rating: number;
  reviewCount: number;
  serviceSignals?: Record<string, boolean>;
  generativeSummary?: string | null;
}): Promise<{ description: string; tagline: string; suggestedPriceRange: string | null } | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const keywordContext = await buildKeywordContext();

  // Determine business category
  const { name, types, city, state, editorialSummary, reviewSnippets, priceLevel, rating, reviewCount, serviceSignals, generativeSummary } = input;

  const isRestaurant = types.some(t => ["restaurant", "food", "meal_delivery", "meal_takeaway", "cafe", "bakery", "bar"].includes(t));
  const isLodging = types.some(t => ["lodging", "hotel", "campground", "rv_park"].includes(t));
  const isTourism = types.some(t => ["travel_agency", "tourist_attraction", "point_of_interest"].includes(t));
  const isTransport = types.some(t => ["car_rental", "transit_station", "bus_station"].includes(t));

  let businessCategory = "local business";
  if (isRestaurant) businessCategory = "restaurant/dining";
  else if (isLodging) businessCategory = "lodging/accommodation";
  else if (isTourism) businessCategory = "tourism/experience";
  else if (isTransport) businessCategory = "transportation service";

  // Price description
  const priceDesc = priceLevel
    ? ["", "budget-friendly", "moderately priced", "upscale", "premium"][priceLevel] || ""
    : "";

  // Build system prompt
  const systemPrompt = `You are the voice of ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel directory focused on ${siteConfig.parkName} and ${siteConfig.regionName.toLowerCase()}.

IDENTITY:
${siteConfig.aiPersonality}

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

The ONLY exception: if the business has a direct, obvious connection to a specific park or attraction, meaning the park IS the service (e.g., scenic flights over the park, a park shuttle service, a guided hiking company). In those cases the park name is part of what the business does, so it belongs in the tagline naturally.

DESCRIPTION GUIDELINES:
The description is where location context and SEO keywords can live, but always naturally. How prominently you reference ${siteConfig.parkName} depends on the business's location and what it actually does:

GATEWAY TOWNS (${siteConfig.gatewayTowns.join(", ")}, right at the park):
- ${siteConfig.parkName} is the primary draw. These businesses exist because of the park. Weave park context throughout naturally.

NEARBY TOWNS (${siteConfig.nearbyTowns.join(", ")}):
- Lead with what the business actually offers. Mention ${siteConfig.parkName} as part of the travel context.
- If the business is tied to a different attraction, lead with that authentic identity.

REGIONAL TOWNS (${siteConfig.regionalTowns.join(", ")}):
- Lead with the business's own identity and what makes it great in its own right.
- Mention ${siteConfig.parkName} where it fits naturally, typically in the location/travel context paragraph, not the opening.
- If the business operates at a different park, that's the authentic connection. Use it.

GENERAL RULES:
- Always mention ${siteConfig.parkName} at least once somewhere in the description (this IS a ${siteConfig.parkName} travel directory), but it can be brief context rather than the central theme.
- Use common sense: if the business has nothing to do with any park, don't build the description around parks. Write about the business.
- When a business serves multiple parks or areas, lead with whatever is most authentic, and weave in regional connections naturally.
- Readability and authenticity always beat keyword density. Travelers trust descriptions that sound like they were written by someone who understands the business, not by an SEO robot.

${keywordContext}

STRICT BANS:
- NEVER mention star ratings, review scores, or numerical ratings (e.g., "4.8 stars", "highly rated"). The rating is displayed elsewhere on the page; restating it adds zero value and will become stale.
- NEVER use em dashes (—). Use commas, periods, semicolons, colons, or parentheses instead.

IMPORTANT OUTPUT FORMAT:
You must respond with EXACTLY this format, nothing else:

TAGLINE: [A single concise sentence under 160 characters focused entirely on what this business offers. No location keywords unless the location IS the service. See TAGLINE RULES above.]

PRICE_ESTIMATE: [Estimate the price range as exactly one of: $, $$, $$$, or $$$$ based on all available context (business name, type, location, reviews, editorial summary). Use these guidelines:
- $ = Budget/value (fast food, basic campgrounds, budget motels, food trucks)
- $$ = Moderate (casual dining, standard hotels/motels, basic tours, mid-range)
- $$$ = Upscale (fine dining, boutique hotels, premium tours/experiences, resorts)
- $$$$ = Premium/luxury (high-end resorts, luxury experiences, exclusive dining)
If you truly cannot determine the price range from any context clue, respond with UNKNOWN. But try your best; the business name, type, and reviews almost always contain enough signal.]

DESCRIPTION:
[3-5 paragraphs totaling 200-300 words. Cover what the business is, what makes it worth visiting, and how it fits into a ${siteConfig.regionName.toLowerCase()} trip. Let the content dictate the structure rather than following a rigid template. Some descriptions might lead with the vibe, others with the food, others with the location. Vary your approach based on what's most interesting about each business.

Do NOT follow the same paragraph formula every time. Do NOT include any headers, labels, bullet points, or markdown formatting. Just plain flowing prose paragraphs separated by blank lines.]`;

  // Build user prompt with all available data
  let userPrompt = `Write a listing description and tagline for the following business:\n\n`;
  userPrompt += `Business Name: ${name}\n`;
  userPrompt += `Category: ${businessCategory}\n`;
  userPrompt += `Location: ${city || siteConfig.regionName}${state ? `, ${state}` : ""}\n`;
  userPrompt += `Google Place Types: ${types.join(", ")}\n`;

  // NOTE: We intentionally do NOT pass star ratings to the AI.
  // Ratings are displayed elsewhere on the page and would go stale in static descriptions.

  if (priceDesc) {
    userPrompt += `Price Level: ${priceDesc}\n`;
  }

  if (editorialSummary) {
    userPrompt += `\nGoogle's Editorial Summary: "${editorialSummary}"\n`;
  }

  if (generativeSummary) {
    userPrompt += `\nGoogle's AI Summary: "${generativeSummary}"\n`;
  }

  // Add service signals as structured attributes for richer descriptions
  if (serviceSignals && Object.keys(serviceSignals).length > 0) {
    userPrompt += `\nBusiness Attributes (from Google):\n`;
    const serves: string[] = [];
    const offers: string[] = [];
    const goodFor: string[] = [];
    const accessibility: string[] = [];
    const parking: string[] = [];

    if (serviceSignals.servesBreakfast) serves.push("breakfast");
    if (serviceSignals.servesLunch) serves.push("lunch");
    if (serviceSignals.servesDinner) serves.push("dinner");
    if (serviceSignals.servesBrunch) serves.push("brunch");
    if (serviceSignals.servesBeer) serves.push("beer");
    if (serviceSignals.servesWine) serves.push("wine");
    if (serviceSignals.servesCocktails) serves.push("cocktails");
    if (serviceSignals.servesCoffee) serves.push("coffee");
    if (serviceSignals.servesDessert) serves.push("dessert");
    if (serviceSignals.servesVegetarianFood) serves.push("vegetarian food");

    if (serviceSignals.outdoorSeating) offers.push("outdoor seating");
    if (serviceSignals.dineIn) offers.push("dine-in");
    if (serviceSignals.takeout) offers.push("takeout");
    if (serviceSignals.delivery) offers.push("delivery");
    if (serviceSignals.curbsidePickup) offers.push("curbside pickup");
    if (serviceSignals.reservable) offers.push("reservations");
    if (serviceSignals.liveMusic) offers.push("live music");

    if (serviceSignals.goodForChildren) goodFor.push("families");
    if (serviceSignals.goodForGroups) goodFor.push("groups");
    if (serviceSignals.allowsDogs) goodFor.push("dog owners");
    if (serviceSignals.goodForWatchingSports) goodFor.push("watching sports");

    if (serviceSignals.accessibility_wheelchairAccessibleEntrance) accessibility.push("wheelchair accessible entrance");
    if (serviceSignals.accessibility_wheelchairAccessibleSeating) accessibility.push("wheelchair accessible seating");
    if (serviceSignals.accessibility_wheelchairAccessibleRestroom) accessibility.push("wheelchair accessible restroom");

    if (serviceSignals.parking_freeParkingLot) parking.push("free parking lot");
    if (serviceSignals.parking_freeStreetParking) parking.push("free street parking");
    if (serviceSignals.parking_paidParkingLot) parking.push("paid parking");
    if (serviceSignals.parking_valetParking) parking.push("valet parking");

    if (serves.length > 0) userPrompt += `- Serves: ${serves.join(", ")}\n`;
    if (offers.length > 0) userPrompt += `- Offers: ${offers.join(", ")}\n`;
    if (goodFor.length > 0) userPrompt += `- Good for: ${goodFor.join(", ")}\n`;
    if (accessibility.length > 0) userPrompt += `- Accessibility: ${accessibility.join(", ")}\n`;
    if (parking.length > 0) userPrompt += `- Parking: ${parking.join(", ")}\n`;
  }

  if (reviewSnippets.length > 0) {
    userPrompt += `\nRecent Review Excerpts:\n`;
    reviewSnippets.slice(0, 5).forEach((snippet, i) => {
      // Truncate long snippets
      const trimmed = snippet.length > 300 ? snippet.slice(0, 300) + "..." : snippet;
      userPrompt += `${i + 1}. "${trimmed}"\n`;
    });
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const fullText = textBlock.text;

    // Parse tagline, price estimate, and description from the structured response
    const taglineMatch = fullText.match(/TAGLINE:\s*(.+?)(?:\n|$)/);
    const priceEstimateMatch = fullText.match(/PRICE_ESTIMATE:\s*(.+?)(?:\n|$)/);
    const descriptionMatch = fullText.match(/DESCRIPTION:\s*\n([\s\S]+)/);

    const tagline = taglineMatch ? taglineMatch[1].trim() : null;
    const description = descriptionMatch ? descriptionMatch[1].trim() : null;

    // Parse price estimate — only accept valid values
    let suggestedPriceRange: string | null = null;
    if (priceEstimateMatch) {
      const raw = priceEstimateMatch[1].trim();
      if (["$", "$$", "$$$", "$$$$"].includes(raw)) {
        suggestedPriceRange = raw;
      }
    }

    if (!description) {
      console.error("AI response did not contain a valid description");
      return null;
    }

    return {
      description,
      tagline: tagline || `${name}: a top choice for visitors to the ${siteConfig.parkName} area.`,
      suggestedPriceRange,
    };
  } catch (error) {
    console.error("Claude AI content generation failed:", error);
    return null;
  }
}

/**
 * Generate enriched hiking trail description and tagline using Claude AI.
 *
 * This is the hiking-specific version of generateListingContent() that:
 * - Targets 500-750 words (vs 200-300 for standard listings)
 * - Incorporates NPS trail data, OSM metrics, and RIDB permit info
 * - Uses hiking-specific system prompt additions
 *
 * Returns null if AI is not configured or the call fails.
 * The caller should fall back to generateListingContent() or templates.
 */
export async function generateHikingContent(input: {
  // Google data
  name: string;
  types: string[];
  city: string;
  state: string;
  editorialSummary: string | null;
  reviewSnippets: string[];
  rating: number;
  reviewCount: number;
  generativeSummary?: string | null;
  serviceSignals?: Record<string, boolean>;
  // NPS data
  npsDescription?: string | null;
  npsDuration?: string | null;
  npsSeason?: string[] | null;
  npsAlerts?: { title: string; description: string; category: string }[];
  npsPetsPermitted?: string | null;
  npsFeesApply?: boolean | null;
  npsAccessibility?: string | null;
  // OSM data
  osmDistanceMiles?: number | null;
  osmDifficulty?: string | null;
  osmSurface?: string | null;
  osmTrailType?: string | null;
  // RIDB data
  permitRequired?: boolean;
  permitDescription?: string | null;
  permitFee?: string | null;
  // BLM data
  blmDistanceMiles?: number | null;
  blmSurface?: string | null;
  blmTransportMode?: string | null;
  // USFS data
  usfsTrailClass?: string | null;
  usfsTypicalGrade?: number | null;
  usfsAccessibility?: string | null;
  usfsDesignation?: string | null;
  // USGS data
  usgsElevationGainFt?: number | null;
  usgsTrailheadElevationFt?: number | null;
  // Wikidata + Wikipedia data
  wikidataDescription?: string | null;
  wikidataManagingAgency?: string | null;
  wikipediaExtract?: string | null;
  // Enhanced OSM data
  osmDogPolicy?: string | null;
  osmDrinkingWater?: string | null;
  osmAccess?: string | null;
}): Promise<{ description: string; tagline: string; suggestedPriceRange: string | null } | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const keywordContext = await buildKeywordContext();

  const {
    name, types, city, state, editorialSummary, reviewSnippets, rating, reviewCount,
    generativeSummary, npsDescription, npsDuration, npsSeason, npsAlerts,
    npsPetsPermitted, npsFeesApply, npsAccessibility,
    osmDistanceMiles, osmDifficulty, osmSurface, osmTrailType,
    permitRequired, permitDescription, permitFee,
    blmDistanceMiles, blmSurface, blmTransportMode,
    usfsTrailClass, usfsTypicalGrade, usfsAccessibility, usfsDesignation,
    usgsElevationGainFt, usgsTrailheadElevationFt,
    wikidataDescription, wikidataManagingAgency, wikipediaExtract,
    osmDogPolicy, osmDrinkingWater, osmAccess,
  } = input;

  // Build system prompt — same voice foundation as standard listings + hiking-specific additions
  const systemPrompt = `You are the voice of ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel directory focused on ${siteConfig.parkName} and ${siteConfig.aiLocale}.

IDENTITY:
${siteConfig.aiPersonality} You've actually hiked these trails. You're telling a friend what to expect, what to bring, and why it's worth the effort.

Think Bourdain's curiosity meets Wirecutter's usefulness meets REI trail guides' practicality. You care about the experience AND the logistics. 80% warmth, 20% personality edge.

VOICE MODES (vary naturally across paragraphs):
- Insider Guide (50% of content): practical info, specific tips, what to actually expect. "The chains section isn't optional if you want the summit." "Start before 7 AM in summer or you'll bake on the switchbacks."
- Storyteller (30%): quick sensory details, what it feels like to be there. "The canyon walls narrow until you can touch both sides." "The final ridge walk feels like the edge of the world."
- Friendly Local (20%): warm recommendations, practical context, honest but always positive framing. "Tough climb, but every person up there agrees it was worth it."

SIGNATURE DEVICES:
- Parenthetical asides for insider tips (the kind of thing a local would lean over and tell you)
- Short declarative sentences mixed with medium ones. Vary your rhythm constantly.
- Fragment sentences when they add punch. "Permit required." "No dogs." "Worth every step."
- Contractions always. "It's" not "It is." "You'll" not "You will." "Don't" not "Do not."
- Have real opinions. "The last half-mile is the most exhilarating trail section in the park" beats "hikers frequently enjoy the scenic views."
- Be specific and concrete. "1,488 feet of elevation gain over 2.4 miles" beats "a challenging uphill hike."
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
- Don't use the "[Trail] is a [type] that..." opening formula
- Don't end with generic CTA sentences ("Whether you're... or..., [Trail] has something for everyone")
- Don't use "From X to Y" as an opening construction
- Don't stack multiple adjectives before a noun ("the stunning, breathtaking, awe-inspiring canyon views")
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
- ALWAYS write positively. You're a trail guide, not a fear-monger. Mention real hazards matter-of-factly without sensationalizing.
- Frame difficulty honestly but encouragingly. "Challenging" is good. "Dangerous death trap" is not.
- If there are real safety concerns (chains, exposure, flash floods), mention them as practical info, not as warnings designed to scare people away.
- Let the facts speak: mention elevation gain, exposure, permit requirements. Readers can judge their own fitness.

E-E-A-T COMPLIANCE:
- Draw from the NPS descriptions, trail data, Google reviews, and permit info as your source material. These are your facts.
- Be specific: numbers, distances, times, seasons. "4.4 miles round trip with 1,488 feet of gain" beats "a moderate-to-strenuous hike."
- No invented statistics, rankings, or claims.
- Write people-first content, not search-engine-first content.

HIKING DESCRIPTION STRUCTURE (flexible, not rigid):
Write 500-750 words across 5-8 paragraphs. Cover these themes in whatever order feels most natural for THIS specific trail:

1. THE HOOK: What makes this trail special? What's the payoff? Lead with the "why" someone would choose this over other hikes.
2. THE EXPERIENCE: What does the hike actually feel like? Terrain changes, scenery, notable sections, the "wow" moments.
3. THE LOGISTICS: Distance, elevation gain, estimated time, difficulty level. Best time of day, best season. Water availability, shade.
4. ACCESS & PERMITS: Do you need a permit? How to get one? Fees? Trailhead parking situation? Shuttle info?
5. PRACTICAL TIPS: What to bring, what to wear, water needs. Pet policy. Kid-friendliness.
6. CONTEXT: How this trail fits into a broader ${siteConfig.parkName}/${siteConfig.aiLocale} trip. Nearby alternatives for different fitness levels.

You don't have to cover all six themes. Skip what's not relevant. Don't pad. If there isn't much to say about permits (because none are needed), don't write a paragraph about it.

TAGLINE RULES:
The tagline must capture the trail's essence in one punchy sentence under 160 characters. Focus on the experience or the defining feature.
Good: "An iconic knife-edge ridge walk with 1,500 feet of exposure and views that justify every white-knuckle step"
Good: "A gentle riverside walk through the Virgin River narrows that even kids can handle"
Bad: "A great hiking trail in the national park for outdoor enthusiasts" (generic, says nothing)

${keywordContext}

STRICT BANS:
- NEVER mention star ratings, review scores, or numerical ratings.
- NEVER use em dashes (—). Use commas, periods, semicolons, colons, or parentheses instead.

IMPORTANT OUTPUT FORMAT:
You must respond with EXACTLY this format, nothing else:

TAGLINE: [A single concise sentence under 160 characters capturing this trail's defining experience or feature.]

PRICE_ESTIMATE: [For hiking trails, this is usually "Free" unless permits cost money. If permits have fees, use "$". Use UNKNOWN only if genuinely unclear.]

DESCRIPTION:
[5-8 paragraphs totaling 500-750 words. Cover the trail experience, logistics, access, and practical tips. Let the content dictate the structure. Do NOT include any headers, labels, bullet points, or markdown formatting. Just plain flowing prose paragraphs separated by blank lines.]`;

  // Build user prompt with all available data
  let userPrompt = `Write a hiking trail description and tagline for:\n\n`;
  userPrompt += `Trail Name: ${name}\n`;
  userPrompt += `Location: ${city || siteConfig.regionName}, ${state || siteConfig.stateAbbrev}\n`;
  userPrompt += `Google Place Types: ${types.join(", ")}\n`;

  // NPS data (richest source)
  if (npsDescription) {
    userPrompt += `\n--- NPS (National Park Service) Data ---\n`;
    userPrompt += `NPS Description: ${npsDescription}\n`;
    if (npsDuration) userPrompt += `Duration: ${npsDuration}\n`;
    if (npsSeason && npsSeason.length > 0) userPrompt += `Best Seasons: ${npsSeason.join(", ")}\n`;
    if (npsPetsPermitted) userPrompt += `Pets: ${npsPetsPermitted}\n`;
    if (npsFeesApply !== null && npsFeesApply !== undefined) {
      userPrompt += `Fees Apply: ${npsFeesApply ? "Yes" : "No"}\n`;
    }
    if (npsAccessibility) userPrompt += `Accessibility: ${npsAccessibility}\n`;
  }

  // NPS alerts
  if (npsAlerts && npsAlerts.length > 0) {
    userPrompt += `\n--- Current Park Alerts ---\n`;
    for (const alert of npsAlerts.slice(0, 5)) {
      userPrompt += `- [${alert.category}] ${alert.title}: ${alert.description.slice(0, 200)}\n`;
    }
    userPrompt += `(Incorporate relevant alerts naturally as practical info, not as scary warnings.)\n`;
  }

  // OSM trail metrics
  if (osmDistanceMiles || osmDifficulty || osmSurface) {
    userPrompt += `\n--- Trail Metrics (OpenStreetMap) ---\n`;
    if (osmDistanceMiles) userPrompt += `Distance: ${osmDistanceMiles} miles\n`;
    if (osmDifficulty) userPrompt += `Difficulty: ${osmDifficulty}\n`;
    if (osmSurface) userPrompt += `Surface: ${osmSurface}\n`;
    if (osmTrailType) {
      const typeLabel = osmTrailType === "loop" ? "Loop" : osmTrailType === "out_and_back" ? "Out and back" : "Point to point";
      userPrompt += `Trail Type: ${typeLabel}\n`;
    }
  }

  // RIDB permit info
  if (permitRequired || permitDescription) {
    userPrompt += `\n--- Permit Info (Recreation.gov) ---\n`;
    userPrompt += `Permit Required: ${permitRequired ? "Yes" : "No/Unknown"}\n`;
    if (permitDescription) userPrompt += `Details: ${permitDescription}\n`;
    if (permitFee) userPrompt += `Fee: ${permitFee}\n`;
  }

  // BLM trail data (for trails on Bureau of Land Management land)
  if (blmDistanceMiles || blmSurface || blmTransportMode) {
    userPrompt += `\n--- BLM (Bureau of Land Management) Data ---\n`;
    if (blmDistanceMiles) userPrompt += `Distance: ${blmDistanceMiles} miles\n`;
    if (blmSurface) userPrompt += `Surface: ${blmSurface}\n`;
    if (blmTransportMode) userPrompt += `Transport Mode: ${blmTransportMode}\n`;
    userPrompt += `(This trail is on BLM-managed land, not within a national park.)\n`;
  }

  // USFS trail data (for trails on National Forest land)
  if (usfsTrailClass || usfsTypicalGrade || usfsAccessibility || usfsDesignation) {
    userPrompt += `\n--- USFS (US Forest Service) Data ---\n`;
    if (usfsTrailClass) userPrompt += `Trail Class: ${usfsTrailClass}\n`;
    if (usfsTypicalGrade) userPrompt += `Typical Grade: ${usfsTypicalGrade}%\n`;
    if (usfsAccessibility) userPrompt += `Accessibility: ${usfsAccessibility}\n`;
    if (usfsDesignation) userPrompt += `National Trail Designation: ${usfsDesignation}\n`;
    userPrompt += `(This trail is on National Forest land.)\n`;
  }

  // USGS elevation data
  if (usgsElevationGainFt || usgsTrailheadElevationFt) {
    userPrompt += `\n--- USGS (Elevation Data) ---\n`;
    if (usgsTrailheadElevationFt) userPrompt += `Trailhead Elevation: ${usgsTrailheadElevationFt} ft\n`;
    if (usgsElevationGainFt) userPrompt += `Estimated Elevation Gain: ${usgsElevationGainFt} ft\n`;
  }

  // Wikidata + Wikipedia enrichment
  if (wikidataDescription || wikidataManagingAgency || wikipediaExtract) {
    userPrompt += `\n--- Wikidata / Wikipedia ---\n`;
    if (wikidataDescription) userPrompt += `Description: ${wikidataDescription}\n`;
    if (wikidataManagingAgency) userPrompt += `Managing Agency: ${wikidataManagingAgency}\n`;
    if (wikipediaExtract) userPrompt += `Wikipedia Article Extract:\n${wikipediaExtract}\n`;
  }

  // Enhanced OSM tags
  if (osmDogPolicy || osmDrinkingWater || osmAccess) {
    userPrompt += `\n--- Additional Trail Info (OpenStreetMap) ---\n`;
    if (osmDogPolicy) userPrompt += `Dog Policy: ${osmDogPolicy}\n`;
    if (osmDrinkingWater) userPrompt += `Drinking Water Available: ${osmDrinkingWater}\n`;
    if (osmAccess) userPrompt += `Trail Access: ${osmAccess}\n`;
  }

  // Google data
  if (editorialSummary) {
    userPrompt += `\nGoogle Editorial Summary: "${editorialSummary}"\n`;
  }

  if (generativeSummary) {
    userPrompt += `\nGoogle AI Summary: "${generativeSummary}"\n`;
  }

  if (reviewSnippets.length > 0) {
    userPrompt += `\nGoogle Review Excerpts:\n`;
    reviewSnippets.slice(0, 8).forEach((snippet, i) => {
      const trimmed = snippet.length > 300 ? snippet.slice(0, 300) + "..." : snippet;
      userPrompt += `${i + 1}. "${trimmed}"\n`;
    });
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const fullText = textBlock.text;

    // Parse tagline, price estimate, and description
    const taglineMatch = fullText.match(/TAGLINE:\s*(.+?)(?:\n|$)/);
    const priceEstimateMatch = fullText.match(/PRICE_ESTIMATE:\s*(.+?)(?:\n|$)/);
    const descriptionMatch = fullText.match(/DESCRIPTION:\s*\n([\s\S]+)/);

    const tagline = taglineMatch ? taglineMatch[1].trim() : null;
    const description = descriptionMatch ? descriptionMatch[1].trim() : null;

    // Parse price estimate
    let suggestedPriceRange: string | null = null;
    if (priceEstimateMatch) {
      const raw = priceEstimateMatch[1].trim();
      if (["$", "$$", "$$$", "$$$$"].includes(raw)) {
        suggestedPriceRange = raw;
      } else if (raw.toLowerCase() === "free") {
        suggestedPriceRange = "Free";
      }
    }

    if (!description) {
      console.error("Hiking AI response did not contain a valid description");
      return null;
    }

    // Log word count for verification
    const wordCount = description.split(/\s+/).length;
    console.log(`Hiking AI generated ${wordCount} words for "${name}"`);

    return {
      description,
      tagline: tagline || `${name}: a standout trail in ${siteConfig.aiLocale}.`,
      suggestedPriceRange,
    };
  } catch (error) {
    console.error("Claude AI hiking content generation failed:", error);
    return null;
  }
}

// ── AI Trail Attribute Inference ──
// Uses Claude to infer structured trail attributes from Google reviews,
// editorial summaries, and any available API data. This fills the gaps
// when structured APIs (NPS, OSM, BLM, RIDB) don't return fields like
// difficulty, dogs_allowed, estimated_time, season, kid-friendly, etc.

export interface InferredTrailAttributes {
  difficulty?: "easy" | "moderate" | "hard" | "expert";
  estimatedTime?: string;
  elevationGainFt?: number;
  trailType?: "out_and_back" | "loop" | "point_to_point";
  seasonStart?: string;  // month name e.g. "March"
  seasonEnd?: string;    // month name e.g. "November"
  dogsAllowed?: boolean;
  kidFriendly?: boolean;
  waterAvailable?: boolean;
  shadeLevel?: "Full Sun" | "Partial Shade" | "Mostly Shaded" | "Full Shade";
  permitRequired?: boolean;
  confidence: Record<string, "high" | "medium" | "low">;
}

/**
 * Use Claude to infer trail attributes from Google reviews, summaries,
 * and any available API data. Returns structured JSON with confidence levels.
 *
 * This is a lightweight, fast call using claude-haiku for speed/cost,
 * since we only need structured data extraction, not creative writing.
 */
export async function inferTrailAttributes(input: {
  trailName: string;
  city: string;
  state: string;
  reviewSnippets: string[];
  editorialSummary?: string | null;
  generativeSummary?: string | null;
  // Already-known data (from APIs) — AI should NOT override these
  knownDistance?: number | null;
  knownDifficulty?: string | null;
  knownSurface?: string | null;
  knownTrailType?: string | null;
  knownEstimatedTime?: string | null;
  knownSeason?: string[] | null;
  knownPetsPermitted?: string | null;
  knownPermitRequired?: boolean | null;
  knownElevationGain?: number | null;
}): Promise<InferredTrailAttributes | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const {
    trailName, city, state, reviewSnippets,
    editorialSummary, generativeSummary,
    knownDistance, knownDifficulty, knownSurface, knownTrailType,
    knownEstimatedTime, knownSeason, knownPetsPermitted,
    knownPermitRequired, knownElevationGain,
  } = input;

  // Build context of what we already know
  const knownFields: string[] = [];
  if (knownDistance) knownFields.push(`Distance: ${knownDistance} miles`);
  if (knownDifficulty) knownFields.push(`Difficulty: ${knownDifficulty}`);
  if (knownSurface) knownFields.push(`Surface: ${knownSurface}`);
  if (knownTrailType) knownFields.push(`Trail Type: ${knownTrailType}`);
  if (knownEstimatedTime) knownFields.push(`Estimated Time: ${knownEstimatedTime}`);
  if (knownSeason && knownSeason.length > 0) knownFields.push(`Season: ${knownSeason.join(", ")}`);
  if (knownPetsPermitted) knownFields.push(`Pets: ${knownPetsPermitted}`);
  if (knownPermitRequired !== null && knownPermitRequired !== undefined) knownFields.push(`Permit Required: ${knownPermitRequired ? "Yes" : "No"}`);
  if (knownElevationGain) knownFields.push(`Elevation Gain: ${knownElevationGain} ft`);

  // Build review context
  const reviewText = reviewSnippets.length > 0
    ? reviewSnippets.slice(0, 8).map((r, i) => `Review ${i + 1}: "${r.length > 400 ? r.slice(0, 400) + "..." : r}"`).join("\n")
    : "No reviews available.";

  const systemPrompt = `You are a trail data extraction system. Given a trail name, location, Google reviews, and summaries, infer structured trail attributes.

RULES:
- Only infer attributes you have reasonable evidence for. Do NOT guess randomly.
- For each attribute you infer, provide a confidence level: "high" (directly stated in reviews/summaries), "medium" (strongly implied by multiple clues), or "low" (reasonable inference from context).
- Do NOT infer attributes that are already known (listed under "Already Known Data") unless the known value is clearly wrong.
- For difficulty: consider distance, elevation mentions, review language ("easy stroll" vs "scrambling" vs "grueling"), and trail characteristics.
- For dogs: look for mentions of dogs, pets, leashes, "no dogs", "dog friendly", pet policy signs, etc. For BLM land trails, dogs are generally allowed on leash unless restricted.
- For kids: look for mentions of families, children, strollers, "family friendly", "kid-friendly", or age-related comments.
- For water: look for mentions of "bring water", "no water", "water source", "spring", "creek".
- For shade: look for mentions of sun exposure, shade, "no shade", "full sun", "shaded canyon".
- For season: consider location (${siteConfig.aiLocale} climate), elevation, and review mentions of best times to visit.
- For estimated time: if distance is known, use standard hiking pace (2-3 mph for moderate terrain) as a baseline, adjusted by difficulty and elevation.
- For elevation gain: look for specific numbers in reviews or summaries.
- For trail type: look for mentions of "loop", "out and back", "one way", or circular routes.
- For permits: look for mentions of permits, reservations, fees, or "no permit needed".

RESPONSE FORMAT: Respond with valid JSON only. No markdown, no explanation.
{
  "difficulty": "easy" | "moderate" | "hard" | "expert" | null,
  "estimatedTime": "string description like '2-3 hours'" | null,
  "elevationGainFt": number | null,
  "trailType": "out_and_back" | "loop" | "point_to_point" | null,
  "seasonStart": "month name" | null,
  "seasonEnd": "month name" | null,
  "dogsAllowed": true | false | null,
  "kidFriendly": true | false | null,
  "waterAvailable": true | false | null,
  "shadeLevel": "Full Sun" | "Partial Shade" | "Mostly Shaded" | "Full Shade" | null,
  "permitRequired": true | false | null,
  "confidence": { "fieldName": "high" | "medium" | "low" }
}

Only include fields in "confidence" for attributes you actually inferred (non-null values).`;

  let userPrompt = `Trail: ${trailName}\n`;
  userPrompt += `Location: ${city || siteConfig.regionName}, ${state || siteConfig.stateAbbrev}\n\n`;

  if (knownFields.length > 0) {
    userPrompt += `Already Known Data (do NOT override these unless clearly wrong):\n${knownFields.join("\n")}\n\n`;
  }

  userPrompt += `Fields still needed: `;
  const needed: string[] = [];
  if (!knownDifficulty) needed.push("difficulty");
  if (!knownEstimatedTime) needed.push("estimatedTime");
  if (!knownElevationGain) needed.push("elevationGainFt");
  if (!knownTrailType) needed.push("trailType");
  if (!knownSeason || knownSeason.length === 0) needed.push("seasonStart, seasonEnd");
  if (!knownPetsPermitted) needed.push("dogsAllowed");
  if (knownPermitRequired === null || knownPermitRequired === undefined) needed.push("permitRequired");
  needed.push("kidFriendly", "waterAvailable", "shadeLevel"); // always try to infer these
  userPrompt += needed.join(", ") + "\n\n";

  if (editorialSummary) {
    userPrompt += `Google Editorial Summary: "${editorialSummary}"\n\n`;
  }
  if (generativeSummary) {
    userPrompt += `Google AI Summary: "${generativeSummary}"\n\n`;
  }

  userPrompt += `Google Reviews:\n${reviewText}\n`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    // Parse JSON response, stripping any markdown fences
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonText);

    // Build result, only including non-null inferred values
    const result: InferredTrailAttributes = {
      confidence: parsed.confidence || {},
    };

    if (parsed.difficulty && !knownDifficulty) result.difficulty = parsed.difficulty;
    if (parsed.estimatedTime && !knownEstimatedTime) result.estimatedTime = parsed.estimatedTime;
    if (parsed.elevationGainFt && !knownElevationGain) result.elevationGainFt = parsed.elevationGainFt;
    if (parsed.trailType && !knownTrailType) result.trailType = parsed.trailType;
    if (parsed.seasonStart && (!knownSeason || knownSeason.length === 0)) result.seasonStart = parsed.seasonStart;
    if (parsed.seasonEnd && (!knownSeason || knownSeason.length === 0)) result.seasonEnd = parsed.seasonEnd;
    if (parsed.dogsAllowed !== null && parsed.dogsAllowed !== undefined && !knownPetsPermitted) result.dogsAllowed = parsed.dogsAllowed;
    if (parsed.kidFriendly !== null && parsed.kidFriendly !== undefined) result.kidFriendly = parsed.kidFriendly;
    if (parsed.waterAvailable !== null && parsed.waterAvailable !== undefined) result.waterAvailable = parsed.waterAvailable;
    if (parsed.shadeLevel) result.shadeLevel = parsed.shadeLevel;
    if (parsed.permitRequired !== null && parsed.permitRequired !== undefined && (knownPermitRequired === null || knownPermitRequired === undefined)) {
      result.permitRequired = parsed.permitRequired;
    }

    const inferredCount = Object.keys(result).filter(k => k !== "confidence" && result[k as keyof InferredTrailAttributes] !== undefined).length;
    console.log(`AI trail inference for "${trailName}": inferred ${inferredCount} attributes (${Object.entries(result.confidence).map(([k, v]) => `${k}=${v}`).join(", ")})`);

    return inferredCount > 0 ? result : null;
  } catch (error) {
    console.error("AI trail attribute inference failed:", error);
    return null;
  }
}

/**
 * Improve content readability using Claude AI.
 *
 * Takes the current HTML body and a list of detected readability issues,
 * then rewrites the content to fix those issues while preserving:
 * - HTML structure (tags, links, images, headings)
 * - SEO keywords and meaning
 * - The author's voice and intent
 *
 * Returns null if AI is not configured or the call fails.
 */
export async function improveReadability(input: {
  bodyHtml: string;
  contentType: "blog_post" | "listing" | "page";
  issues: Array<{ id: string; label: string; detail: string }>;
  fixCategory?: "structure" | "sentence" | "clarity";
}): Promise<{ improvedHtml: string } | null> {
  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const { bodyHtml, contentType, issues, fixCategory } = input;

  const pageTypeLabel =
    contentType === "blog_post" ? "news article" : contentType === "listing" ? "business listing" : "web page";

  // Build a focused list of what to fix
  const issueList = issues
    .map((issue) => `- ${issue.label}: ${issue.detail}`)
    .join("\n");

  // All content types now use the TipTap rich text editor — output should be HTML.
  const isPlainText = false;

  const plainTextRules = `RULES — YOU MUST FOLLOW ALL OF THESE:
1. Output PLAIN TEXT only. Do NOT add any HTML tags whatsoever — no <h2>, <p>, <ul>, <li>, <strong>, <a>, or any other tags. The output goes into a plain text field.
2. Use blank lines (two newlines) to separate paragraphs. Do NOT use HTML paragraph tags.
3. Do NOT add headings, subheadings, bullet points, or any structural formatting. Keep it as flowing prose paragraphs.
4. PRESERVE the core meaning, facts, and information. Do not invent new claims or remove important details.
5. PRESERVE SEO keywords that appear naturally in the text. Do not remove them.
6. When splitting long sentences, keep both parts meaningful and grammatically correct.
7. When simplifying vocabulary, maintain a professional but accessible tone.
8. Convert passive voice to active voice where flagged, but only when it improves clarity.
9. Add transition words between ideas where the flow is choppy.
10. Do NOT wrap your response in code fences or add any explanation. Return ONLY the improved plain text.
11. Do NOT add content that wasn't there. Do NOT significantly lengthen the text.
12. Keep the same general length — you are editing, not expanding.`;

  const richTextRules = `RULES — YOU MUST FOLLOW ALL OF THESE:
1. PRESERVE all HTML tags, structure, links (<a>), images (<img>), headings, lists, and formatting exactly. Do not add or remove HTML tags unless splitting a paragraph or sentence.
2. PRESERVE the core meaning, facts, and information. Do not invent new claims or remove important details.
3. PRESERVE SEO keywords that appear naturally in the text. Do not remove them.
4. When splitting long sentences, keep both parts meaningful and grammatically correct.
5. When simplifying vocabulary, maintain a professional but accessible tone.
6. Convert passive voice to active voice where flagged, but only when it improves clarity.
7. Add transition words between ideas where the flow is choppy.
8. Break up overly long paragraphs by splitting at logical topic shifts — add </p><p> tags.
9. Do NOT add markdown formatting. Output pure HTML only.
10. Do NOT wrap your response in code fences or add any explanation. Return ONLY the improved HTML.
11. Do NOT add content that wasn't there. Do NOT significantly lengthen the text.
12. Keep the same general length — you are editing, not expanding.`;

  // When fixing a specific category, add strong constraints to prevent
  // the AI from touching things outside its scope. This is the key to
  // cascading fixes: structure → sentences → clarity without undoing previous work.
  let focusConstraint = "";
  if (fixCategory === "structure") {
    focusConstraint = `
FOCUS: You are ONLY fixing STRUCTURE issues (paragraph length, subheading distribution, scannability).
- You MAY split long paragraphs, add H3 subheadings, add bullet lists, and add bold formatting. Use ONLY <h3> tags for subheadings — never <h2> (the page layout already uses H2 for section titles).
- Do NOT change any wording, vocabulary, or word choices.
- Do NOT split or merge sentences.
- Do NOT convert passive voice to active voice.
- Do NOT add transition words.
- ONLY restructure the content layout. Leave every sentence exactly as written.`;
  } else if (fixCategory === "sentence") {
    focusConstraint = `
FOCUS: You are ONLY fixing SENTENCE issues (sentence length, sentence variety, consecutive sentence starts).
- You MAY split long sentences into shorter ones, vary sentence openings, and restructure sentence flow.
- Do NOT change paragraph boundaries, headings, or any structural formatting.
- Do NOT change word choices or vocabulary.
- Do NOT convert passive voice to active voice.
- Do NOT add transition words.
- ONLY modify sentences. Leave paragraph structure and word-level content exactly as-is.`;
  } else if (fixCategory === "clarity") {
    focusConstraint = `
FOCUS: You are fixing CLARITY issues (reading ease, transition words, passive voice, word complexity, inclusive language).
- You MAY swap complex words for simpler everyday alternatives, convert passive voice to active voice, add transition words, and replace non-inclusive terms.
- You MAY ALSO split long sentences into two shorter ones when it significantly improves reading ease — this is critical for Flesch score improvement. Aim for an average sentence length under 20 words.
- When splitting sentences, keep both parts as complete, natural sentences.
- Prefer shorter, common words over longer, academic ones (e.g., "use" not "utilize", "help" not "facilitate", "about" not "approximately").
- Do NOT change paragraph structure, headings, or lists.
- Do NOT add or remove subheadings.
- Focus on making every sentence clear, direct, and easy to understand on first reading.`;
  }

  const systemPrompt = `You are an expert editor who improves web content readability. You are editing a ${pageTypeLabel} for ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel website about ${siteConfig.parkName} and ${siteConfig.aiLocale}.

YOUR TASK:
Rewrite the provided content to fix the specific readability issues listed below. Return the improved ${isPlainText ? "plain text" : "HTML"}.
${focusConstraint}

READABILITY ISSUES TO FIX:
${issueList || "General readability improvement needed."}

${isPlainText ? plainTextRules : richTextRules}

VOICE PRESERVATION (critical):
- You are editing content for ${siteConfig.siteName}, which uses a knowledgeable-local-friend voice. Warm, direct, opinionated, concrete.
- NEVER introduce these banned words: moreover, furthermore, additionally, nestled, boasts, whilst, amidst, amongst, testament to, plethora, myriad, embark, endeavor, utilize, facilitate, comprehensive, exceptional, exquisite, unparalleled, unwind, indulge, elevate, curated, reimagined, bespoke, holistic, synergy, leveraging, innovative, cutting-edge, world-class, state-of-the-art, one-of-a-kind, robust, nuanced, fostering, pivotal, realm, tapestry, landscape (metaphorical), unleash, unlock, delve, symphony, supercharge, game-changer, next-level, powerhouse, revolutionize, secret sauce.
- NEVER introduce these phrases: in today's [anything], now more than ever, let's dive in, here's the thing, the best part?, whether you're...or, something for everyone, not to be missed, hidden gem, look no further, your gateway to adventure.
- NEVER use em dashes. Use commas, periods, semicolons, or parentheses instead.
- Keep the tone natural and human. Short sentences are fine. Fragments are fine. Contractions are preferred.
- Prefer plain everyday words: "use" not "utilize", "try" not "endeavor", "help" not "facilitate", "about" not "approximately", "need" not "necessitate".
- Every edited sentence must pass the "say it out loud" test: if it sounds weird spoken to a friend, rewrite it again.
- Target readability: 12-15 word average sentences, max 25 words per sentence, 2-4 sentence paragraphs.`;

  const userPrompt = `Here is the HTML content to improve:\n\n${bodyHtml}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let improvedHtml = textBlock.text.trim();

    // Strip code fences if the model added them despite instructions
    if (improvedHtml.startsWith("```")) {
      improvedHtml = improvedHtml.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
    }

    // Safety net: downgrade H2 to H3 in listing/page descriptions — the page
    // layout already wraps content in an H2 "About" section, so AI-generated
    // subheadings must be H3 to avoid mismatched heading hierarchy.
    if (contentType === "listing") {
      improvedHtml = improvedHtml.replace(/<h2>/gi, "<h3>").replace(/<\/h2>/gi, "</h3>");
    }

    // Safety net for plain-text content types: strip any HTML tags the model added
    if (isPlainText) {
      improvedHtml = improvedHtml
        .replace(/<[^>]*>/g, "")       // Remove all HTML tags
        .replace(/&amp;/g, "&")        // Decode common entities
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n")   // Collapse excessive newlines
        .trim();
    }

    if (!improvedHtml || improvedHtml.length < 10) return null;

    return { improvedHtml };
  } catch (error) {
    console.error("Claude AI readability improvement failed:", error);
    return null;
  }
}

// ============================================
// CLAUDE AI — Focus Keyphrase Suggestion
// ============================================

/**
 * Suggest a focus keyphrase for a piece of content by analyzing it
 * against the keyword reference documents (RAG docs).
 */
export async function suggestKeyphrase(input: {
  bodyHtml: string;
  contentType: "blog_post" | "listing" | "page";
  title: string;
  slug: string;
  keyphraseUsage?: { keyphrase: string; count: number }[];
}): Promise<{ keyphrase: string } | null> {
  const { bodyHtml, contentType, title, slug, keyphraseUsage } = input;

  const client = await getAnthropicClient();
  if (!client) return null;

  const model = await getAiModel();
  const keywordContext = await buildKeywordContext();

  const pageTypeLabel =
    contentType === "blog_post"
      ? "news article"
      : contentType === "listing"
        ? "directory listing"
        : "page";

  // Build the keyphrase usage context for cycling behavior
  let usageSection = "";
  if (keyphraseUsage && keyphraseUsage.length > 0) {
    usageSection = `\n\n## CURRENT KEYPHRASE ASSIGNMENTS
The following keyphrases are already assigned to other pages on this site, with their usage counts. Your goal is to DIVERSIFY keyword coverage across the site.

${keyphraseUsage.map((u) => `- "${u.keyphrase}" (used ${u.count}×)`).join("\n")}`;
  }

  const systemPrompt = `You are an SEO keyword strategist for ${siteConfig.siteName} (${siteConfig.siteUrl.replace("https://", "")}), a travel website about ${siteConfig.parkName} and ${siteConfig.aiLocale}.

YOUR TASK:
Analyze the provided ${pageTypeLabel} content and the keyword reference documents below. Identify the single best focus keyphrase (2–4 words) that this content should target for search engine ranking.

${keywordContext}${usageSection}

KEYPHRASE SELECTION STRATEGY:
1. Start by identifying ALL relevant keyphrases from the keyword reference documents that match this content (at least 60% relevance to the topic).
2. Among those relevant keyphrases, STRONGLY PREFER ones that are not yet assigned to any page (usage count = 0 or not listed above).
3. If all relevant keyphrases have been used at least once, prefer the ones with the LOWEST usage count. Spread keywords evenly across the site.
4. Only reuse a keyphrase at a higher count when all relevant alternatives have already reached that count.
5. The keyphrase must still be genuinely relevant to this content — never pick an irrelevant keyphrase just because it's unused.

RULES:
1. The keyphrase MUST be 2–4 words. Never a single word, never more than 4 words.
2. Prefer keyphrases that appear in the keyword reference documents above — these are researched, high-value terms.
3. The keyphrase should accurately describe the primary topic of the content.
4. Use lowercase only. No quotes, no punctuation.
5. Return ONLY the keyphrase — nothing else. No explanation, no alternatives, no formatting.`;

  const userPrompt = `Title: ${title}
URL slug: ${slug}
Content type: ${pageTypeLabel}

Content:
${bodyHtml}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 50,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let keyphrase = textBlock.text.trim();

    // Strip quotes if present
    keyphrase = keyphrase.replace(/^["']+|["']+$/g, "");
    // Lowercase
    keyphrase = keyphrase.toLowerCase();
    // Remove any trailing punctuation
    keyphrase = keyphrase.replace(/[.,;:!?]+$/, "");

    if (!keyphrase || keyphrase.split(/\s+/).length > 6) return null;

    return { keyphrase };
  } catch (error) {
    console.error("Claude AI keyphrase suggestion failed:", error);
    return null;
  }
}
