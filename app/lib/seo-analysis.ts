// ============================================
// SEO ANALYSIS ENGINE — Yoast-style per-content
// analysis with 12 checks and traffic-light scoring.
// Pure functions — works on both server and client.
// ============================================

import { siteConfig } from "./site-config";

export type SeoRating = "good" | "improvement" | "problem";
export type ContentType = "blog_post" | "listing" | "page";

export interface SeoCheckResult {
  id: string;
  category: "keyphrase" | "content";
  rating: SeoRating;
  label: string;
  detail: string;
}

export interface SeoAnalysisResult {
  overallRating: SeoRating;
  overallScore: number; // 0–100
  checks: SeoCheckResult[];
  goodCount: number;
  improvementCount: number;
  problemCount: number;
}

export interface SeoAnalysisInput {
  contentType: ContentType;
  focusKeyphrase: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  bodyHtml: string;
  featuredImageAlt?: string;
  featuredImage?: string;
  /** External website URL (e.g. from listing contact info) — counted as outbound link */
  websiteUrl?: string;
}

// ============================================
// SHARED UTILITIES (also consumed by SeoMeter)
// ============================================

/** Common English stop words to skip during keyword extraction */
export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "been", "this", "that", "has", "had", "have", "will", "can", "not",
  "all", "its", "you", "your", "our", "we", "they", "their", "his",
  "her", "she", "him", "his", "how", "what", "when", "where", "which",
  "who", "why", "out", "up", "about", "into", "over", "after", "than",
  "then", "also", "just", "more", "some", "very", "most", "best",
]);

/** Strip HTML tags and entities, returning plain text */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ");
}

/** Extract significant keywords (3+ chars, not stop words) from text */
export function extractKeywords(text: string): string[] {
  const plain = stripHtml(text).toLowerCase();
  const words = plain.split(/\s+/).filter(
    (w) => w.length >= 3 && !STOP_WORDS.has(w) && /^[a-z]/.test(w)
  );
  return [...new Set(words)].slice(0, 8);
}

// ============================================
// INTERNAL HELPERS
// ============================================

function countWords(text: string): number {
  if (!text) return 0;
  return stripHtml(text).trim().split(/\s+/).filter(Boolean).length;
}

function getFirstNWords(html: string, n: number): string {
  const plain = stripHtml(html).trim();
  return plain.split(/\s+/).slice(0, n).join(" ").toLowerCase();
}

function normalizeKeywordText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractKeywordTokens(text: string): string[] {
  return normalizeKeywordText(text).split(/\s+/).filter(Boolean);
}

function countOccurrences(text: string, phrase: string): number {
  if (!phrase) return 0;
  const lower = text.toLowerCase();
  const target = phrase.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(target, pos)) !== -1) {
    count++;
    pos += target.length;
  }
  return count;
}

// ============================================
// 12 SEO CHECKS
// ============================================

function checkKeyphraseInTitle(keyphrase: string, metaTitle: string): SeoCheckResult {
  const found = metaTitle.toLowerCase().includes(keyphrase.toLowerCase());
  return {
    id: "keyphrase-in-title",
    category: "keyphrase",
    rating: found ? "good" : "problem",
    label: "Keyphrase in SEO title",
    detail: found
      ? "Your focus keyphrase appears in the SEO title. Good job!"
      : "Your focus keyphrase does not appear in the SEO title. Add it for better rankings.",
  };
}

function checkKeyphraseInMetaDescription(keyphrase: string, metaDescription: string): SeoCheckResult {
  const found = metaDescription.toLowerCase().includes(keyphrase.toLowerCase());
  return {
    id: "keyphrase-in-meta-description",
    category: "keyphrase",
    rating: found ? "good" : "improvement",
    label: "Keyphrase in meta description",
    detail: found
      ? "Your focus keyphrase appears in the meta description."
      : "Your focus keyphrase does not appear in the meta description. Include it to improve click-through rates.",
  };
}

