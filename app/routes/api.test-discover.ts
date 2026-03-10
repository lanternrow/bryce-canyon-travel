import sql from "~/lib/db.server";
import { requireApiAuth } from "../lib/auth.server";
import { siteConfig } from "../lib/site-config";

export async function loader({ request }: { request: Request }) {
  await requireApiAuth(request);

  const settings = await sql`SELECT value FROM settings WHERE key = 'google_places_api_key'`;
  const apiKey = settings[0]?.value;

  if (!apiKey) {
    return Response.json({ error: "No API key" });
  }

  const textQuery = `restaurants dining cafes food in ${siteConfig.gatewayTowns[0]} ${siteConfig.stateFull}`;
  const fieldMask = [
    "places.id", "places.displayName", "places.formattedAddress",
    "places.types", "places.primaryType",
  ].join(",");

  const body = {
    textQuery,
    locationBias: {
      circle: {
        center: { latitude: siteConfig.mapCenter.lat, longitude: siteConfig.mapCenter.lng },
        radius: 15000,
      },
    },
    pageSize: 5,
  };

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = null;
    }

    return Response.json({
      keyPrefix: apiKey.substring(0, 10),
      query: textQuery,
      httpStatus: res.status,
      responseBody: parsed || responseText.substring(0, 500),
      resultCount: parsed?.places?.length || 0,
      firstResult: parsed?.places?.[0]?.displayName?.text || null,
    });
  } catch (err: any) {
    return Response.json({ error: err.message });
  }
}
