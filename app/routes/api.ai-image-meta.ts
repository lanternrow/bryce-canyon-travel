import { generateImageMeta } from "../lib/claude-ai.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * POST /api/ai-image-meta
 * Accepts JSON: { imageUrl, currentFilename?, field: "filename" | "alt" | "both" }
 * Returns JSON: { filename?, altText? }
 *
 * Uses Claude Vision to analyze the image and generate SEO-optimized metadata.
 */
export async function action({ request }: { request: Request }) {
  await requireApiAuth(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { imageUrl?: string; currentFilename?: string; field?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, currentFilename, field } = body;

  if (!imageUrl || typeof imageUrl !== "string") {
    return Response.json({ error: "imageUrl is required" }, { status: 400 });
  }

  if (!field || !["filename", "alt", "both"].includes(field)) {
    return Response.json(
      { error: 'field must be "filename", "alt", or "both"' },
      { status: 400 }
    );
  }

  try {
    const result = await generateImageMeta({
      imageUrl,
      currentFilename,
      field: field as "filename" | "alt" | "both",
    });

    if (!result) {
      return Response.json(
        { error: "AI generation failed. Check that the Anthropic API key is configured in Settings > Tracking." },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error("AI image meta endpoint error:", err);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
