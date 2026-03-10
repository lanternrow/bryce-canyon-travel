// GET /api/check-keyphrase?keyphrase=...&excludeId=...&excludeType=blog_post|listing
// Returns JSON: { duplicates: [{ id, title, type, editUrl }] }

import { findDuplicateKeyphrases } from "../lib/queries.server";
import { requireApiAuth } from "../lib/auth.server";

export async function loader({ request }: { request: Request }) {
  await requireApiAuth(request);

  const url = new URL(request.url);
  const keyphrase = url.searchParams.get("keyphrase")?.trim() || "";
  const excludeId = url.searchParams.get("excludeId") || null;
  const excludeType = url.searchParams.get("excludeType") || null;

  if (!keyphrase) {
    return Response.json({ duplicates: [] });
  }

  try {
    const duplicates = await findDuplicateKeyphrases(keyphrase, excludeId, excludeType);
    return Response.json({ duplicates });
  } catch (error) {
    console.error("Keyphrase check error:", error);
    return Response.json({ duplicates: [] });
  }
}