function checkKeyphraseInIntroduction(keyphrase: string, bodyHtml: string): SeoCheckResult {
  const intro = getFirstNWords(bodyHtml, 100);
  const found = intro.includes(keyphrase.toLowerCase());
  return {
    id: "keyphrase-in-introduction",
    category: "keyphrase",
    rating: found ? "good" : "improvement",
    label: "Keyphrase in introduction",
    detail: found
      ? "Your focus keyphrase appears in the first 100 words."
      : "Your focus keyphrase does not appear in the introduction. Try using it within the first 100 words.",
  };
}

function checkKeyphraseInSlug(keyphrase: string, slug: string): SeoCheckResult {
  const keyphraseWords = extractKeywordTokens(keyphrase);
  const slugWords = new Set(extractKeywordTokens(slug));
  const matchedWords = keyphraseWords.filter((w) => slugWords.has(w));
  const allMatch = matchedWords.length === keyphraseWords.length;
  const someMatch = matchedWords.length > 0;

  return {
    id: "keyphrase-in-slug",
    category: "keyphrase",
    rating: allMatch ? "good" : someMatch ? "improvement" : "problem",
    label: "Keyphrase in URL slug",
    detail: allMatch
      ? "Your URL slug contains all words from your focus keyphrase."
      : someMatch
        ? `Your URL slug contains ${matchedWords.length} of ${keyphraseWords.length} keyphrase words. Try to include all of them.`
        : "Your focus keyphrase does not appear in the URL slug. Consider updating it.",
  };
}

function checkKeyphraseDensity(keyphrase: string, bodyHtml: string): SeoCheckResult {
  const plainText = stripHtml(bodyHtml).toLowerCase();
  const totalWords = countWords(bodyHtml);
  if (totalWords === 0) {
    return {
      id: "keyphrase-density",
      category: "keyphrase",
      rating: "problem",
      label: "Keyphrase density",
      detail: "No content to analyze. Add content to your page.",
    };
  }

  const occurrences = countOccurrences(plainText, keyphrase);
  const keyphraseWordCount = keyphrase.split(/\s+/).length;
  const density = (occurrences * keyphraseWordCount / totalWords) * 100;
  const densityStr = density.toFixed(1);

  let rating: SeoRating;
  let detail: string;

  if (density >= 1 && density <= 3) {
    rating = "good";
    detail = `Keyphrase density is ${densityStr}% — within the recommended 1–3% range.`;
  } else if ((density >= 0.5 && density < 1) || (density > 3 && density <= 4)) {
    rating = "improvement";
    detail = density < 1
      ? `Keyphrase density is ${densityStr}%. Try using it a bit more often (aim for 1–3%).`
      : `Keyphrase density is ${densityStr}%. Consider reducing usage slightly (aim for 1–3%).`;
  } else {
    rating = "problem";
    detail = density < 0.5
      ? `Keyphrase density is ${densityStr}%. Use your keyphrase more frequently (aim for 1–3%).`
      : `Keyphrase density is ${densityStr}%. This is too high and may look like keyword stuffing.`;
  }

  return { id: "keyphrase-density", category: "keyphrase", rating, label: "Keyphrase density", detail };
}

function checkSeoTitleLength(metaTitle: string): SeoCheckResult {
  const len = metaTitle.length;
  let rating: SeoRating;
  let detail: string;

  if (len === 0) {
    rating = "problem";
    detail = "No SEO title set. Add one for better search results.";
  } else if (len >= 35 && len <= 60) {
    rating = "good";
    detail = `SEO title is ${len} characters — within the ideal 35–60 range.`;
  } else if ((len >= 20 && len < 35) || (len > 60 && len <= 65)) {
    rating = "improvement";
    detail = len < 35
      ? `SEO title is ${len} characters. A bit short — aim for 35–60 characters.`
      : `SEO title is ${len} characters. Slightly long — may get truncated in search results.`;
  } else {
    rating = "problem";
    detail = len < 20
      ? `SEO title is only ${len} characters. Much too short — aim for 35–60 characters.`
      : `SEO title is ${len} characters. Too long — will be cut off in search results. Aim for 35–60.`;
  }

  return { id: "seo-title-length", category: "content", rating, label: "SEO title length", detail };
}

