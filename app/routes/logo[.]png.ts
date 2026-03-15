// Serves /logo.png by redirecting to the uploaded dark logo from admin settings.
// This gives schema.org a stable, predictable URL for the publisher logo.

import { getSettings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export async function loader() {
  const settings = await getSettings();
  const logoUrl = settings.logo_dark || settings.logo_light;

  if (!logoUrl) {
    // No logo uploaded — return a 404 with a helpful message
    return new Response("No logo uploaded. Upload one in Admin → Settings → Appearance.", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 302 redirect to the actual Cloudflare-hosted image
  return new Response(null, {
    status: 302,
    headers: {
      Location: logoUrl,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
