import { requireAuth } from "../lib/auth.server";
import { getSettings, createMedia } from "../lib/queries.server";
import { uploadToR2 } from "../lib/storage.server";
import { generateImageMeta } from "../lib/claude-ai.server";
import sql from "../lib/db.server";

/**
 * GET /api/admin/media/pexels — Search Pexels photos
 */
export async function loader({ request }: { request: Request }) {
  await requireAuth(request);

  const settings = await getSettings();
  const PEXELS_API_KEY = settings.pexels_api_key || process.env.PEXELS_API_KEY || "";
  if (!PEXELS_API_KEY) {
    return Response.json(
      { error: "Pexels API key not configured. Add it in Settings → API → Stock Photos." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const page = searchParams.get("page") || "1";
  const perPage = searchParams.get("per_page") || "30";
  const orientation = searchParams.get("orientation");

  if (!query || !query.trim()) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  let pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query.trim())}&page=${page}&per_page=${perPage}`;
  if (orientation) pexelsUrl += `&orientation=${orientation}`;

  const res = await fetch(pexelsUrl, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) {
    console.error("Pexels API error:", res.status);
    return Response.json({ error: "Pexels search failed" }, { status: 502 });
  }

  const data = await res.json();

  const photos = (data.photos || []).map((p: any) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    alt: p.alt || "",
    src: {
      original: p.src.original,
      large2x: p.src.large2x,
      large: p.src.large,
      medium: p.src.medium,
      small: p.src.small,
      tiny: p.src.tiny,
    },
  }));

  // Check which photos are already imported
  const pexelsIds = data.photos.map((p: any) => String(p.id));
  let importedIds: string[] = [];
  if (pexelsIds.length > 0) {
    const imported = await sql`SELECT source_id FROM media WHERE source = 'pexels' AND source_id = ANY(${pexelsIds})`;
    importedIds = (imported as any[]).map((r: any) => r.source_id);
  }

  return Response.json({
    photos,
    totalResults: data.total_results || 0,
    page: data.page || 1,
    perPage: data.per_page || 30,
    hasMore: !!data.next_page,
    importedIds,
  });
}

/**
 * POST /api/admin/media/pexels — Import a Pexels photo
 */
export async function action({ request }: { request: Request }) {
  await requireAuth(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    pexelsId,
    imageUrl,
    longEdge,
    photographer,
    photographerUrl,
    altText,
    originalWidth,
    originalHeight,
    folderId,
  } = body || {};

  if (!imageUrl || !pexelsId) {
    return Response.json({ error: "imageUrl and pexelsId are required" }, { status: 400 });
  }

  const targetLongEdge = longEdge ? Number(longEdge) : null;
  if (targetLongEdge && (!Number.isFinite(targetLongEdge) || targetLongEdge < 100 || targetLongEdge > 6000)) {
    return Response.json({ error: "longEdge must be between 100 and 6000" }, { status: 400 });
  }

  // Check if already imported
  const existing = await sql`
    SELECT id, url FROM media WHERE source = 'pexels' AND source_id = ${String(pexelsId)} LIMIT 1
  `;
  if ((existing as any[]).length > 0) {
    return Response.json(
      { error: "This photo has already been imported", existingId: (existing as any)[0].id, existingUrl: (existing as any)[0].url },
      { status: 409 }
    );
  }

  // Download image from Pexels
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return Response.json({ error: "Failed to download image from Pexels" }, { status: 502 });
  }

  let buffer: Buffer = Buffer.from(await imgRes.arrayBuffer());
  let contentType = imgRes.headers.get("content-type") || "image/jpeg";

  // Resize with sharp if target long edge specified
  if (targetLongEdge && originalWidth && originalHeight) {
    try {
      const sharp = (await import("sharp")).default;
      const isLandscape = originalWidth >= originalHeight;
      const resizeOpts = isLandscape
        ? { width: targetLongEdge }
        : { height: targetLongEdge };

      buffer = await sharp(buffer)
        .resize({ ...resizeOpts, withoutEnlargement: true, fit: "inside" as const })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      contentType = "image/jpeg";
    } catch (sharpErr: any) {
      console.error("Sharp resize error (using original):", sharpErr.message);
    }
  }

  // Upload to R2
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const uploadFilename = `${Date.now()}-pexels-${pexelsId}.${ext}`;
  const blob = new Blob([buffer as any], { type: contentType });
  const file = new File([blob], uploadFilename, { type: contentType });
  const uploaded = await uploadToR2(file);

  // Insert into media table
  const resolvedFolderId = folderId && Number.isFinite(Number(folderId)) ? Number(folderId) : null;

  const rows = await sql`
    INSERT INTO media (
      filename, url, mime_type, size_bytes, alt_text,
      photographer_name, photographer_url, source, source_id, folder_id
    )
    VALUES (
      ${uploadFilename},
      ${uploaded.url},
      ${contentType},
      ${buffer.length},
      ${typeof altText === "string" ? altText.trim() : ""},
      ${typeof photographer === "string" ? photographer : null},
      ${typeof photographerUrl === "string" ? photographerUrl : null},
      ${"pexels"},
      ${String(pexelsId)},
      ${resolvedFolderId}
    )
    RETURNING *
  `;

  const inserted = (rows as any[])?.[0] || null;

  // Auto-generate AI metadata (non-blocking — if it fails the image is still imported)
  if (inserted?.url) {
    try {
      const aiMeta = await generateImageMeta({
        imageUrl: inserted.url,
        currentFilename: inserted.filename,
        field: "all",
        source: "pexels",
        photographerName: typeof photographer === "string" ? photographer : null,
      });

      if (aiMeta) {
        const updated = await sql`
          UPDATE media SET
            filename = COALESCE(${aiMeta.filename ?? null}, filename),
            alt_text = COALESCE(${aiMeta.altText ?? null}, alt_text),
            title = COALESCE(${aiMeta.title ?? null}, title),
            caption = COALESCE(${aiMeta.caption ?? null}, caption),
            description = COALESCE(${aiMeta.description ?? null}, description),
            updated_at = NOW()
          WHERE id = ${inserted.id}
          RETURNING *
        `;
        if ((updated as any[])?.length > 0) {
          return Response.json({ media: (updated as any[])[0] });
        }
      }
    } catch (aiErr: any) {
      console.error("AI auto-generate for Pexels import (non-fatal):", aiErr.message);
    }
  }

  return Response.json({ media: inserted });
}
