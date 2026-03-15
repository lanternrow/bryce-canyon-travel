import { generateImageMeta } from "../lib/claude-ai.server";
import { requireApiAuth } from "../lib/auth.server";

const VALID_FIELDS = ["filename", "alt", "title", "caption", "description", "both", "all"];
const FIELD_ALIASES: Record<string, string> = { alt_text: "alt" };

/**
 * POST /api/ai-image-meta
 * Accepts JSON: { imageUrl, currentFilename?, field, source?, photographerName? }
 * Returns JSON: { filename?, altText?, title?, caption?, description? }
 *
 * Uses Claude Vision to analyze the image and generate SEO-optimized metadata.
 */
export async function action({ request }: { request: Request }) {
  await requireApiAuth(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: {
    imageUrl?: string;
    currentFilename?: string;
    field?: string;
    source?: string;
    photographerName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, currentFilename, source, photographerName } = body;

  // Normalize field name (frontend may send "alt_text" instead of "alt")
  const field = FIELD_ALIASES[body.field || ""] || body.field || "all";

  if (!imageUrl || typeof imageUrl !== "string") {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
  }

  if (!VALID_FIELDS.includes(field)) {
    return Response.json(
      { error: `field must be one of: ${VALID_FIELDS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await generateImageMeta({
      imageUrl,
      currentFilename,
      field: field as "filename" | "alt" | "title" | "caption" | "description" | "both" | "all",
      source: source || null,
      photographerName: photographerName || null,
    });

    if (!result) {
      return Response.json(
        { error: "AI generation failed. Check that the Anthropic API key is configured in Settings → API." },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error("AI image meta endpoint error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred";
    return Response.json(
      { error: msg.includes("API key") ? msg : `AI generation failed: ${msg}` },
      { status: 500 }
    );
  }
}
