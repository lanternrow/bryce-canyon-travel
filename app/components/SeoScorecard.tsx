import { useMemo, useState } from "react";
import { Link } from "react-router";
import { runSeoAnalysis, type ContentType, type SeoCheckResult, type SeoRating } from "../lib/seo-analysis";

export interface KeyphraseDuplicate {
  id: string;
  title: string;
  type: "blog_post" | "listing" | string;
  editUrl: string;
}

interface SeoScorecardProps {
  focusKeyphrase: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  bodyHtml: string;
  contentType: ContentType;
  featuredImageAlt?: string;
  featuredImage?: string;
  /** External website URL (e.g. from listing contact info) — counted as outbound link */
  websiteUrl?: string;
  /** Other content items already using the same focus keyphrase */
  duplicateKeyphrases?: KeyphraseDuplicate[];
}

const RATING_COLORS: Record<SeoRating, { dot: string; bg: string; text: string }> = {
  good: { dot: "#22c55e", bg: "bg-emerald-50", text: "text-emerald-700" },
  improvement: { dot: "#f59e0b", bg: "bg-amber-50", text: "text-amber-700" },
  problem: { dot: "#ef4444", bg: "bg-red-50", text: "text-red-700" },
};

export default function SeoScorecard({
  focusKeyphrase,
  metaTitle,
  metaDescription,
  slug,
  bodyHtml,
  contentType,
  featuredImageAlt,
  featuredImage,
  websiteUrl,
  duplicateKeyphrases,
}: SeoScorecardProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const analysis = useMemo(
    () =>
      runSeoAnalysis({
        contentType,
        focusKeyphrase,
        metaTitle,
        metaDescription,
        slug,
        bodyHtml,
        featuredImageAlt,
        featuredImage,
        websiteUrl,
      }),
    [contentType, focusKeyphrase, metaTitle, metaDescription, slug, bodyHtml, featuredImageAlt, featuredImage, websiteUrl]
  );

  const hasKeyphrase = focusKeyphrase.trim().length > 0;
  const keyphraseChecks = analysis.checks.filter((c) => c.category === "keyphrase");
  const contentChecks = analysis.checks.filter((c) => c.category === "content");
  const overallColor = RATING_COLORS[analysis.overallRating];

  const toggleCheck = (id: string) => {
    setExpandedCheck(expandedCheck === id ? null : id);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">SEO Analysis</span>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: overallColor.dot }}
          >
            {analysis.goodCount}
          </div>
          <span className="text-xs font-medium" style={{ color: overallColor.dot }}>
            {analysis.overallRating === "good"
              ? "Good"
              : analysis.overallRating === "improvement"
                ? "OK"
                : "Needs work"}
          </span>
          <span className="text-xs text-gray-400">
            {analysis.goodCount}/{analysis.checks.length}
          </span>
        </div>
      </div>

      {/* Duplicate keyphrase warning */}
      {duplicateKeyphrases && duplicateKeyphrases.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2.5 rounded-md bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-1">
            ⚠ Focus keyphrase already used
          </p>
          <p className="text-[11px] text-amber-700 leading-relaxed mb-1.5">
            This keyphrase is also used by {duplicateKeyphrases.length === 1 ? "another item" : `${duplicateKeyphrases.length} other items`}. Using the same keyphrase on multiple pages causes keyword cannibalization.
          </p>
          <ul className="space-y-0.5">
            {duplicateKeyphrases.map((dup) => (
              <li key={dup.id} className="text-[11px]">
                <Link to={dup.editUrl} className="text-amber-800 underline hover:text-amber-900">
                  {dup.title}
                </Link>
                <span className="text-amber-500 ml-1">({dup.type === "blog_post" ? "News article" : "Listing"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 py-3 space-y-4">
        {/* Keyphrase Checks */}
        {hasKeyphrase && keyphraseChecks.length > 0 && (
          <CheckGroup title="Keyphrase" checks={keyphraseChecks} expandedCheck={expandedCheck} onToggle={toggleCheck} />
        )}
        {!hasKeyphrase && (
          <div className="pt-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Keyphrase</p>
            <p className="text-xs text-gray-400 italic">Set a focus keyphrase above to see keyphrase analysis.</p>
          </div>
        )}

        {/* Content Checks */}
        <CheckGroup title="Content" checks={contentChecks} expandedCheck={expandedCheck} onToggle={toggleCheck} />
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────

function CheckGroup({
  title,
  checks,
  expandedCheck,
  onToggle,
}: {
  title: string;
  checks: SeoCheckResult[];
  expandedCheck: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <ul className="space-y-0.5">
        {checks.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            isExpanded={expandedCheck === check.id}
            onToggle={() => onToggle(check.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function CheckRow({
  check,
  isExpanded,
  onToggle,
}: {
  check: SeoCheckResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const color = RATING_COLORS[check.rating];

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 text-left py-1.5 px-2 rounded-md hover:bg-white/60 transition-colors group"
      >
        <span
          className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color.dot }}
        />
        <span className="text-xs text-gray-700 leading-snug flex-1">{check.label}</span>
        <svg
          className={`w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className={`ml-6 mr-2 mb-1.5 px-2.5 py-2 rounded-md text-xs leading-relaxed ${color.bg} ${color.text}`}>
          {check.detail}
        </div>
      )}
    </li>
  );
}
