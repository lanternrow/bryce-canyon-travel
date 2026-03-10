import { useMemo, useState } from "react";
import {
  runReadabilityAnalysis,
  type ReadabilityCheckResult,
  type ReadabilityHighlight,
  type ReadabilityRating,
} from "../lib/readability-analysis";
import type { ContentType } from "../lib/seo-analysis";

interface ReadabilityScorecardProps {
  bodyHtml: string;
  contentType: ContentType;
  /** Callback when AI improves the content — parent should update the editor */
  onAiImprove?: (improvedHtml: string) => void;
}

const RATING_COLORS: Record<ReadabilityRating, { dot: string; bg: string; text: string }> = {
  good: { dot: "#22c55e", bg: "bg-emerald-50", text: "text-emerald-700" },
  improvement: { dot: "#f59e0b", bg: "bg-amber-50", text: "text-amber-700" },
  problem: { dot: "#ef4444", bg: "bg-red-50", text: "text-red-700" },
};

type FixCategory = "structure" | "sentence" | "clarity";

const CATEGORY_LABELS: Record<FixCategory, string> = {
  structure: "structure",
  sentence: "sentence",
  clarity: "clarity",
};

/** Flesch score color — more granular than traffic lights */
function fleschColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 60) return "#84cc16";
  if (score >= 50) return "#f59e0b";
  if (score >= 30) return "#f97316";
  return "#ef4444";
}

export default function ReadabilityScorecard({
  bodyHtml,
  contentType,
  onAiImprove,
}: ReadabilityScorecardProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [aiLoadingCategory, setAiLoadingCategory] = useState<FixCategory | null>(null);

  const analysis = useMemo(
    () => runReadabilityAnalysis({ bodyHtml, contentType }),
    [bodyHtml, contentType]
  );

  const overallColor = RATING_COLORS[analysis.overallRating];
  const structureChecks = analysis.checks.filter((c) => c.category === "structure");
  const sentenceChecks = analysis.checks.filter((c) => c.category === "sentence");
  const clarityChecks = analysis.checks.filter((c) => c.category === "clarity");

  const toggleCheck = (id: string) => {
    setExpandedCheck(expandedCheck === id ? null : id);
  };

  const handleAiImproveCategory = async (category: FixCategory) => {
    if (!onAiImprove || aiLoadingCategory) return;

    const categoryIssues = analysis.checks
      .filter((c) => c.category === category && c.rating !== "good")
      .map((c) => ({ id: c.id, label: c.label, detail: c.detail }));

    if (categoryIssues.length === 0) return;

    setAiLoadingCategory(category);
    try {
      const res = await fetch("/api/ai-readability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml,
          contentType,
          issues: categoryIssues,
          fixCategory: category,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.improvedHtml) {
        onAiImprove(data.improvedHtml);
      }
    } catch {
      alert("AI readability improvement failed. Please try again.");
    } finally {
      setAiLoadingCategory(null);
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">Readability</span>
        <div className="flex items-center gap-2">
          {/* Flesch score badge */}
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: fleschColor(analysis.fleschScore) }}
            title={`Flesch Reading Ease: ${analysis.fleschScore}/100`}
          >
            {analysis.fleschScore}<span className="font-normal opacity-75">/100</span>
          </div>
          {/* Overall count */}
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

      <div className="px-4 py-3 space-y-4">
        {/* Structure — fix first (most impactful: paragraphs, headings, lists) */}
        {structureChecks.length > 0 && (
          <CheckGroup
            title="Structure"
            checks={structureChecks}
            expandedCheck={expandedCheck}
            onToggle={toggleCheck}
            onAiFix={
              onAiImprove && structureChecks.some((c) => c.rating !== "good")
                ? () => handleAiImproveCategory("structure")
                : undefined
            }
            aiLoading={aiLoadingCategory === "structure"}
            aiDisabled={aiLoadingCategory !== null && aiLoadingCategory !== "structure"}
          />
        )}

        {/* Sentences — fix second (splits, variety, openings) */}
        {sentenceChecks.length > 0 && (
          <CheckGroup
            title="Sentences"
            checks={sentenceChecks}
            expandedCheck={expandedCheck}
            onToggle={toggleCheck}
            onAiFix={
              onAiImprove && sentenceChecks.some((c) => c.rating !== "good")
                ? () => handleAiImproveCategory("sentence")
                : undefined
            }
            aiLoading={aiLoadingCategory === "sentence"}
            aiDisabled={aiLoadingCategory !== null && aiLoadingCategory !== "sentence"}
          />
        )}

        {/* Clarity — fix last (word swaps, transitions, passive voice) */}
        {clarityChecks.length > 0 && (
          <CheckGroup
            title="Clarity"
            checks={clarityChecks}
            expandedCheck={expandedCheck}
            onToggle={toggleCheck}
            onAiFix={
              onAiImprove && clarityChecks.some((c) => c.rating !== "good")
                ? () => handleAiImproveCategory("clarity")
                : undefined
            }
            aiLoading={aiLoadingCategory === "clarity"}
            aiDisabled={aiLoadingCategory !== null && aiLoadingCategory !== "clarity"}
          />
        )}
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
  onAiFix,
  aiLoading,
  aiDisabled,
}: {
  title: string;
  checks: ReadabilityCheckResult[];
  expandedCheck: string | null;
  onToggle: (id: string) => void;
  onAiFix?: () => void;
  aiLoading?: boolean;
  aiDisabled?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>

      {/* Per-section AI fix button */}
      {onAiFix && (
        <button
          type="button"
          onClick={onAiFix}
          disabled={aiLoading || aiDisabled}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 mb-2 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {aiLoading ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Fixing {title.toLowerCase()}…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI: Fix {title.toLowerCase()} issues
            </>
          )}
        </button>
      )}

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
  check: ReadabilityCheckResult;
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
        {check.score !== undefined && check.id !== "flesch-reading-ease" && (
          <span className="text-[10px] font-medium text-gray-400 mt-0.5 mr-1">{check.score}%</span>
        )}
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
        <div className={`ml-6 mr-2 mb-1.5 rounded-md text-xs leading-relaxed ${color.bg} ${color.text}`}>
          <div className="px-2.5 py-2">{check.detail}</div>

          {/* Specific problem highlights — the "WHAT to change" */}
          {check.highlights && check.highlights.length > 0 && (
            <div className="border-t border-black/5 px-2.5 py-2 space-y-2">
              {check.highlights.map((h, i) => (
                <HighlightRow key={i} highlight={h} rating={check.rating} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function HighlightRow({
  highlight,
  rating,
}: {
  highlight: ReadabilityHighlight;
  rating: ReadabilityRating;
}) {
  const bgClass = rating === "problem" ? "bg-red-100/60" : "bg-amber-100/60";

  return (
    <div className="space-y-0.5">
      <div className={`rounded px-2 py-1 text-[11px] font-mono leading-snug ${bgClass}`}>
        {highlight.text}
      </div>
      {highlight.suggestion && (
        <p className="text-[10px] opacity-80 pl-2">{highlight.suggestion}</p>
      )}
    </div>
  );
}
