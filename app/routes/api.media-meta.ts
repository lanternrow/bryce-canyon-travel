import { getMediaByUrls } from "../lib/queries.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * GET /api/media-meta?url=<image-url>
 * Returns { alt_text, title, caption } for a single media URL.
 * Used by the admin editors to get alt text for SEO analysis.
 */
export async function loader({ request }: { request: Request }) {
  await requireApiAuth(request);

  const imageUrl = new URL(request.url).searchParams.get("url");
  if (!imageUrl) return Response.json({ alt_text: null });

  const records = await getMediaByUrls([imageUrl]);
  if (!records || records.length === 0) return Response.json({ alt_text: null });

  const m = records[0] as any;
  return Response.json({
    alt_text: m.alt_text || null,
    title: m.title || null,
    caption: m.caption || null,
  });
}
