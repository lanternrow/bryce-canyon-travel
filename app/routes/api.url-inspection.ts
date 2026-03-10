// API route for checking URL indexing status via Google Search Console
// Admin-only: requires authentication

import { getSession } from "../lib/auth.server";
import { getSettings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";
import { inspectUrl } from "../lib/search-console.server";

export async function loader({ request }: { request: Request }) {
  // Check auth without redirecting (this is a fetcher-loaded API route)
  const user = await getSession(request);
  if (!user) {
    return Response.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const inspectionUrl = url.searchParams.get("url");

  if (!inspectionUrl) {
    return Response.json(
      { success: false, error: "Missing url parameter" },
      { status: 400 }
    );
  }

  try {
    const settings = await getSettings();
    const siteUrl = settings.gsc_site_url || siteConfig.siteUrl;

    const result = await inspectUrl(siteUrl, inspectionUrl);
    return Response.json(result);
  } catch (error) {
    console.error("[URL Inspection] Unexpected error:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
