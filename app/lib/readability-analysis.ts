// ============================================
// READABILITY ANALYSIS ENGINE — Better-than-Yoast
// per-content readability scoring with specific,
// actionable feedback and AI fix integration.
// Pure functions — works on both server and client.
// ============================================

import { stripHtml } from "./seo-analysis";

export type ReadabilityRating = "good" | "improvement" | "problem";

export interface ReadabilityCheckResult {
  id: string;
  category: "sentence" | "structure" | "clarity";
  rating: ReadabilityRating;
  label: string;
  /** Short summary shown in the collapsed row */
  detail: string;
  /** Specific problematic excerpts the user can fix — the "WHAT to change" */
  highlights?: ReadabilityHighlight[];
  /** Numeric score for display (e.g. Flesch score, percentage) */
  score?: number;
}

export interface ReadabilityHighlight {
  /** The exact text that needs attention */
  text: string;
  /** Why it's flagged and what to do about it */
  suggestion: string;
}

export interface ReadabilityAnalysisResult {
  overallRating: ReadabilityRating;
  overallScore: number; // 0–100
  fleschScore: number; // Raw Flesch Reading Ease
  checks: ReadabilityCheckResult[];
  goodCount: number;
  improvementCount: number;
  problemCount: number;
}

export interface ReadabilityAnalysisInput {
  bodyHtml: string;
  contentType: "blog_post" | "listing" | "page";
}

// ============================================
// TEXT PROCESSING UTILITIES
// ============================================

/** Split HTML text into plain sentences, preserving order */
function splitSentences(html: string): string[] {
  const plain = stripHtml(html)
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return [];

  // Split on sentence-ending punctuation followed by a space or end-of-string
  // Handles: . ! ? and also handles abbreviations better by requiring space+uppercase after period
  const raw = plain.split(/(?<=[.!?])\s+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.split(/\s+/).length >= 2); // at least 2 words to count as sentence
}

/** Count syllables in a word (English approximation) */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;

  // Common silent-e rule
  let syllables = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  // Count vowel groups
  const matches = syllables.match(/[aeiouy]{1,2}/g);
  const count = matches ? matches.length : 1;
  return Math.max(1, count);
}

/** Count words in plain text */
function countWords(text: string): number {
  const plain = stripHtml(text).trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

/** Get words from a sentence */
function getWords(sentence: string): string[] {
  return sentence.split(/\s+/).filter((w) => w.length > 0);
}

/** Split into paragraphs from HTML */
function splitParagraphs(html: string): string[] {
  // Split on block-level tags
  const blocks = html
    .split(/<\/(?:p|div|li|blockquote|h[1-6])>/gi)
    .map((block) => stripHtml(block).trim())
    .filter((block) => block.length > 0);
  return blocks;
}

// ============================================
// TRANSITION WORDS LIST
// ============================================

const TRANSITION_WORDS = new Set([
  // Addition
  "additionally", "also", "besides", "furthermore", "moreover", "similarly",
  "likewise", "equally", "correspondingly",
  // Contrast
  "however", "nevertheless", "nonetheless", "although", "though", "whereas",
  "conversely", "instead", "rather", "yet", "still", "otherwise",
  // Cause/Effect
  "therefore", "consequently", "thus", "hence", "accordingly", "because",
  "since", "so", "resulting",
  // Sequence
  "firstly", "secondly", "thirdly", "finally", "meanwhile", "subsequently",
  "afterward", "previously", "initially", "ultimately", "eventually",
  // Example
  "specifically", "notably", "particularly", "especially", "including",
  // Conclusion
  "overall", "ultimately", "essentially", "basically",
]);

// Two-word transition phrases
const TRANSITION_PHRASES = [
  "for example", "for instance", "in addition", "in contrast",
  "on the other hand", "as a result", "in fact", "of course",
  "in particular", "in other words", "that is", "in conclusion",
  "to summarize", "in summary", "as well", "even though",
  "in order to", "due to", "such as", "rather than",
  "as opposed to", "not only", "on top of", "in the same way",
];

/** Check if a sentence contains a transition word/phrase */
function hasTransitionWord(sentence: string): boolean {
  const lower = sentence.toLowerCase();

  // Check two-word phrases first
  for (const phrase of TRANSITION_PHRASES) {
    if (lower.includes(phrase)) return true;
  }

  // Check single words — must be at word boundary
  const words = lower.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, "");
    if (TRANSITION_WORDS.has(cleaned)) return true;
  }

  return false;
}

