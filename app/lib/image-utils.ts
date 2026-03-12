// ============================================
// CLOUDFLARE IMAGE TRANSFORMATIONS
// ============================================
// Wraps R2 image URLs with Cloudflare's /cdn-cgi/image/ prefix
// to serve resized, optimized images (WebP/AVIF auto-negotiation).
//
// Only activates for absolute https:// URLs (production R2 images).
// Local dev images (relative /uploads/...) pass through unchanged.
//
// Enable in Cloudflare Dashboard:
//   Account → Media → Images → Transformations → Enable
//
// Docs: https://developers.cloudflare.com/images/transform-images/transform-via-url/

export interface ImageTransformOptions {
  /** Max width in pixels */
  width?: number;
  /** Max height in pixels */
  height?: number;
  /** JPEG/WebP/AVIF quality 1-100 (default: 75) */
  quality?: number;
  /** Output format — "auto" negotiates WebP/AVIF with browser (default: "auto") */
  format?: "auto" | "webp" | "avif" | "jpeg" | "png";
  /** Resize mode (default: "scale-down") */
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
  /** Focal-point gravity for crop/cover (default: "auto") */
  gravity?: "auto" | "face" | "left" | "right" | "top" | "bottom";
}

/**
 * Wrap an image URL with Cloudflare Image Transformations.
 *
 * Returns a `/cdn-cgi/image/.../<original-url>` path that Cloudflare
 * intercepts at the edge and serves an optimised variant.
 *
 * - Only transforms absolute `https://` URLs (R2 public URLs).
 * - Relative paths (local dev) pass through unchanged.
 * - If no options are provided, returns the original URL unchanged.
 *
 * Usage:
 *   cfImage(url, { width: 400, quality: 75 })
 *   // → /cdn-cgi/image/width=400,quality=75,format=auto/https://pub-...r2.dev/uploads/img.jpg
 */
export function cfImage(
  src: string | null | undefined,
  options: ImageTransformOptions = {}
): string {
  // Nothing to transform
  if (!src) return "";

  // Only transform absolute URLs (production R2 images).
  // Local dev images (/uploads/...) are left as-is.
  if (!src.startsWith("https://")) return src;

  // Build the options string
  const parts: string[] = [];

  if (options.width) parts.push(`width=${options.width}`);
  if (options.height) parts.push(`height=${options.height}`);
  parts.push(`quality=${options.quality ?? 75}`);
  parts.push(`format=${options.format ?? "auto"}`);
  if (options.fit) parts.push(`fit=${options.fit}`);
  if (options.gravity) parts.push(`gravity=${options.gravity}`);

  // No meaningful options → return original
  if (parts.length === 0) return src;

  return `/cdn-cgi/image/${parts.join(",")}/${src}`;
}

// ============================================
// PRESET HELPERS
// ============================================

/** Hero banner — full-width, high quality */
export function cfHero(src: string | null | undefined): string {
  return cfImage(src, { width: 1600, quality: 80, fit: "cover" });
}

/** Listing/blog card thumbnail */
export function cfCard(src: string | null | undefined): string {
  return cfImage(src, { width: 480, quality: 75 });
}

/** Gallery image — medium size */
export function cfGallery(src: string | null | undefined): string {
  return cfImage(src, { width: 900, quality: 80 });
}

/** Small thumbnail (avatars, tiny previews) */
export function cfThumb(src: string | null | undefined): string {
  return cfImage(src, { width: 200, quality: 70 });
}
