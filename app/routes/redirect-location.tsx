import { redirect } from "react-router";
import type { Route } from "./+types/redirect-location";

// Map old WordPress /at_biz_dir-location/{slug} taxonomy pages
// to the appropriate filtered directory page (defaults to lodging with location filter)
const locationTaxonomyMap: Record<string, string> = {
  springdale: "/lodging?location=springdale",
  "hurricane-ut": "/lodging?location=hurricane",
  hurricane: "/lodging?location=hurricane",
  kanab: "/lodging?location=kanab",
  "st-george": "/lodging?location=st-george",
  "virgin-ut": "/lodging?location=virgin",
  virgin: "/lodging?location=virgin",
  "la-verkin": "/lodging?location=la-verkin",
  orderville: "/lodging?location=orderville",
  "mount-carmel": "/lodging?location=mount-carmel",
  "zion-national-park": "/lodging?location=zion-national-park",
};

export function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug;

  if (slug && locationTaxonomyMap[slug]) {
    throw redirect(locationTaxonomyMap[slug], 301);
  }

  // Generic fallback: redirect to lodging (the most location-specific directory)
  if (slug) {
    throw redirect("/lodging", 301);
  }

  throw new Response("Not Found", { status: 404 });
}

export default function RedirectLocation() {
  return null;
}
