import { suggestKeyphrase } from "../lib/claude-ai.server";
import { getKeyphraseUsageCounts } from "../lib/queries.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * POST /api/ai-keyphrase
 * Accepts JSON: { bodyHtml, contentType, title, slug, excludeId? }
 * Returns JSON: { keyphrase }
 *
 * Uses Claude AI + keyword reference documents to suggest
 * the best focus keyphrase for a piece of content.
 * Passes keyphrase usage counts so the AI cycles through keywords evenly.
 */
export async function action({ request }: { request: Request }) {
  await requireApiAuth(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { bodyHtml, contentType, title, slug, excludeId } = body;

  if (!bodyHtml || typeof bodyHtml !== "string") {
    return Response.json({ error: "bodyHtml is required" }, { status: 400 });
  }

  if (!contentType || !["blog_post", "listing", "page"].includes(contentType)) {
    return Response.json(
      { error: 'contentType must be "blog_post", "listing", or "page"' },
      { status: 400 }
    );
  }

  try {
    // Fetch keyphrase usage counts, excluding the current content item
    const excludeType = contentType === "blog_post" ? "blog_post" : contentType === "listing" ? "listing" : undefined;
    const keyphraseUsage = await getKeyphraseUsageCounts(
      excludeId || undefined,
      excludeType as "listing" | "blog_post" | undefined,
    );

    const result = await suggestKeyphrase({
      bodyHtml,
      contentType: contentType as "blog_post" | "listing" | "page",
      title: title || "",
      slug: slug || "",
      keyphraseUsage,
    });

    if (!result) {
      return Response.json(
        { error: "AI keyphrase suggestion failed. Check that the Anthropic API key is configured in Settings > Tracking." },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error("AI keyphrase endpoint error:", err);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
