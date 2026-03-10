interface StarRatingProps {
  rating: number;
  count?: number;
}

export default function StarRating({ rating, count }: StarRatingProps) {
  const clampedRating = Math.max(0, Math.min(5, rating));

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center" aria-label={`${clampedRating.toFixed(1)} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => {
          const fill = Math.max(0, Math.min(1, clampedRating - i));
          return (
            <span key={i} className="relative inline-block w-4 h-4">
              {/* Empty star (background) */}
              <svg
                className="absolute inset-0 w-4 h-4 star-empty"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {/* Filled star (clipped by fill percentage) */}
              {fill > 0 && (
                <svg
                  className="absolute inset-0 w-4 h-4 star-filled"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
            </span>
          );
        })}
      </div>
      {typeof count === "number" && (
        <span className="text-sm text-gray-500">
          ({count.toLocaleString()})
        </span>
      )}
    </div>
  );
}