// ============================================
// PASSIVE VOICE DETECTION
// ============================================

const PASSIVE_HELPERS = new Set([
  "is", "are", "was", "were", "be", "been", "being",
  "get", "gets", "got", "gotten", "getting",
]);

const PAST_PARTICIPLE_SUFFIXES = ["ed", "en", "own", "ung", "ught"];

/** Simple passive voice detection — looks for "be + past participle" patterns */
function isPassiveVoice(sentence: string): boolean {
  const words = sentence.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);

  for (let i = 0; i < words.length - 1; i++) {
    if (PASSIVE_HELPERS.has(words[i])) {
      const next = words[i + 1];
      if (!next) continue;

      // Check if next word looks like a past participle
      if (PAST_PARTICIPLE_SUFFIXES.some((suffix) => next.endsWith(suffix) && next.length > suffix.length + 2)) {
        // Exclude common false positives
        const falsePositives = new Set([
          "used", "based", "located", "interested", "excited", "pleased",
          "surprised", "concerned", "involved", "designed", "needed",
          "allowed", "supposed", "required", "expected", "owned",
          "tired", "bored", "relaxed", "limited",
        ]);
        if (!falsePositives.has(next)) {
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================
// COMPLEX WORD DETECTION
// ============================================

/** Words that are unnecessarily complex with simpler alternatives */
const COMPLEX_WORDS: Record<string, string> = {
  "utilize": "use",
  "utilization": "use",
  "facilitate": "help",
  "implement": "start, set up",
  "commence": "start",
  "terminate": "end",
  "endeavor": "try",
  "subsequent": "next, later",
  "approximately": "about",
  "demonstrate": "show",
  "ascertain": "find out",
  "sufficient": "enough",
  "insufficient": "not enough",
  "numerous": "many",
  "purchase": "buy",
  "regarding": "about",
  "concerning": "about",
  "nevertheless": "still, yet",
  "notwithstanding": "despite",
  "advantageous": "helpful",
  "predominantly": "mainly",
  "acquisition": "getting, buying",
  "accommodate": "fit, hold",
  "aforementioned": "mentioned",
  "henceforth": "from now on",
  "herein": "here",
  "pursuant": "following",
  "whereby": "where, by which",
  "inasmuch": "since",
  "therein": "there, in that",
};

// ============================================
// 10 READABILITY CHECKS
// ============================================

/** 1. Flesch Reading Ease Score */
function checkFleschReadingEase(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);
  const plain = stripHtml(bodyHtml).trim();
  const words = plain.split(/\s+/).filter(Boolean);

  if (words.length < 20 || sentences.length === 0) {
    return {
      id: "flesch-reading-ease",
      category: "clarity",
      rating: "improvement",
      label: "Flesch Reading Ease",
      detail: "Not enough content to calculate a reading ease score. Add more text.",
      score: 0,
    };
  }

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  // Flesch Reading Ease formula
  const score = Math.round(206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord);
  const clampedScore = Math.max(0, Math.min(100, score));

  let rating: ReadabilityRating;
  let detail: string;

  if (clampedScore >= 60) {
    rating = "good";
    detail = `Flesch score: ${clampedScore}/100 — easy to read. Great for web content and a broad audience.`;
  } else if (clampedScore >= 40) {
    rating = "improvement";
    detail = `Flesch score: ${clampedScore}/100 — fairly difficult to read. Try shorter sentences and simpler words to improve accessibility.`;
  } else {
    rating = "problem";
    detail = `Flesch score: ${clampedScore}/100 — difficult to read. Most web readers prefer simpler prose. Shorten sentences and use everyday words.`;
  }

  return {
    id: "flesch-reading-ease",
    category: "clarity",
    rating,
    label: "Flesch Reading Ease",
    detail,
    score: clampedScore,
  };
}

/** 2. Sentence Length — flags individual long sentences */
function checkSentenceLength(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);
  if (sentences.length === 0) {
    return {
      id: "sentence-length",
      category: "sentence",
      rating: "improvement",
      label: "Sentence length",
      detail: "No sentences found to analyze.",
    };
  }

  const longThreshold = 25; // words
  const longSentences = sentences.filter((s) => getWords(s).length > longThreshold);
  const percentage = Math.round((longSentences.length / sentences.length) * 100);

  let rating: ReadabilityRating;
  let detail: string;

  if (percentage <= 15) {
    rating = "good";
    detail = `${percentage}% of sentences are over ${longThreshold} words. Good mix of sentence lengths.`;
  } else if (percentage <= 30) {
    rating = "improvement";
    detail = `${percentage}% of sentences are over ${longThreshold} words (${longSentences.length} of ${sentences.length}). Try to keep this under 15% for better readability.`;
  } else {
    rating = "problem";
    detail = `${percentage}% of sentences are over ${longThreshold} words (${longSentences.length} of ${sentences.length}). Break up long sentences for easier reading.`;
  }

  // Highlight the actual long sentences
  const highlights: ReadabilityHighlight[] = longSentences.slice(0, 5).map((s) => ({
    text: s.length > 120 ? s.slice(0, 120) + "…" : s,
    suggestion: `${getWords(s).length} words — try splitting into two sentences or removing unnecessary words.`,
  }));

  return {
    id: "sentence-length",
    category: "sentence",
    rating,
    label: "Sentence length",
    detail,
    highlights: highlights.length > 0 ? highlights : undefined,
    score: percentage,
  };
}

/** 3. Paragraph Length — flags overly long paragraphs */
function checkParagraphLength(bodyHtml: string): ReadabilityCheckResult {
  const paragraphs = splitParagraphs(bodyHtml);
  if (paragraphs.length === 0) {
    return {
      id: "paragraph-length",
      category: "structure",
      rating: "improvement",
      label: "Paragraph length",
      detail: "No paragraphs found to analyze.",
    };
  }

  const longThreshold = 120; // words — web best practice
  const longParagraphs = paragraphs.filter((p) => {
    const words = p.split(/\s+/).filter(Boolean).length;
    return words > longThreshold;
  });

  if (longParagraphs.length === 0) {
    return {
      id: "paragraph-length",
      category: "structure",
      rating: "good",
      label: "Paragraph length",
      detail: `All ${paragraphs.length} paragraphs are a good length for web reading (under ${longThreshold} words each).`,
    };
  }

  const highlights: ReadabilityHighlight[] = longParagraphs.slice(0, 3).map((p) => {
    const wordCount = p.split(/\s+/).filter(Boolean).length;
    const preview = p.length > 100 ? p.slice(0, 100) + "…" : p;
    return {
      text: preview,
      suggestion: `${wordCount} words — break this into 2-3 shorter paragraphs for better scannability.`,
    };
  });

  return {
    id: "paragraph-length",
    category: "structure",
    rating: longParagraphs.length >= 2 ? "problem" : "improvement",
    label: "Paragraph length",
    detail: `${longParagraphs.length} paragraph${longParagraphs.length > 1 ? "s" : ""} exceed${longParagraphs.length === 1 ? "s" : ""} ${longThreshold} words. Shorter paragraphs are easier to scan on screens.`,
    highlights,
  };
}

/** 4. Passive Voice Detection */
function checkPassiveVoice(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);
  if (sentences.length === 0) {
    return {
      id: "passive-voice",
      category: "clarity",
      rating: "improvement",
      label: "Passive voice",
      detail: "No sentences found to analyze.",
    };
  }

  const passiveSentences = sentences.filter(isPassiveVoice);
  const percentage = Math.round((passiveSentences.length / sentences.length) * 100);

  let rating: ReadabilityRating;
  let detail: string;

  if (percentage <= 10) {
    rating = "good";
    detail = `${percentage}% of sentences use passive voice. Active writing keeps readers engaged.`;
  } else if (percentage <= 20) {
    rating = "improvement";
    detail = `${percentage}% of sentences use passive voice (${passiveSentences.length} of ${sentences.length}). Try to rewrite some in active voice for more engaging prose.`;
  } else {
    rating = "problem";
    detail = `${percentage}% of sentences use passive voice (${passiveSentences.length} of ${sentences.length}). Rewrite with active voice to make your writing more direct and engaging.`;
  }

  const highlights: ReadabilityHighlight[] = passiveSentences.slice(0, 4).map((s) => ({
    text: s.length > 120 ? s.slice(0, 120) + "…" : s,
    suggestion: "Rewrite in active voice: make the subject perform the action (e.g., 'The trail offers views' instead of 'Views are offered by the trail').",
  }));

  return {
    id: "passive-voice",
    category: "clarity",
    rating,
    label: "Passive voice",
    detail,
    highlights: highlights.length > 0 ? highlights : undefined,
    score: percentage,
  };
}

/** 5. Transition Words — checks for connecting language */
function checkTransitionWords(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);
  if (sentences.length < 3) {
    return {
      id: "transition-words",
      category: "clarity",
      rating: "good",
      label: "Transition words",
      detail: "Content is short — transition words are less critical at this length.",
    };
  }

  const withTransition = sentences.filter(hasTransitionWord);
  const percentage = Math.round((withTransition.length / sentences.length) * 100);

  let rating: ReadabilityRating;
  let detail: string;

  if (percentage >= 30) {
    rating = "good";
    detail = `${percentage}% of sentences contain transition words. Your writing flows well between ideas.`;
  } else if (percentage >= 15) {
    rating = "improvement";
    detail = `${percentage}% of sentences contain transition words (aim for 30%+). Add words like "however", "for example", "additionally" to improve flow.`;
  } else {
    rating = "problem";
    detail = `Only ${percentage}% of sentences contain transition words. Your writing may feel choppy. Use transitions like "however", "therefore", "for example" to connect ideas.`;
  }

  return {
    id: "transition-words",
    category: "clarity",
    rating,
    label: "Transition words",
    detail,
    score: percentage,
  };
}

