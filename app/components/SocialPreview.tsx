import { useState } from "react";
import { siteConfig } from "../lib/site-config";

interface SocialPreviewProps {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

function ImagePlaceholder() {
  return (
    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400">
      <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span className="text-xs">No image set</span>
    </div>
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return new URL(siteConfig.siteUrl).hostname;
  }
}

function FacebookPreview({ title, description, image, url }: SocialPreviewProps) {
  const domain = getDomain(url);

  return (
    <div className="max-w-[500px] rounded-sm overflow-hidden" style={{ border: "1px solid #dadde1" }}>
      {/* Image */}
      <div className="aspect-[1.91/1] bg-gray-200 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImagePlaceholder />
        )}
      </div>
      {/* Text area */}
      <div className="p-3" style={{ backgroundColor: "#f2f3f5", borderTop: "1px solid #dadde1" }}>
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#606770" }}>
          {domain}
        </div>
        <div className="text-sm font-semibold truncate" style={{ color: "#1d2129" }}>
          {title || "Page Title"}
        </div>
        <div className="text-xs line-clamp-2 mt-0.5" style={{ color: "#606770" }}>
          {description || "No description set."}
        </div>
      </div>
    </div>
  );
}

function TwitterPreview({ title, description, image, url }: SocialPreviewProps) {
  const domain = getDomain(url);

  return (
    <div className="max-w-[500px] rounded-2xl overflow-hidden border border-gray-200">
      {/* Image */}
      <div className="aspect-[2/1] bg-gray-200 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImagePlaceholder />
        )}
      </div>
      {/* Text area */}
      <div className="p-3">
        <div className="text-sm font-bold text-gray-900 truncate">
          {title || "Page Title"}
        </div>
        <div className="text-sm text-gray-500 line-clamp-2 mt-0.5">
          {description || "No description set."}
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span className="text-xs text-gray-400">{domain}</span>
        </div>
      </div>
    </div>
  );
}

export default function SocialPreview(props: SocialPreviewProps) {
  const [platform, setPlatform] = useState<"facebook" | "twitter">("facebook");

  return (
    <div>
      {/* Header with label + tabs */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Social Preview
        </span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setPlatform("facebook")}
            className={`px-2.5 py-1 rounded ${
              platform === "facebook"
                ? "bg-white shadow-sm text-gray-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() => setPlatform("twitter")}
            className={`px-2.5 py-1 rounded ${
              platform === "twitter"
                ? "bg-white shadow-sm text-gray-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            X / Twitter
          </button>
        </div>
      </div>

      {/* Preview card */}
      {platform === "facebook" ? (
        <FacebookPreview {...props} />
      ) : (
        <TwitterPreview {...props} />
      )}
    </div>
  );
}
