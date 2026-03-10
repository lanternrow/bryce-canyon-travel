import { redirect } from "react-router";
import type { Route } from "./+types/redirect-taxonomy";

// Map old WordPress /at_biz_dir-category/{slug} taxonomy pages
// to the appropriate filtered directory page
const categoryTaxonomyMap: Record<string, string> = {
  // Dining categories → current DB slugs
  "american-traditional": "/dining?category=american-restaurant",
  "bars-pubs": "/dining?category=brewery-bar",
  "breakfast-brunch": "/dining?category=cafe-bakery",
  "cafes-coffee": "/dining?category=cafe-bakery",
  "chinese": "/dining?category=asian-restaurant",
  "fast-food": "/dining?category=fast-food",
  "fine-dining": "/dining?category=fine-dining",
  "italian": "/dining?category=italian",
  "mexican": "/dining?category=mexican",
  "pizza": "/dining?category=pizza",
  "thai": "/dining?category=asian-restaurant",

  // Lodging categories → current DB slugs
  "bed-and-breakfasts": "/lodging?category=bb-inn",
  "cabins": "/lodging?category=cabin",
  "campgrounds-rv-parks": "/lodging?category=campground&category=rv-park",
  "glamping": "/lodging?category=glamping",
  "hotels-motels": "/lodging?category=hotel&category=motel",
  "resorts": "/lodging?category=resort",
  "vacation-rentals": "/lodging?category=vacation-rental",

  // Experiences categories → current DB slugs
  "atv-utv-tours": "/experiences?category=atv-off-road",
  "bike-rentals": "/experiences?category=ebike-tour",
  "canyoneering": "/experiences?category=canyoneering",
  "guided-tours": "/experiences?category=tour-operator",
  "helicopter-tours": "/experiences?category=tour-operator",
  "tubing": "/experiences?category=river-activity",
  "water-sports": "/experiences?category=river-activity",
};

export function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug;

  if (slug && categoryTaxonomyMap[slug]) {
    throw redirect(categoryTaxonomyMap[slug], 301);
  }

  // Generic fallback: try to redirect to a reasonable directory
  // If category slug contains food/dining terms, go to dining, etc.
  if (slug) {
    // Default fallback to home with a gentle redirect
    throw redirect("/", 301);
  }

  throw new Response("Not Found", { status: 404 });
}

export default function RedirectTaxonomy() {
  return null;
}