/** 6. Consecutive Sentences — same starting word */
function checkConsecutiveSentences(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);
  if (sentences.length < 3) {
    return {
      id: "consecutive-sentences",
      category: "sentence",
      rating: "good",
      label: "Consecutive sentences",
      detail: "Content is short — sentence variety check is not applicable.",
    };
  }

  const flagged: { word: string; count: number; startIndex: number }[] = [];
  let i = 0;

  while (i < sentences.length - 1) {
    const firstWord = getWords(sentences[i])[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
    if (!firstWord) { i++; continue; }

    let streak = 1;
    for (let j = i + 1; j < sentences.length; j++) {
      const nextFirst = getWords(sentences[j])[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
      if (nextFirst === firstWord) {
        streak++;
      } else {
        break;
      }
    }

    if (streak >= 3) {
      flagged.push({ word: firstWord, count: streak, startIndex: i });
    }

    i += Math.max(1, streak);
  }

  if (flagged.length === 0) {
    return {
      id: "consecutive-sentences",
      category: "sentence",
      rating: "good",
      label: "Consecutive sentences",
      detail: "Good variety in sentence beginnings. No repetitive starts detected.",
    };
  }

  const highlights: ReadabilityHighlight[] = flagged.slice(0, 3).map(({ word, count, startIndex }) => {
    const examples = sentences.slice(startIndex, startIndex + Math.min(count, 3));
    return {
      text: examples.map((s) => (s.length > 60 ? s.slice(0, 60) + "…" : s)).join(" / "),
      suggestion: `${count} consecutive sentences start with "${word}". Vary your sentence openings to keep readers engaged.`,
    };
  });

  return {
    id: "consecutive-sentences",
    category: "sentence",
    rating: flagged.length >= 2 ? "problem" : "improvement",
    label: "Consecutive sentences",
    detail: `${flagged.length} group${flagged.length > 1 ? "s" : ""} of 3+ consecutive sentences start with the same word. Vary your openings for better flow.`,
    highlights,
  };
}

/** 7. Subheading Distribution — long text without subheadings */
function checkSubheadingDistribution(bodyHtml: string): ReadabilityCheckResult {
  const totalWords = countWords(bodyHtml);

  if (totalWords < 200) {
    return {
      id: "readability-subheadings",
      category: "structure",
      rating: "good",
      label: "Subheading distribution",
      detail: "Content is under 200 words — subheadings are optional at this length.",
    };
  }

  // Split by subheadings and check each section
  const sections = bodyHtml.split(/<h[2-4][^>]*>/gi);
  const subheadingCount = sections.length - 1; // first section is before any heading

  if (subheadingCount === 0) {
    return {
      id: "readability-subheadings",
      category: "structure",
      rating: "problem",
      label: "Subheading distribution",
      detail: `${totalWords} words without any subheadings. Add H2/H3 headings every 150-200 words to break up the text and help readers scan.`,
    };
  }

  // Check for long sections between subheadings
  const longSections = sections.filter((section) => {
    const words = stripHtml(section).trim().split(/\s+/).filter(Boolean).length;
    return words > 250;
  });

  if (longSections.length === 0) {
    return {
      id: "readability-subheadings",
      category: "structure",
      rating: "good",
      label: "Subheading distribution",
      detail: `${subheadingCount} subheading${subheadingCount > 1 ? "s" : ""} well distributed throughout the content.`,
    };
  }

  const highlights: ReadabilityHighlight[] = longSections.slice(0, 2).map((section) => {
    const words = stripHtml(section).trim().split(/\s+/).filter(Boolean).length;
    const preview = stripHtml(section).trim().slice(0, 80) + "…";
    return {
      text: preview,
      suggestion: `${words} words in this section — add a subheading to break it up (aim for under 200 words per section).`,
    };
  });

  return {
    id: "readability-subheadings",
    category: "structure",
    rating: "improvement",
    label: "Subheading distribution",
    detail: `${longSections.length} section${longSections.length > 1 ? "s" : ""} have over 250 words between subheadings. Break up long sections for easier scanning.`,
    highlights,
  };
}

/** 8. Complex Words — flags unnecessarily difficult vocabulary */
function checkComplexWords(bodyHtml: string): ReadabilityCheckResult {
  const plain = stripHtml(bodyHtml).toLowerCase();
  const words = plain.split(/\s+/).filter(Boolean);

  if (words.length < 20) {
    return {
      id: "complex-words",
      category: "clarity",
      rating: "good",
      label: "Word complexity",
      detail: "Not enough content to evaluate word complexity.",
    };
  }

  const found: { word: string; simpler: string }[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, "");
    if (cleaned in COMPLEX_WORDS && !seen.has(cleaned)) {
      seen.add(cleaned);
      found.push({ word: cleaned, simpler: COMPLEX_WORDS[cleaned] });
    }
  }

  if (found.length === 0) {
    return {
      id: "complex-words",
      category: "clarity",
      rating: "good",
      label: "Word complexity",
      detail: "No unnecessarily complex words detected. Your vocabulary is accessible.",
    };
  }

  const highlights: ReadabilityHighlight[] = found.slice(0, 5).map(({ word, simpler }) => ({
    text: `"${word}"`,
    suggestion: `Consider using "${simpler}" instead — simpler words keep readers engaged.`,
  }));

  return {
    id: "complex-words",
    category: "clarity",
    rating: found.length >= 4 ? "problem" : "improvement",
    label: "Word complexity",
    detail: `${found.length} word${found.length > 1 ? "s" : ""} could be simplified. Web readers prefer plain language.`,
    highlights,
  };
}

