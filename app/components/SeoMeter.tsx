import { extractKeywords } from "../lib/seo-analysis";

interface SeoMeterProps {
  /** The current meta text value */
  value: string;
  /** Which field this meter is for */
  field: "title" | "description";
  /** Page content (title, headings, body) for keyword overlap check */
  pageContent?: string;
}

/** Get zone info based on character count and field type */
function getZone(
  length: number,
  field: "title" | "description"
): {
  color: string;
  label: string;
  position: number; // 0-100 percentage across the meter
} {
  if (field === "title") {
    // Title zones: 0-20 red, 20-35 orange, 35-60 green, 60-65 orange, 65+ red
    const max = 80;
    const pos = Math.min((length / max) * 100, 100);

    if (length === 0) return { color: "#9ca3af", label: "Enter a meta title", position: 0 };
    if (length < 20) return { color: "#ef4444", label: "Too short — add more detail", position: pos };
    if (length < 35) return { color: "#f59e0b", label: "Getting there — could be longer", position: pos };
    if (length <= 60) return { color: "#22c55e", label: "Good length", position: pos };
    if (length <= 65) return { color: "#f59e0b", label: "A bit long — may get truncated", position: pos };
    return { color: "#ef4444", label: "Too long — will be cut off in search results", position: pos };
  } else {
    // Description zones: 0-70 red, 70-120 orange, 120-160 green, 160-170 orange, 170+ red
    const max = 200;
    const pos = Math.min((length / max) * 100, 100);

    if (length === 0) return { color: "#9ca3af", label: "Enter a meta description", position: 0 };
    if (length < 70) return { color: "#ef4444", label: "Too short — add more detail", position: pos };
    if (length < 120) return { color: "#f59e0b", label: "Getting there — could be longer", position: pos };
    if (length <= 160) return { color: "#22c55e", label: "Good length", position: pos };
    if (length <= 170) return { color: "#f59e0b", label: "A bit long — may get truncated", position: pos };
    return { color: "#ef4444", label: "Too long — will be cut off in search results", position: pos };
  }
}

export default function SeoMeter({ value, field, pageContent }: SeoMeterProps) {
  const length = value.length;
  const recommended = field === "title" ? 60 : 160;
  const zone = getZone(length, field);

  // Keyword overlap check
  let keywordInfo: { found: number; total: number } | null = null;
  if (pageContent && value.length > 0) {
    const keywords = extractKeywords(pageContent);
    if (keywords.length > 0) {
      const valueLower = value.toLowerCase();
      const found = keywords.filter((kw) => valueLower.includes(kw)).length;
      keywordInfo = { found, total: keywords.length };
    }
  }

  // Gradient stops for the meter bar
  const gradient =
    field === "title"
      ? "linear-gradient(to right, #ef4444 0%, #ef4444 25%, #f59e0b 25%, #f59e0b 43%, #22c55e 43%, #22c55e 75%, #f59e0b 75%, #f59e0b 81%, #ef4444 81%, #ef4444 100%)"
      : "linear-gradient(to right, #ef4444 0%, #ef4444 35%, #f59e0b 35%, #f59e0b 60%, #22c55e 60%, #22c55e 80%, #f59e0b 80%, #f59e0b 85%, #ef4444 85%, #ef4444 100%)";

  return (
    <div className="mt-1.5">
      {/* Meter bar */}
      <div className="relative h-2.5 rounded-full" style={{ background: gradient }}>
        {/* Marker */}
        {length > 0 && (
          <div
            className="absolute top-1/2 w-4.5 h-4.5 rounded-full border-[2.5px] border-white transition-all duration-200"
            style={{
              left: `${zone.position}%`,
              transform: `translate(-50%, -50%)`,
              backgroundColor: zone.color,
              boxShadow: `0 1px 3px rgba(0,0,0,0.25), 0 0 0 1px ${zone.color}33`,
            }}
          />
        )}
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs" style={{ color: zone.color }}>
            {zone.label}
          </span>
          {keywordInfo && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                keywordInfo.found >= Math.ceil(keywordInfo.total * 0.5)
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {keywordInfo.found}/{keywordInfo.total} key terms
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
          {length}/{recommended}
        </span>
      </div>
    </div>
  );
}
