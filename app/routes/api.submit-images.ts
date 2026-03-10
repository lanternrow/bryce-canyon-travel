import { getListingBySubmissionToken, createMedia, countMediaInFolder } from "../lib/queries.server";
import { uploadToR2, isR2Configured } from "../lib/storage.server";
import { ensureBusinessSubmissionFolder } from "../lib/submission-folders.server";

const MAX_UPLOADS_PER_TOKEN = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/submit-images
 * Public endpoint — token-based auth (no admin session required).
 * Accepts a single image file per request.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isR2Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const token = formData.get("token") as string | null;
  const file = formData.get("file") as File | null;
  const widthStr = formData.get("width") as string | null;
  const heightStr = formData.get("height") as string | null;

  // ── Validate token ──
  if (!token) {
    return Response.json({ error: "Missing submission token" }, { status: 400 });
  }

  const listing = await getListingBySubmissionToken(token);
  if (!listing) {
    return Response.json({ error: "Invalid or expired submission link" }, { status: 403 });
  }

  // ── Validate file ──
  if (!file || file.size === 0) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "File too large. Maximum 5MB." }, { status: 400 });
  }

  // ── Check upload count limit (before uploading to R2) ──
  const folderId = await ensureBusinessSubmissionFolder(listing.name, listing.slug);
  const currentCount = await countMediaInFolder(folderId);
  if (currentCount >= MAX_UPLOADS_PER_TOKEN) {
    return Response.json(
      { error: `Upload limit reached (${MAX_UPLOADS_PER_TOKEN} images maximum).` },
      { status: 429 }
    );
  }

  try {
    const result = await uploadToR2(file);

    // Parse client-reported dimensions (from Canvas resize)
    const width = widthStr ? parseInt(widthStr, 10) : undefined;
    const height = heightStr ? parseInt(heightStr, 10) : undefined;

    // Auto-generate title from filename
    const autoTitle = result.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Save to media library in the business's submission folder
    await createMedia({
      filename: result.filename,
      url: result.url,
      mime_type: result.mimeType,
      size_bytes: result.size,
      width: width && !isNaN(width) ? width : undefined,
      height: height && !isNaN(height) ? height : undefined,
      title: autoTitle,
      folder_id: folderId,
    });

    return Response.json({
      success: true,
      url: result.url,
      filename: result.filename,
      currentCount: currentCount + 1,
      maxUploads: MAX_UPLOADS_PER_TOKEN,
    });
  } catch (err) {
    console.error("[submit-images] Upload error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