function checkMetaDescriptionLength(metaDescription: string): SeoCheckResult {
  const len = metaDescription.length;
  let rating: SeoRating;
  let detail: string;

  if (len === 0) {
    rating = "problem";
    detail = "No meta description set. Add one to control how your page appears in search results.";
  } else if (len >= 120 && len <= 160) {
    rating = "good";
    detail = `Meta description is ${len} characters — within the ideal 120–160 range.`;
  } else if ((len >= 70 && len < 120) || (len > 160 && len <= 170)) {
    rating = "improvement";
    detail = len < 120
      ? `Meta description is ${len} characters. Consider adding more detail (aim for 120–160).`
      : `Meta description is ${len} characters. Slightly long — may get truncated.`;
  } else {
    rating = "problem";
    detail = len < 70
      ? `Meta description is only ${len} characters. Too short — aim for 120–160 characters.`
      : `Meta description is ${len} characters. Too long — will be cut off. Aim for 120–160.`;
  }

  return { id: "meta-description-length", category: "content", rating, label: "Meta description length", detail };
}

function checkContentLength(bodyHtml: string, contentType: ContentType): SeoCheckResult {
  const words = countWords(bodyHtml);
  let rating: SeoRating;
  let detail: string;

  if (contentType === "blog_post") {
    if (words >= 300) {
      rating = "good";
      detail = `Content is ${words} words — nice and comprehensive.`;
    } else if (words >= 150) {
      rating = "improvement";
      detail = `Content is ${words} words. Consider adding more (aim for 300+ words for news articles).`;
    } else {
      rating = "problem";
      detail = words === 0
        ? "No content yet. Add at least 300 words for a strong news article."
        : `Content is only ${words} words. News articles should be at least 300 words for SEO.`;
    }
  } else {
    // Listing or page
    if (words >= 150) {
      rating = "good";
      detail = `Content is ${words} words — good length for a listing description.`;
    } else if (words >= 75) {
      rating = "improvement";
      detail = `Content is ${words} words. Consider adding more detail (aim for 150+ words).`;
    } else {
      rating = "problem";
      detail = words === 0
        ? "No description yet. Add at least 150 words for good SEO."
        : `Description is only ${words} words. Aim for at least 150 words.`;
    }
  }

  return { id: "content-length", category: "content", rating, label: "Content length", detail };
}

function checkImageAltText(bodyHtml: string, featuredImage?: string, featuredImageAlt?: string): SeoCheckResult {
  // Count images: featured image + inline <img> tags in body
  const hasFeatureImg = Boolean(featuredImage && featuredImage.trim().length > 0);
  const inlineImgRegex = /<img\s[^>]*>/gi;
  const inlineImgs = bodyHtml.match(inlineImgRegex) || [];
  const totalImages = (hasFeatureImg ? 1 : 0) + inlineImgs.length;

  if (totalImages === 0) {
    // Red: no images at all
    return {
      id: "image-alt-text",
      category: "content",
      rating: "problem",
      label: "Images",
      detail: "No images found on this page. Add at least one image to improve engagement and SEO.",
    };
  }

  // Check alt text coverage
  const hasFeaturedAlt = Boolean(featuredImageAlt && featuredImageAlt.trim().length > 0);
  // Count inline images with non-empty alt text
  const altRegex = /<img\s[^>]*alt=["']([^"']+)["'][^>]*>/gi;
  const inlineWithAlt = bodyHtml.match(altRegex) || [];
  const totalWithAlt = (hasFeatureImg && hasFeaturedAlt ? 1 : 0) + inlineWithAlt.length;
  const totalMissing = totalImages - totalWithAlt;

  if (totalMissing === 0) {
    // Green: all images have alt text
    return {
      id: "image-alt-text",
      category: "content",
      rating: "good",
      label: "Image alt text",
      detail: `All ${totalImages} image${totalImages > 1 ? "s" : ""} ${totalImages > 1 ? "have" : "has"} alt text. Great for accessibility and SEO.`,
    };
  }

  // Orange: images present but some/all missing alt text
  return {
    id: "image-alt-text",
    category: "content",
    rating: "improvement",
    label: "Image alt text",
    detail: `${totalMissing} of ${totalImages} image${totalImages > 1 ? "s" : ""} ${totalMissing > 1 ? "are" : "is"} missing alt text. Add descriptive alt text to improve accessibility and image SEO.`,
  };
}

