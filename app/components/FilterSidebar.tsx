import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { FilterConfig, Category, Location, PriceRange } from "../lib/types";

interface FilterSidebarProps {
  filters: FilterConfig[];
  categories: Category[];
  locations: Location[];
  activeFilters: URLSearchParams;
  onFilterChange: (key: string, value: string | null) => void;
}

const priceOptions: PriceRange[] = ["free", "$", "$$", "$$$", "$$$$"];
const CATEGORY_EXPAND_THRESHOLD = 12;
const LISTING_TYPE_LABELS: Record<string, string> = {
  dining: "Dining",
  lodging: "Lodging",
  experiences: "Experiences",
  hiking: "Hiking",
  transportation: "Transportation",
  parks: "Parks",
  golf: "Golf",
};

export default function FilterSidebar({
  filters,
  categories,
  locations,
  activeFilters,
  onFilterChange,
}: FilterSidebarProps) {
  void onFilterChange;
  const navigate = useNavigate();
  const [categoryListExpanded, setCategoryListExpanded] = useState(false);

  const hasActiveFilters = Array.from(activeFilters.entries()).some(
    ([key]) => key !== "page" && key !== "sort"
  );

  const listingTypeOptions = useMemo(
    () =>
      Array.from(new Set(categories.map((c) => c.listing_type)))
        .filter(Boolean)
        .map((type) => ({ value: type, label: LISTING_TYPE_LABELS[type] || type }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories]
  );

  const selectedListingType = activeFilters.get("listing_type") || "";

  const visibleCategories = useMemo(() => {
    const filtered = selectedListingType
      ? categories.filter((c) => c.listing_type === selectedListingType)
      : categories;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, selectedListingType]);

  const shouldShowExpand = visibleCategories.length > CATEGORY_EXPAND_THRESHOLD;

  function clearAllFilters() {
    const sort = activeFilters.get("sort");
    const params = new URLSearchParams();
    if (sort) params.set("sort", sort);
    navigate(`?${params.toString()}`, { replace: true });
  }

  function getActiveValues(key: string): string[] {
    return activeFilters.getAll(key);
  }

  function isValueActive(key: string, value: string): boolean {
    return getActiveValues(key).includes(value);
  }

  function toggleCheckbox(key: string, value: string) {
    const params = new URLSearchParams(activeFilters);
    const values = params.getAll(key);
    params.delete(key);
    params.delete("page");

    if (values.includes(value)) {
      values.filter((v) => v !== value).forEach((v) => params.append(key, v));
    } else {
      values.forEach((v) => params.append(key, v));
      params.append(key, value);
    }

    navigate(`?${params.toString()}`, { replace: true });
  }

  function togglePrice(price: string) {
    const params = new URLSearchParams(activeFilters);
    const values = params.getAll("price_range");
    params.delete("price_range");
    params.delete("page");

    if (values.includes(price)) {
      values.filter((v) => v !== price).forEach((v) => params.append("price_range", v));
    } else {
      values.forEach((v) => params.append("price_range", v));
      params.append("price_range", price);
    }

    navigate(`?${params.toString()}`, { replace: true });
  }

  function toggleBoolean(key: string) {
    const params = new URLSearchParams(activeFilters);
    params.delete("page");

    if (params.get(key) === "true") {
      params.delete(key);
    } else {
      params.set(key, "true");
    }

    navigate(`?${params.toString()}`, { replace: true });
  }

  function handleSelectChange(key: string, value: string) {
    const params = new URLSearchParams(activeFilters);
    params.delete("page");

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (key === "listing_type") {
      const existingCategorySlugs = params.getAll("category");
      params.delete("category");
      if (existingCategorySlugs.length > 0) {
        const allowedSlugs = new Set(
          categories
            .filter((c) => !value || c.listing_type === value)
            .map((c) => c.slug)
        );
        for (const slug of existingCategorySlugs) {
          if (allowedSlugs.has(slug)) params.append("category", slug);
        }
      }
      setCategoryListExpanded(false);
    }

    navigate(`?${params.toString()}`, { replace: true });
  }

  return (
    <aside className="w-full" aria-label="Filters">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-dark">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="space-y-1">
        {/* Category filter -- always present if categories exist */}
        {categories.length > 0 && (
          <details className="filter-section border-b border-gray-200" open>
            <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
              <span>Category</span>
              <svg
                className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="pb-3">
              {listingTypeOptions.length > 1 && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Main Category</label>
                  <select
                    value={selectedListingType}
                    onChange={(e) => handleSelectChange("listing_type", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                  >
                    <option value="">All Categories</option>
                    {listingTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {visibleCategories.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 py-1">No subcategories available.</p>
              ) : (
                <>
                  <div
                    className={`space-y-1.5 ${
                      !categoryListExpanded && shouldShowExpand
                        ? "max-h-64 overflow-y-auto pr-1 bg-gray-50 border border-gray-200 rounded-md p-2"
                        : ""
                    }`}
                  >
                    {visibleCategories.map((cat) => {
                      const active = isValueActive("category", cat.slug);
                      return (
                        <label
                          key={cat.id}
                          className="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleCheckbox("category", cat.slug)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/50 cursor-pointer"
                          />
                          <span className={`text-sm ${active ? "font-medium text-dark" : "text-gray-700"}`}>
                            {cat.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {shouldShowExpand && (
                    <button
                      type="button"
                      onClick={() => setCategoryListExpanded((prev) => !prev)}
                      className="text-xs font-medium text-primary hover:text-primary/80 px-1 pt-1"
                    >
                      {categoryListExpanded ? "Collapse list" : "Expand list"}
                    </button>
                  )}
                </>
              )}
            </div>
          </details>
        )}

        {/* Location filter -- dropdown select */}
        {locations.length > 0 && (
          <details className="filter-section border-b border-gray-200" open>
            <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
              <span>Location</span>
              <svg
                className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="pb-3">
              <select
                value={activeFilters.get("location") || ""}
                onChange={(e) => handleSelectChange("location", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.slug}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </details>
        )}

        {/* Dynamic filters from config */}
        {filters.map((filter) => {
          // Price range filter
          if (filter.type === "price") {
            const activePrices = getActiveValues("price_range");
            return (
              <details key={filter.key} className="filter-section border-b border-gray-200" open>
                <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
                  <span>{filter.label}</span>
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pb-3 flex flex-wrap gap-2">
                  {priceOptions.map((price) => (
                    <button
                      key={price}
                      onClick={() => togglePrice(price)}
                      className={`price-btn ${activePrices.includes(price) ? "active" : ""}`}
                    >
                      {price === "free" ? "Free" : price}
                    </button>
                  ))}
                </div>
              </details>
            );
          }

          // Toggle / boolean filter
          if (filter.type === "toggle") {
            const isActive = activeFilters.get(filter.key) === "true";
            return (
              <details key={filter.key} className="filter-section border-b border-gray-200" open>
                <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
                  <span>{filter.label}</span>
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pb-3 px-1">
                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <span className="text-sm text-gray-700">{filter.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      onClick={() => toggleBoolean(filter.key)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        isActive ? "bg-primary" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                          isActive ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </details>
            );
          }

          // Select filter
          if (filter.type === "select" && filter.options) {
            return (
              <details key={filter.key} className="filter-section border-b border-gray-200" open>
                <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
                  <span>{filter.label}</span>
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pb-3">
                  <select
                    value={activeFilters.get(filter.key) || ""}
                    onChange={(e) => handleSelectChange(filter.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
                  >
                    <option value="">All {filter.label}</option>
                    {filter.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </details>
            );
          }

          // Checkbox filter (default)
          if (filter.type === "checkbox" && filter.options) {
            return (
              <details key={filter.key} className="filter-section border-b border-gray-200" open>
                <summary className="flex items-center justify-between py-3 text-sm font-semibold text-dark select-none">
                  <span>{filter.label}</span>
                  <svg
                    className="w-4 h-4 text-gray-400 transition-transform [[open]>&]:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pb-3 space-y-1.5">
                  {filter.options.map((opt) => {
                    const active = isValueActive(filter.key, opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2.5 py-1 px-1 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleCheckbox(filter.key, opt.value)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/50 cursor-pointer"
                        />
                        <span className={`text-sm ${active ? "font-medium text-dark" : "text-gray-700"}`}>
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          }

          return null;
        })}
      </div>
    </aside>
  );
}
