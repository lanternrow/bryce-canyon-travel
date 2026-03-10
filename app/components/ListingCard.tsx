import { Link } from "react-router";
import type { Listing } from "../lib/types";
import StarRating from "./StarRating";
import PriceRange from "./PriceRange";

interface ListingCardProps {
  listing: Listing;
  mediaAlt?: string;
  showPopularityBadge?: boolean;
}

export default function ListingCard({
  listing,
  mediaAlt,
  showPopularityBadge = false,
}: ListingCardProps) {
  const {
    type,
    name,
    slug,
    tagline,
    featured_image,
    price_range,
    avg_rating,
    review_count,
    city,
    category_name,
    is_featured,
    is_popular,
  } = listing;

  return (
    <article className="listing-card group">
      {/* Image */}
      <Link to={`/listing/${type}/${slug}`} className="block relative overflow-hidden">
        {featured_image ? (
          <img
            src={featured_image}
            alt={mediaAlt || name}
            className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-sand/40 via-cream to-stone/30 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-stone/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2">
          {is_featured && (
            <span className="bg-primary text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
              Featured
            </span>
          )}
          {showPopularityBadge && is_popular && (
            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
              Popular
            </span>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="p-4">
        {/* Category & Location row */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          {category_name && (
            <span className="uppercase tracking-wide font-medium text-stone">
              {category_name}
            </span>
          )}
          {city && (
            <span className="flex items-center gap-1">
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

        {/* Name */}
        <h3 className="font-semibold text-dark leading-snug mb-1">
          <Link
            to={`/listing/${type}/${slug}`}
            className="hover:text-primary transition-colors"
          >
            {name}
          </Link>
        </h3>

        {/* Tagline */}
        {tagline && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {tagline}
          </p>
        )}

        {/* Rating & Price */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <StarRating rating={avg_rating} count={review_count} />
          {price_range && <PriceRange range={price_range} />}
        </div>
      </div>
    </article>
  );
}
