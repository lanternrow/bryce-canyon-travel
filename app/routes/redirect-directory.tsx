import { redirect } from "react-router";
import type { Route } from "./+types/redirect-directory";

// Map old WordPress /directory/{slug} URLs to new /listing/{type}/{slug} URLs
// This covers all 69 listings from the live site
const directoryRedirectMap: Record<string, string> = {
  // === DINING (27) ===
  "zion-canyon-brew-pub": "/listing/dining/zion-canyon-brew-pub",
  "cactus-room": "/listing/dining/cactus-room",
  "balcony-one": "/listing/dining/balcony-one",
  "the-park-house": "/listing/dining/the-park-house",
  "kings-landing-bistro": "/listing/dining/kings-landing-bistro",
  "dulivia-ristorante-italiano": "/listing/dining/dulivia-ristorante-italiano",
  "jacks-sports-grill": "/listing/dining/jacks-sports-grill",
  "switchback-grille": "/listing/dining/switchback-grille",
  "bit-spur-restaurant-saloon": "/listing/dining/bit-spur-restaurant-saloon",
  "memes-cafe": "/listing/dining/memes-cafe",
  "oscars-cafe": "/listing/dining/oscars-cafe",
  porters: "/listing/dining/porters",
  "zion-pizza-noodle-co": "/listing/dining/zion-pizza-noodle-co",
  "bamboo-chinese-restaurant": "/listing/dining/bamboo-chinese-restaurant",
  "camp-outpost": "/listing/dining/camp-outpost",
  "whiptail-grill": "/listing/dining/whiptail-grill",
  "feellove-coffee-zion": "/listing/dining/feellove-coffee-zion",
  "perks-coffee-espresso-smoothies-in-zion":
    "/listing/dining/perks-coffee-espresso-smoothies-in-zion",
  anthera: "/listing/dining/anthera",
  "cafe-soleil": "/listing/dining/cafe-soleil",
  "thai-sapa": "/listing/dining/thai-sapa",
  subway: "/listing/dining/subway",
  "slice-of-zion": "/listing/dining/slice-of-zion",
  "red-rock-grill": "/listing/dining/red-rock-grill",
  "castle-dome-cafe": "/listing/dining/castle-dome-cafe",
  "spotted-dog-cafe": "/listing/dining/spotted-dog-cafe",
  "deep-creek-coffee-company": "/listing/dining/deep-creek-coffee-company",

  // === LODGING (22) ===
  "best-western-plus-zion-canyon-inn-suites":
    "/listing/lodging/best-western-plus-zion-canyon-inn-suites",
  "hampton-inn-and-suites-zion-national-park":
    "/listing/lodging/hampton-inn-and-suites-zion-national-park",
  "east-zion-rv-park": "/listing/lodging/east-zion-rv-park",
  "desert-pearl-inn": "/listing/lodging/desert-pearl-inn",
  "clear-creek-ranch": "/listing/lodging/clear-creek-ranch",
  "canyon-vista-lodge": "/listing/lodging/canyon-vista-lodge",
  "harvest-house-bed-breakfast":
    "/listing/lodging/harvest-house-bed-breakfast",
  "moenave-townhomes": "/listing/lodging/moenave-townhomes",
  "zion-canyon-campground-and-rv-resort":
    "/listing/lodging/zion-canyon-campground-and-rv-resort",
  "watchman-campground": "/listing/lodging/watchman-campground",
  "zion-pioneer-lodge": "/listing/lodging/zion-pioneer-lodge",
  "zion-park-motel": "/listing/lodging/zion-park-motel",
  "sand-hollow-resort": "/listing/lodging/sand-hollow-resort",
  "under-canvas-zion": "/listing/lodging/under-canvas-zion",
  "cliffrose-springdale": "/listing/lodging/cliffrose-springdale",
  "the-dwellings": "/listing/lodging/the-dwellings",
  "zion-ponderosa-ranch-resort":
    "/listing/lodging/zion-ponderosa-ranch-resort",
  "cable-mountain-lodge": "/listing/lodging/cable-mountain-lodge",
  "watchman-villas": "/listing/lodging/watchman-villas",
  "flanigans-villas": "/listing/lodging/flanigans-villas",
  "driftwood-lodge": "/listing/lodging/driftwood-lodge",
  "zion-hummingbird-villa": "/listing/lodging/zion-hummingbird-villa",

  // === HIKING (11) ===
  "cottonwood-trailhead": "/listing/hiking/cottonwood-trailhead",
  "diamond-valley-cinder-cone": "/listing/hiking/diamond-valley-cinder-cone",
  "owens-loop": "/listing/hiking/owens-loop",
  "370": "/listing/hiking/370", // Yant Flat (old WP used numeric slug)
  "red-reef-trail": "/listing/hiking/red-reef-trail",
  "parus-trail": "/listing/hiking/parus-trail",
  "jolley-gulch": "/listing/hiking/jolley-gulch",
  "canyon-overlook-trail": "/listing/hiking/canyon-overlook-trail",
  "babylon-arch-trail": "/listing/hiking/babylon-arch-trail",
  "three-falls-trailhead": "/listing/hiking/three-falls-trailhead",
  "emerald-pools-trail": "/listing/hiking/emerald-pools-trail",

  // === EXPERIENCES (9) ===
  "southern-utah-adventure-center":
    "/listing/experiences/southern-utah-adventure-center",
  "ride-zion-adventures": "/listing/experiences/ride-zion-adventures",
  "mad-moose-rentals": "/listing/experiences/mad-moose-rentals",
  "sand-hollow-rentals": "/listing/experiences/sand-hollow-rentals",
  "zion-helicopters": "/listing/experiences/zion-helicopters",
  "east-zion-adventures": "/listing/experiences/east-zion-adventures",
  "zion-peddler": "/listing/experiences/zion-peddler",
  "ebikes-zion": "/listing/experiences/ebikes-zion",
  "zion-tubing": "/listing/experiences/zion-tubing",
};

export function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug;

  if (slug && directoryRedirectMap[slug]) {
    throw redirect(directoryRedirectMap[slug], 301);
  }

  // If we don't have a mapping, 404
  throw new Response("Not Found", { status: 404 });
}

// This component should never render (loader always redirects or 404s)
export default function RedirectDirectory() {
  return null;
}
