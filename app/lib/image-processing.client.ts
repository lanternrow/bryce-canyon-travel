/**
 * Client-side image validation, resize, and WebP conversion.
 * Uses the Canvas API — no server-side dependencies needed.
 */

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface ProcessingError {
  type: "too_small" | "not_image" | "too_large" | "processing_failed";
  message: string;
}

const MIN_WIDTH = 1200;
const MIN_HEIGHT = 900;
const MAX_LONGEST_SIDE = 2048;
const MAX_RAW_SIZE = 5 * 1024 * 1024; // 5MB
const WEBP_QUALITY = 0.85;
const JPEG_FALLBACK_QUALITY = 0.85;

/**
 * Validates, resizes, and converts an image file for submission.
 * - Rejects files < 1200x900 or > 5MB
 * - Resizes to max 2048px on longest side
 * - Converts to WebP (JPEG fallback for older browsers)
 */
export async function processImageForSubmission(
  file: File
): Promise<{ ok: true; data: ProcessedImage } | { ok: false; error: ProcessingError }> {
  // Size gate
  if (file.size > MAX_RAW_SIZE) {
    return {
      ok: false,
      error: {
        type: "too_large",
        message: `File exceeds ${MAX_RAW_SIZE / 1024 / 1024}MB limit.`,
      },
    };
  }

  // Type gate
  if (!file.type.startsWith("image/")) {
    return {
      ok: false,
      error: {
        type: "not_image",
        message: "Only image files (JPEG, PNG, WebP) are accepted.",
      },
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // Dimension gate
      if (origW < MIN_WIDTH || origH < MIN_HEIGHT) {
        resolve({
          ok: false,
          error: {
            type: "too_small",
            message: `Image is ${origW}\u00D7${origH}px. Minimum required: ${MIN_WIDTH}\u00D7${MIN_HEIGHT}px.`,
          },
        });
        return;
      }

      // Calculate resize dimensions (fit within 2048 on longest side)
      let newW = origW;
      let newH = origH;
      const longest = Math.max(origW, origH);
      if (longest > MAX_LONGEST_SIDE) {
        const scale = MAX_LONGEST_SIDE / longest;
        newW = Math.round(origW * scale);
        newH = Math.round(origH * scale);
      }

      // Draw onto canvas
      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({
          ok: false,
          error: { type: "processing_failed", message: "Canvas not available." },
        });
        return;
      }
      ctx.drawImage(img, 0, 0, newW, newH);

      // Convert to blob — try WebP first, fall back to JPEG
      const tryFormat = (mimeType: string, quality: number): Promise<Blob | null> => {
        return new Promise((res) => {
          canvas.toBlob((blob) => res(blob), mimeType, quality);
        });
      };

      (async () => {
        let blob = await tryFormat("image/webp", WEBP_QUALITY);

        // Fallback: some browsers (older Safari) don't support WebP export
        if (!blob || blob.size === 0) {
          blob = await tryFormat("image/jpeg", JPEG_FALLBACK_QUALITY);
        }

        if (!blob) {
          resolve({
            ok: false,
            error: { type: "processing_failed", message: "Failed to process image." },
          });
          return;
        }

        resolve({
          ok: true,
          data: {
            blob,
            width: newW,
            height: newH,
            originalWidth: origW,
            originalHeight: origH,
          },
        });
      })();
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        ok: false,
        error: { type: "not_image", message: "Could not read image file. Make sure it's a valid JPEG, PNG, or WebP." },
      });
    };

    img.src = objectUrl;
  });
}
