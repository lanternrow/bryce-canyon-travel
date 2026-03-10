import { useState } from "react";
import { siteConfig } from "../lib/site-config";

interface SerpPreviewProps {
  title: string;
  url: string;
  description: string;
  /** Featured image for mobile thumbnail */
  image?: string | null;
  /** Site name shown in favicon row (default: siteConfig.siteName) */
  siteName?: string;
  /** Custom favicon URL. Falls back to "Z" circle when not provided. */
  favicon?: string | null;
}

export default function SerpPreview({
  title,
  url,
  description,
  image,
  siteName = siteConfig.siteName,
  favicon,
}: SerpPreviewProps) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");

  // Truncate to match Google's rendering
  const displayTitle = title.length > 60 ? title.slice(0, 57) + "..." : title;
  const displayDesc =
    description.length > 160 ? description.slice(0, 157) + "..." : description;

  // Format URL as breadcrumb style: example.com › dining › bit-and-spur
  const formatUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.replace(/^www\./, "");
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length === 0) return host;
      return `${host} › ${segments.join(" › ")}`;
    } catch {
      return rawUrl;
    }
  };

  // Extract just the hostname for favicon row
  const getHost = (rawUrl: string) => {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, "");
    } catch {
      return new URL(siteConfig.siteUrl).hostname;
    }
  };

  const isDesktop = mode === "desktop";

  return (
    <div>
      {/* Header with label + toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Google Preview
        </span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setMode("desktop")}
            className={`p-1.5 rounded ${isDesktop ? "bg-white shadow-sm text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
            title="Desktop preview"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMode("mobile")}
            className={`p-1.5 rounded ${!isDesktop ? "bg-white shadow-sm text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
            title="Mobile preview"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* SERP card */}
      <div
        className={`bg-white rounded-lg border border-gray-200 p-4 shadow-sm font-[Arial,Roboto,HelveticaNeue,sans-serif] ${
          isDesktop ? "max-w-[600px]" : "max-w-[360px]"
        }`}
      >
        {/* Row 1: Favicon + site name */}
        <div className="flex items-center gap-2 mb-2.5">
          {favicon ? (
            <img
              src={favicon}
              alt=""
              className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0"
              style={{ border: "1px solid #dadce0" }}
            />
          ) : (
            <div
              className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-gray-100 flex-shrink-0"
              style={{ border: "1px solid #dadce0" }}
            >
              <span className="text-[11px] font-bold text-primary leading-none">Z</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm text-[#202124] leading-tight truncate">
              {siteName}
            </div>
            <div className="text-xs text-[#4d5156] leading-tight truncate">
              {getHost(url)}
            </div>
          </div>
        </div>

        {/* Row 2: Title */}
        <div
          className="truncate mb-0.5"
          style={{
            color: isDesktop ? "#1a0dab" : "#1558d6",
            fontSize: isDesktop ? "20px" : "18px",
            lineHeight: 1.3,
          }}
        >
          {displayTitle || "Page Title"}
        </div>

        {/* Row 3: URL breadcrumb */}
        <div
          className="text-xs truncate mb-1"
          style={{ color: "#4d5156", lineHeight: 1.4 }}
        >
          {formatUrl(url) || new URL(siteConfig.siteUrl).hostname}
        </div>

        {/* Row 4: Description (with optional mobile thumbnail) */}
        <div className="flex gap-3">
          <div
            className={`line-clamp-2 ${!isDesktop && image ? "flex-1" : ""}`}
            style={{
              color: isDesktop ? "#4d5156" : "#70757a",
              fontSize: isDesktop ? "14px" : "12px",
              lineHeight: isDesktop ? "1.58" : "20px",
            }}
          >
            {displayDesc || "No description set. Add a meta description or tagline."}
          </div>
          {/* Mobile thumbnail */}
          {!isDesktop && image && (
            <img
              src={image}
              alt=""
              className="w-[92px] h-[92px] rounded-lg object-cover flex-shrink-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
