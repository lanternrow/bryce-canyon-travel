import { Link } from "react-router";
import type { Listing } from "../lib/types";
import StarRating from "./StarRating";
import PriceRange from "./PriceRange";

interface ListingListItemProps {
  listing: Listing;
}

export default function ListingListItem({ listing }: ListingListItemProps) {
  const {
    type,
    name,
    slug,
    tagline,
    price_range,
    avg_rating,
    review_count,
    city,
    category_name,
    is_featured,
    is_popular,
  } = listing;

  return (
    <article className="border border-gray-200 rounded-xl bg-white p-4 sm:p-5 hover:border-sand/60 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {category_name && (
            <span className="uppercase tracking-wide font-medium text-stone text-xs truncate">
              {category_name}
            </span>
          )}
          {is_featured && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
              Featured
            </span>
          )}
          {is_popular && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              Popular
            </span>
          )}
        </div>
        {city && (
          <span className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
            {city}
          </span>
        )}
      </div>

      <h3 className="font-semibold text-dark leading-snug mb-1.5 text-xl">
        <Link
          to={`/listing/${type}/${slug}`}
          className="hover:text-primary transition-colors"
        >
          {name}
        </Link>
      </h3>

      {tagline && (
        <p className="text-base text-gray-600 line-clamp-2 mb-3">
          {tagline}
        </p>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        <StarRating rating={avg_rating} count={review_count} />
        {price_range && <PriceRange range={price_range} />}
      </div>
    </article>
  );
}
