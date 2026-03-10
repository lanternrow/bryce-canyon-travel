import { uploadToR2, isR2Configured } from "../lib/storage.server";
import { createMedia } from "../lib/queries.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * POST /api/upload-image
 * Accepts multipart/form-data with a "file" field.
 * Uploads to R2, saves to media table, returns JSON with the public URL.
 */
export async function action({ request }: { request: Request }) {
  await requireApiAuth(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isR2Configured()) {
    return Response.json(
      { error: "Image storage is not configured. Set R2 environment variables." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  // Validate file size (max 10MB)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }

  try {
    const result = await uploadToR2(file);

    // Auto-generate title from filename: "angels-landing-sunset.jpg" → "Angels Landing Sunset"
    const autoTitle = result.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Save to media library
    await createMedia({
      filename: result.filename,
      url: result.url,
      mime_type: result.mimeType,
      size_bytes: result.size,
      title: autoTitle,
    });

    return Response.json({
      url: result.url,
      filename: result.filename,
      size: result.size,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
