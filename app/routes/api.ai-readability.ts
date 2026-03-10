import { improveReadability } from "../lib/claude-ai.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * POST /api/ai-readability
 * Accepts JSON: { bodyHtml, contentType, issues }
 * Returns JSON: { improvedHtml? }
 *
 * Uses Claude AI to rewrite content with better readability
 * while preserving meaning, HTML structure, and SEO keywords.
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

  const { bodyHtml, contentType, issues, fixCategory } = body;

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
    const result = await improveReadability({
      bodyHtml,
      contentType: contentType as "blog_post" | "listing" | "page",
      issues: Array.isArray(issues) ? issues : [],
      fixCategory: fixCategory || undefined,
    });

    if (!result) {
      return Response.json(
        { error: "AI readability improvement failed. Check that the Anthropic API key is configured in Settings > Tracking." },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error("AI readability endpoint error:", err);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
