// ============================================
// ZION TRAVEL — TypeScript Types
// ============================================

export type ListingType = "dining" | "lodging" | "experiences" | "hiking" | "transportation" | "parks" | "golf";
export type ListingStatus = "draft" | "pending" | "published" | "archived";
export type PriceRange = "free" | "$" | "$$" | "$$$" | "$$$$";
export type DifficultyLevel = "easy" | "moderate" | "hard" | "expert";
export type TrailType = "out_and_back" | "loop" | "point_to_point";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface Location {
  id: number;
  name: string;
  slug: string;
  lat?: number;
  lng?: number;
  description?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  listing_type: ListingType;
  parent_id?: number;
  icon?: string;
  description?: string;
}

export interface Amenity {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  category?: string;
}

export interface Listing {
  id: string;
  type: ListingType;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  category_slug?: string;
  location_id?: number;
  location_name?: string;
  location_slug?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  has_no_phone?: boolean;
  has_no_google_place_id?: boolean;
  email?: string;
  website?: string;
  featured_image?: string;
  gallery?: string[];
  video_url?: string;
  price_range?: PriceRange;
  price_from?: number;
  price_to?: number;
  status: ListingStatus;
  is_featured: boolean;
  owner_id?: string;
  view_count: number;
  views_30d?: number;
  is_popular?: boolean;
  popularity_refreshed_at?: string;
  avg_rating: number;
  review_count: number;
  google_place_id?: string;
  google_maps_uri?: string;
  google_primary_type?: string;
  google_types?: string[];
  // SEO
  meta_title?: string;
  meta_description?: string;
  focus_keyphrase?: string;
  submission_token?: string;
  created_at: string;
  updated_at: string;
  // Joined amenities
  amenities?: Amenity[];
  // Joined business hours
  business_hours?: BusinessHours[];
}

export interface Media {
  id: string;
  filename: string;
  url: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  alt_text?: string;
  title?: string;
  caption?: string;
  description?: string;
  folder_id?: number | null;
  uploaded_at: string;
  updated_at?: string;
}

export interface MediaFolder {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface MediaUsage {
  id: number;
  media_url: string;
  entity_type: "listing" | "blog_post";
  entity_id: string;
  usage_type: "featured_image" | "gallery" | "inline";
  entity_name?: string;
  created_at: string;
}

export interface DiningDetails {
  listing_id: string;
  cuisine_type?: string;
  serves_alcohol?: boolean;
  outdoor_seating?: boolean;
  reservations_accepted?: boolean;
  reservation_url?: string;
  menu_url?: string;
  delivery_available?: boolean;
  takeout_available?: boolean;
  group_size_max?: number;
}

export interface LodgingDetails {
  listing_id: string;
  lodging_type?: string;
  rooms_count?: number;
  check_in_time?: string;
  check_out_time?: string;
  booking_url?: string;
  pet_friendly?: boolean;
  group_size_max?: number;
}

export interface ExperienceDetails {
  listing_id: string;
  experience_type?: string;
  duration?: string;
  group_size_min?: number;
  group_size_max?: number;
  age_minimum?: number;
  skill_level?: string;
  season_start?: string;
  season_end?: string;
  booking_url?: string;
  gear_provided?: boolean;
  gear_list?: string;
}

export type DogPolicy = "not_allowed" | "on_leash" | "off_leash";
export type EntryRequirement = "none" | "entry_fee" | "permit";

export interface HikingDetails {
  listing_id: string;
  difficulty?: DifficultyLevel;
  trail_type?: TrailType;
  distance_miles?: number;
  distance_miles_max?: number;  // optional upper bound for range (e.g., 4.6-12)
  elevation_gain_ft?: number;
  estimated_time?: string;
  trailhead_lat?: number;
  trailhead_lng?: number;
  trailhead_address?: string;
  entry_requirement?: EntryRequirement; // "none" | "entry_fee" | "permit"
  permit_info?: string;
  dog_policy?: DogPolicy; // "not_allowed" | "on_leash" | "off_leash"
  season_start?: string;
  season_end?: string;
  water_available?: boolean;
  shade_level?: string;
  kid_friendly?: boolean;
  surface_type?: string;  // "rock", "paved", "gravel", "dirt", "native", etc.
  data_sources?: string; // comma-separated: "NPS,OSM,RIDB,BLM,USFS,USGS,Wikidata,AI"
  // Deprecated — kept for backward compat during migration reads
  permit_required?: boolean;
  dogs_allowed?: boolean;
}

export interface ParkDetails {
  listing_id: string;
  // Entry Fees & Passes
  entry_fee?: string;
  annual_pass_accepted?: boolean;
  fee_free_info?: string;
  // Operating Info
  park_hours?: string;
  visitor_center_hours?: string;
  seasonal_closure?: string;
  // Park Stats
  elevation_ft?: number;
  acreage?: number;
  year_established?: number;
  governing_agency?: string;
  // Visitor Facilities
  has_visitor_center?: boolean;
  has_campgrounds?: boolean;
  has_scenic_drives?: boolean;
  has_restrooms?: boolean;
  has_wheelchair_access?: boolean;
  has_cell_service?: boolean;
  // Special Notices
  notices?: string;
  // Shared fields
  entry_requirement?: EntryRequirement;
  dog_policy?: DogPolicy;
  season_start?: string;
  season_end?: string;
  water_available?: boolean;
  kid_friendly?: boolean;
  // Data provenance
  data_sources?: string;
}

export interface TransportationDetails {
  listing_id: string;
  transport_type?: string;
  service_area?: string;
  operates_seasonally?: boolean;
  season_start?: string;
  season_end?: string;
  booking_url?: string;
  group_size_max?: number;
}

export interface BusinessHours {
  id: number;
  listing_id: string;
  day: DayOfWeek;
  open_time?: string;
  close_time?: string;
  is_closed: boolean;
  note?: string;
}

export interface Review {
  id: string;
  listing_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  rating: number;
  title?: string;
  body?: string;
  photos?: string[];
  status: string;
  created_at: string;
}

// Filter types for directory pages
export interface DirectoryFilters {
  search?: string;
  category?: string;
  location?: string;
  price_range?: PriceRange[];
  amenities?: string[];
  sort?: string;
  page?: number;
  // Hiking-specific
  difficulty?: DifficultyLevel[];
  dog_policy?: string;
  kid_friendly?: boolean;
  entry_requirement?: string;
  // Experience-specific
  group_size?: number;
  gear_provided?: boolean;
}

// Config for each directory type
export interface DirectoryConfig {
  type: ListingType | "all";
  title: string;
  subtitle: string;
  heroImage: string;
  slug: string;
  filters: FilterConfig[];
}

export interface FilterConfig {
  key: string;
  label: string;
  type: "checkbox" | "range" | "select" | "toggle" | "price";
  options?: { label: string; value: string }[];
}