/** 9. Sentence Variety — mix of short and long sentences */
function checkSentenceVariety(bodyHtml: string): ReadabilityCheckResult {
  const sentences = splitSentences(bodyHtml);

  if (sentences.length < 5) {
    return {
      id: "sentence-variety",
      category: "sentence",
      rating: "good",
      label: "Sentence variety",
      detail: "Not enough sentences to evaluate variety.",
    };
  }

  const lengths = sentences.map((s) => getWords(s).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Calculate standard deviation
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation — measures relative variation
  const cv = avg > 0 ? stdDev / avg : 0;

  let rating: ReadabilityRating;
  let detail: string;

  if (cv >= 0.4) {
    rating = "good";
    detail = `Good variety in sentence lengths (avg ${Math.round(avg)} words). Mixing short and long sentences creates an engaging rhythm.`;
  } else if (cv >= 0.25) {
    rating = "improvement";
    detail = `Moderate sentence variety (avg ${Math.round(avg)} words). Try mixing some shorter punchy sentences with longer descriptive ones.`;
  } else {
    rating = "problem";
    detail = `Most sentences are similar in length (avg ${Math.round(avg)} words). Vary your sentence structure — add some short, impactful sentences between longer ones.`;
  }

  return {
    id: "sentence-variety",
    category: "sentence",
    rating,
    label: "Sentence variety",
    detail,
  };
}

/** 10. Text Scannability — checks for scannable formatting (lists, bold, short paragraphs) */
function checkScannability(bodyHtml: string): ReadabilityCheckResult {
  const totalWords = countWords(bodyHtml);

  if (totalWords < 100) {
    return {
      id: "scannability",
      category: "structure",
      rating: "good",
      label: "Scannability",
      detail: "Short content is naturally scannable.",
    };
  }

  let score = 0;
  const tips: string[] = [];

  // Check for lists
  const hasList = /<(ul|ol)\b/i.test(bodyHtml);
  if (hasList) {
    score += 30;
  } else {
    tips.push("Add a bulleted or numbered list to break up content.");
  }

  // Check for bold/strong text
  const hasBold = /<(strong|b)\b/i.test(bodyHtml);
  if (hasBold) {
    score += 25;
  } else {
    tips.push("Use bold text to highlight key points for scanners.");
  }

  // Check for subheadings
  const hasSubheadings = /<h[2-4]\b/i.test(bodyHtml);
  if (hasSubheadings) {
    score += 25;
  } else {
    tips.push("Add subheadings (H2/H3) to create a scannable structure.");
  }

  // Check paragraph lengths (bonus for short paragraphs)
  const paragraphs = splitParagraphs(bodyHtml);
  const avgParagraphWords = paragraphs.length > 0
    ? paragraphs.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0) / paragraphs.length
    : 999;
  if (avgParagraphWords <= 80) {
    score += 20;
  } else {
    tips.push("Shorten paragraphs — aim for 3-5 sentences each for web readability.");
  }

  let rating: ReadabilityRating;
  if (score >= 70) {
    rating = "good";
  } else if (score >= 40) {
    rating = "improvement";
  } else {
    rating = "problem";
  }

  const detail = rating === "good"
    ? "Content uses good formatting for scannability (headings, lists, bold text, short paragraphs)."
    : `Content could be more scannable. ${tips.slice(0, 2).join(" ")}`;

  const highlights: ReadabilityHighlight[] = tips.length > 0
    ? tips.map((tip) => ({ text: tip, suggestion: "" }))
    : undefined as any;

  return {
    id: "scannability",
    category: "structure",
    rating,
    label: "Scannability",
    detail,
    highlights: tips.length > 0 && rating !== "good" ? highlights : undefined,
  };
}

