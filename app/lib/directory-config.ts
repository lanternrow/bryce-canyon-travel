import type { DirectoryConfig, FilterConfig } from "./types";
import { siteConfig } from "./site-config";

// Shared filters used across multiple directories
const priceFilter: FilterConfig = {
  key: "price_range",
  label: "Price Range",
  type: "price",
  options: [
    { label: "Free", value: "free" },
    { label: "$", value: "$" },
    { label: "$$", value: "$$" },
    { label: "$$$", value: "$$$" },
    { label: "$$$$", value: "$$$$" },
  ],
};

const locationFilter: FilterConfig = {
  key: "location",
  label: "Location",
  type: "select",
  // options populated from DB
};

// Directory configurations
export const directories: Record<string, DirectoryConfig> = {
  listings: {
    type: "all",
    title: "All Listings",
    subtitle: `Browse every dining, lodging, experience, hiking, transportation, park, and golf listing near ${siteConfig.parkName}`,
    heroImage: "",
    slug: "listings",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Category",
        type: "checkbox",
      },
    ],
  },

  dining: {
    type: "dining",
    title: "Dining",
    subtitle: `Restaurants, cafes, and eateries near ${siteConfig.parkName}`,
    heroImage: "",
    slug: "dining",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Cuisine Type",
        type: "checkbox",
      },
      {
        key: "amenities",
        label: "Features",
        type: "checkbox",
        options: [
          { label: "Outdoor Seating", value: "outdoor-seating" },
          { label: "Full Bar", value: "full-bar" },
          { label: "Reservations", value: "reservations" },
          { label: "Takeout", value: "takeout" },
          { label: "Delivery", value: "delivery" },
          { label: "Vegan Options", value: "vegan-options" },
          { label: "Gluten-Free Options", value: "gluten-free" },
          { label: "Kids Menu", value: "kids-menu" },
          { label: "Live Entertainment", value: "live-entertainment" },
          { label: "Pet Friendly", value: "pet-friendly" },
        ],
      },
    ],
  },

  lodging: {
    type: "lodging",
    title: "Lodging",
    subtitle: `Hotels, cabins, campgrounds, and more near ${siteConfig.parkName}`,
    heroImage: "",
    slug: "lodging",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Accommodation Type",
        type: "checkbox",
      },
      {
        key: "amenities",
        label: "Amenities",
        type: "checkbox",
        options: [
          { label: "Swimming Pool", value: "swimming-pool" },
          { label: "Hot Tub", value: "hot-tub" },
          { label: "Free WiFi", value: "free-wifi" },
          { label: "Free Parking", value: "free-parking" },
          { label: "Pet Friendly", value: "pet-friendly" },
          { label: "Kitchen", value: "kitchen" },
          { label: "Fitness Center", value: "fitness-center" },
          { label: "Continental Breakfast", value: "continental-breakfast" },
          { label: "Fire Pit", value: "fire-pit" },
          { label: "Scenic Views", value: "scenic-views" },
          { label: "EV Charging", value: "ev-charging" },
          { label: "Wheelchair Accessible", value: "wheelchair-accessible" },
        ],
      },
    ],
  },

  experiences: {
    type: "experiences",
    title: "Experiences",
    subtitle: `Tours, guides, rentals, and adventures around ${siteConfig.parkName}`,
    heroImage: "",
    slug: "experiences",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Activity Type",
        type: "checkbox",
      },
      {
        key: "group_size",
        label: "Group Size",
        type: "select",
        options: [
          { label: "Solo (1)", value: "1" },
          { label: "Small (2-4)", value: "4" },
          { label: "Medium (5-10)", value: "10" },
          { label: "Large (11+)", value: "11" },
        ],
      },
      {
        key: "gear_provided",
        label: "Gear Provided",
        type: "toggle",
      },
    ],
  },

  hiking: {
    type: "hiking",
    title: "Hiking",
    subtitle: `Trails, viewpoints, and hikes in and around ${siteConfig.parkName}`,
    heroImage: "",
    slug: "hiking",
    filters: [
      locationFilter,
      {
        key: "difficulty",
        label: "Difficulty",
        type: "checkbox",
        options: [
          { label: "Easy", value: "easy" },
          { label: "Moderate", value: "moderate" },
          { label: "Hard", value: "hard" },
          { label: "Expert", value: "expert" },
        ],
      },
      {
        key: "category",
        label: "Trail Type",
        type: "checkbox",
      },
      {
        key: "dog_policy",
        label: "Dog Policy",
        type: "checkbox",
        options: [
          { label: "On Leash", value: "on_leash" },
          { label: "Off Leash", value: "off_leash" },
        ],
      },
      {
        key: "kid_friendly",
        label: "Kid Friendly",
        type: "toggle",
      },
      {
        key: "entry_requirement",
        label: "Entry",
        type: "checkbox",
        options: [
          { label: "Free Entry", value: "none" },
          { label: "Entry Fee", value: "entry_fee" },
          { label: "Permit Required", value: "permit" },
        ],
      },
    ],
  },

  transportation: {
    type: "transportation",
    title: "Transportation",
    subtitle: `Shuttles, rentals, and getting around ${siteConfig.parkName}`,
    heroImage: "",
    slug: "transportation",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Service Type",
        type: "checkbox",
      },
    ],
  },
  parks: {
    type: "parks",
    title: "Parks & Landscapes",
    subtitle: `National parks, state parks, monuments, and scenic landscapes near ${siteConfig.parkName}`,
    heroImage: "",
    slug: "parks",
    filters: [
      locationFilter,
      {
        key: "category",
        label: "Park Type",
        type: "checkbox",
      },
      {
        key: "amenities",
        label: "Features",
        type: "checkbox",
        options: [
          { label: "Visitor Center", value: "visitor-center" },
          { label: "Campgrounds", value: "campgrounds" },
          { label: "Scenic Drives", value: "scenic-drives" },
          { label: "Wheelchair Accessible", value: "wheelchair-accessible" },
          { label: "Pet Friendly", value: "pet-friendly" },
          { label: "Restrooms", value: "restrooms" },
        ],
      },
    ],
  },
  golf: {
    type: "golf",
    title: "Golf Courses",
    subtitle: `Golf courses and driving ranges near ${siteConfig.parkName} and ${siteConfig.regionName.toLowerCase()}`,
    heroImage: "",
    slug: "golf",
    filters: [
      locationFilter,
      priceFilter,
      {
        key: "category",
        label: "Course Type",
        type: "checkbox",
      },
    ],
  },
};

export function getDirectoryConfig(slug: string): DirectoryConfig | undefined {
  return directories[slug];
}

export function getAllDirectories(): DirectoryConfig[] {
  return Object.values(directories);
}