function checkInternalLinks(bodyHtml: string): SeoCheckResult {
  const siteHost = new URL(siteConfig.siteUrl).hostname;
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let internalCount = 0;
  let match;
  while ((match = linkRegex.exec(bodyHtml)) !== null) {
    const href = match[1];
    if (href.startsWith("/") || href.includes(siteHost)) {
      internalCount++;
    }
  }

  return {
    id: "internal-links",
    category: "content",
    rating: internalCount >= 1 ? "good" : "improvement",
    label: "Internal links",
    detail: internalCount >= 1
      ? `Found ${internalCount} internal link${internalCount > 1 ? "s" : ""}. Good for SEO and user navigation.`
      : "No internal links found. Add links to other pages on your site for better SEO.",
  };
}

function checkOutboundLinks(bodyHtml: string, websiteUrl?: string): SeoCheckResult {
  const siteHost = new URL(siteConfig.siteUrl).hostname;
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let outboundCount = 0;
  let match;
  while ((match = linkRegex.exec(bodyHtml)) !== null) {
    const href = match[1];
    if (href.startsWith("http") && !href.includes(siteHost)) {
      outboundCount++;
    }
  }

  // Count listing website URL as an outbound link (it's rendered on the published page)
  if (websiteUrl && websiteUrl.startsWith("http") && !websiteUrl.includes(siteHost)) {
    outboundCount++;
  }

  return {
    id: "outbound-links",
    category: "content",
    rating: outboundCount >= 1 ? "good" : "improvement",
    label: "Outbound links",
    detail: outboundCount >= 1
      ? `Found ${outboundCount} outbound link${outboundCount > 1 ? "s" : ""}. Good for credibility.`
      : "No outbound links found. Consider linking to authoritative external sources.",
  };
}

function checkSubheadingDistribution(bodyHtml: string): SeoCheckResult {
  const words = countWords(bodyHtml);
  // Only check for longer content
  if (words < 300) {
    return {
      id: "subheading-distribution",
      category: "content",
      rating: "good",
      label: "Subheading distribution",
      detail: "Content is under 300 words — subheadings are optional at this length.",
    };
  }

  const subheadingRegex = /<h[23][^>]*>/gi;
  const matches = bodyHtml.match(subheadingRegex);
  const subheadingCount = matches ? matches.length : 0;

  return {
    id: "subheading-distribution",
    category: "content",
    rating: subheadingCount >= 1 ? "good" : "problem",
    label: "Subheading distribution",
    detail: subheadingCount >= 1
      ? `Found ${subheadingCount} subheading${subheadingCount > 1 ? "s" : ""}. Content is well-structured.`
      : "No subheadings found in 300+ word content. Add H2 or H3 headings to break up the text.",
  };
}

