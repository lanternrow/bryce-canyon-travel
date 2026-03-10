import type { PriceRange as PriceRangeType } from "../lib/types";

interface PriceRangeProps {
  range: PriceRangeType;
}

const levels: PriceRangeType[] = ["$", "$$", "$$$", "$$$$"];

export default function PriceRange({ range }: PriceRangeProps) {
  if (range === "free") {
    return (
      <span
        className="inline-flex items-center text-sm font-medium text-emerald-600"
        aria-label="Price range: Free"
      >
        Free
      </span>
    );
  }

  const activeCount = levels.indexOf(range) + 1;

  return (
    <span
      className="inline-flex items-center text-sm font-medium tracking-tight"
      aria-label={`Price range: ${range}`}
    >
      {levels.map((level, i) => (
        <span
          key={level}
          className={
            i < activeCount
              ? "text-dark"
              : "text-gray-300"
          }
        >
          $
        </span>
      ))}
    </span>
  );
}