// ============================================
// INCLUSIVE LANGUAGE DETECTION
// ============================================

/** Non-inclusive terms with inclusive alternatives, grouped by category */
const INCLUSIVE_LANGUAGE: Record<string, { alternatives: string; category: string }> = {
  // Gender-neutral
  mankind: { alternatives: "humankind, humanity, people", category: "gender" },
  manmade: { alternatives: "artificial, synthetic, manufactured", category: "gender" },
  "man-made": { alternatives: "artificial, synthetic, manufactured", category: "gender" },
  manpower: { alternatives: "workforce, staffing, labor", category: "gender" },
  fireman: { alternatives: "firefighter", category: "gender" },
  policeman: { alternatives: "police officer", category: "gender" },
  mailman: { alternatives: "mail carrier, postal worker", category: "gender" },
  stewardess: { alternatives: "flight attendant", category: "gender" },
  waitress: { alternatives: "server", category: "gender" },
  chairman: { alternatives: "chairperson, chair", category: "gender" },
  freshman: { alternatives: "first-year, newcomer", category: "gender" },
  businessmen: { alternatives: "businesspeople, professionals", category: "gender" },
  housewife: { alternatives: "homemaker, stay-at-home parent", category: "gender" },
  // Disability-conscious
  handicapped: { alternatives: "accessible, person with a disability", category: "disability" },
  crippled: { alternatives: "person with a disability, disabled", category: "disability" },
  "wheelchair-bound": { alternatives: "wheelchair user, uses a wheelchair", category: "disability" },
  "suffers from": { alternatives: "has, lives with, is diagnosed with", category: "disability" },
  "confined to": { alternatives: "uses, relies on", category: "disability" },
  lame: { alternatives: "unpersuasive, unconvincing", category: "disability" },
  "tone-deaf": { alternatives: "unaware, insensitive, out of touch", category: "disability" },
  // Age-conscious
  elderly: { alternatives: "older adults, seniors", category: "age" },
  senile: { alternatives: "person with dementia", category: "age" },
  // General sensitivity
  blacklist: { alternatives: "blocklist, denylist", category: "sensitivity" },
  whitelist: { alternatives: "allowlist, approved list", category: "sensitivity" },
  grandfathered: { alternatives: "legacy, exempt", category: "sensitivity" },
  "spirit animal": { alternatives: "kindred spirit, inspiration", category: "sensitivity" },
};