function checkKeyphraseDistribution(keyphrase: string, bodyHtml: string): SeoCheckResult {
  const plainText = stripHtml(bodyHtml).toLowerCase();
  const totalWords = countWords(bodyHtml);

  if (totalWords < 100) {
    return {
      id: "keyphrase-distribution",
      category: "keyphrase",
      rating: "good",
      label: "Keyphrase distribution",
      detail: "Content is short — keyphrase distribution is fine at this length.",
    };
  }

  // Split content into roughly equal thirds
  const words = plainText.split(/\s+/).filter(Boolean);
  const third = Math.ceil(words.length / 3);
  const sections = [
    words.slice(0, third).join(" "),
    words.slice(third, third * 2).join(" "),
    words.slice(third * 2).join(" "),
  ];

  const kpLower = keyphrase.toLowerCase();
  const sectionHits = sections.map((section) => countOccurrences(section, kpLower) > 0);
  const hitCount = sectionHits.filter(Boolean).length;

  let rating: SeoRating;
  let detail: string;

  if (hitCount === 3) {
    rating = "good";
    detail = "Your focus keyphrase is well-distributed across the beginning, middle, and end of the content.";
  } else if (hitCount === 2) {
    rating = "improvement";
    const missing = !sectionHits[0] ? "beginning" : !sectionHits[1] ? "middle" : "end";
    detail = `Your keyphrase appears in 2 of 3 content sections. Try adding it to the ${missing} of your content for more even distribution.`;
  } else {
    rating = "problem";
    detail = hitCount === 1
      ? "Your keyphrase is concentrated in only one section of the content. Spread it more evenly across the beginning, middle, and end."
      : "Your keyphrase does not appear in the content body. Add it throughout for better SEO.";
  }

  return { id: "keyphrase-distribution", category: "keyphrase", rating, label: "Keyphrase distribution", detail };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export function runSeoAnalysis(input: SeoAnalysisInput): SeoAnalysisResult {
  const { contentType, focusKeyphrase, metaTitle, metaDescription, slug, bodyHtml, featuredImageAlt, featuredImage, websiteUrl } = input;
  const hasKeyphrase = Boolean(focusKeyphrase && focusKeyphrase.trim().length > 0);
  const kp = focusKeyphrase.trim();

  const checks: SeoCheckResult[] = [];

  // Keyphrase checks (only if keyphrase is provided)
  if (hasKeyphrase) {
    checks.push(checkKeyphraseInTitle(kp, metaTitle));
    checks.push(checkKeyphraseInMetaDescription(kp, metaDescription));
    checks.push(checkKeyphraseInIntroduction(kp, bodyHtml));
    checks.push(checkKeyphraseInSlug(kp, slug));
    checks.push(checkKeyphraseDensity(kp, bodyHtml));
    checks.push(checkKeyphraseDistribution(kp, bodyHtml));
  }

  // Content checks (always run)
  checks.push(checkSeoTitleLength(metaTitle));
  checks.push(checkMetaDescriptionLength(metaDescription));
  checks.push(checkContentLength(bodyHtml, contentType));
  checks.push(checkImageAltText(bodyHtml, featuredImage, featuredImageAlt));
  checks.push(checkInternalLinks(bodyHtml));
  checks.push(checkOutboundLinks(bodyHtml, websiteUrl));
  checks.push(checkSubheadingDistribution(bodyHtml));

  // Calculate counts
  const goodCount = checks.filter((c) => c.rating === "good").length;
  const improvementCount = checks.filter((c) => c.rating === "improvement").length;
  const problemCount = checks.filter((c) => c.rating === "problem").length;

  // Calculate overall score: good=100, improvement=50, problem=0
  const totalChecks = checks.length;
  const scoreSum = checks.reduce((acc, c) => {
    if (c.rating === "good") return acc + 100;
    if (c.rating === "improvement") return acc + 50;
    return acc;
  }, 0);
  const overallScore = totalChecks > 0 ? Math.round(scoreSum / totalChecks) : 0;

  let overallRating: SeoRating;
  if (overallScore >= 75) overallRating = "good";
  else if (overallScore >= 45) overallRating = "improvement";
  else overallRating = "problem";

  return {
    overallRating,
    overallScore,
    checks,
    goodCount,
    improvementCount,
    problemCount,
  };
}
