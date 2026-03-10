import { generateSeoMeta } from "../lib/claude-ai.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * POST /api/ai-seo-meta
 * Accepts JSON: { field, name, pageType, slug, description?, tagline?, excerpt?, category?, city?, listingType? }
 * Returns JSON: { metaTitle?, metaDescription? }
 *
 * Uses Claude AI to generate SEO-optimized meta titles and descriptions.
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

  const { field, name, pageType, slug } = body;

  if (!name || typeof name !== "string") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  if (!field || !["title", "description", "both"].includes(field)) {
    return Response.json(
      { error: 'field must be "title", "description", or "both"' },
      { status: 400 }
    );
  }

  if (!pageType || !["listing", "blog_post", "directory", "blog_category", "page"].includes(pageType)) {
    return Response.json(
      { error: 'pageType must be "listing", "blog_post", "directory", "blog_category", or "page"' },
      { status: 400 }
    );
  }

  try {
    const result = await generateSeoMeta({
      field: field as "title" | "description" | "both",
      name,
      pageType: pageType as "listing" | "blog_post" | "directory" | "blog_category" | "page",
      slug: slug || "",
      description: body.description,
      tagline: body.tagline,
      excerpt: body.excerpt,
      category: body.category,
      city: body.city,
      listingType: body.listingType,
      focusKeyphrase: body.focusKeyphrase,
      currentMetaTitle: body.currentMetaTitle,
      currentMetaDescription: body.currentMetaDescription,
    });

    if (!result) {
      return Response.json(
        { error: "AI generation failed. Check that the Anthropic API key is configured in Settings > Tracking." },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error("AI SEO meta endpoint error:", err);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