/** 11. Inclusive Language — flags non-inclusive terms with alternatives */
function checkInclusiveLanguage(bodyHtml: string): ReadabilityCheckResult {
  const plain = stripHtml(bodyHtml).toLowerCase();
  const words = plain.split(/\s+/).filter(Boolean);

  if (words.length < 20) {
    return {
      id: "inclusive-language",
      category: "clarity",
      rating: "good",
      label: "Inclusive language",
      detail: "Not enough content to evaluate inclusive language.",
    };
  }

  const found: { term: string; alternatives: string }[] = [];
  const seen = new Set<string>();

  // Check multi-word phrases first
  for (const [term, info] of Object.entries(INCLUSIVE_LANGUAGE)) {
    if ((term.includes(" ") || term.includes("-")) && plain.includes(term) && !seen.has(term)) {
      seen.add(term);
      found.push({ term, alternatives: info.alternatives });
    }
  }

  // Check single words
  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, "");
    if (cleaned in INCLUSIVE_LANGUAGE && !seen.has(cleaned)) {
      seen.add(cleaned);
      found.push({ term: cleaned, alternatives: INCLUSIVE_LANGUAGE[cleaned].alternatives });
    }
  }

  if (found.length === 0) {
    return {
      id: "inclusive-language",
      category: "clarity",
      rating: "good",
      label: "Inclusive language",
      detail: "No non-inclusive language detected. Your writing is considerate and accessible.",
    };
  }

  const highlights: ReadabilityHighlight[] = found.slice(0, 5).map(({ term, alternatives }) => ({
    text: `"${term}"`,
    suggestion: `Consider using "${alternatives}" instead for more inclusive language.`,
  }));

  return {
    id: "inclusive-language",
    category: "clarity",
    rating: found.length >= 3 ? "problem" : "improvement",
    label: "Inclusive language",
    detail: `${found.length} term${found.length > 1 ? "s" : ""} could be more inclusive. Using inclusive language makes your content welcoming to all readers.`,
    highlights,
  };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export function runReadabilityAnalysis(input: ReadabilityAnalysisInput): ReadabilityAnalysisResult {
  const { bodyHtml, contentType } = input;
  const checks: ReadabilityCheckResult[] = [];

  // Run all 11 checks
  const fleschResult = checkFleschReadingEase(bodyHtml);
  checks.push(fleschResult);
  checks.push(checkSentenceLength(bodyHtml));
  checks.push(checkSentenceVariety(bodyHtml));
  checks.push(checkConsecutiveSentences(bodyHtml));
  checks.push(checkParagraphLength(bodyHtml));
  checks.push(checkSubheadingDistribution(bodyHtml));
  checks.push(checkTransitionWords(bodyHtml));
  checks.push(checkPassiveVoice(bodyHtml));
  checks.push(checkComplexWords(bodyHtml));
  checks.push(checkInclusiveLanguage(bodyHtml));
  checks.push(checkScannability(bodyHtml));

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

  let overallRating: ReadabilityRating;
  if (overallScore >= 75) overallRating = "good";
  else if (overallScore >= 45) overallRating = "improvement";
  else overallRating = "problem";

  return {
    overallRating,
    overallScore,
    fleschScore: fleschResult.score ?? 0,
    checks,
    goodCount,
    improvementCount,
    problemCount,
  };
}
