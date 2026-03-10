-- ============================================
-- ZION TRAVEL — Database Schema
-- ============================================

-- Locations (towns/areas near Zion)
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (cuisine types, accommodation types, etc.)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('dining', 'lodging', 'experiences', 'hiking', 'transportation')),
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, listing_type)
);

-- Amenities
CREATE TABLE IF NOT EXISTS amenities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  category TEXT
);

-- Core listings table
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL CHECK (type IN ('dining', 'lodging', 'experiences', 'hiking', 'transportation')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'UT',
  zip TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  phone TEXT,
  has_no_phone BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT,
  website TEXT,
  featured_image TEXT,
  gallery TEXT[] DEFAULT '{}',
  video_url TEXT,
  price_range TEXT CHECK (price_range IN ('$', '$$', '$$$', '$$$$')),
  price_from NUMERIC,
  price_to NUMERIC,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'pending', 'published', 'archived')),
  is_featured BOOLEAN DEFAULT FALSE,
  owner_id TEXT,
  view_count INTEGER DEFAULT 0,
  views_30d INTEGER NOT NULL DEFAULT 0,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  popularity_refreshed_at TIMESTAMPTZ,
  avg_rating NUMERIC(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  google_place_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(type, slug)
);

-- Junction: listing <-> amenities
CREATE TABLE IF NOT EXISTS listing_amenities (
  listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
  amenity_id INTEGER REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, amenity_id)
);

-- Business hours
CREATE TABLE IF NOT EXISTS business_hours (
  id SERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  open_time TEXT,
  close_time TEXT,
  is_closed BOOLEAN DEFAULT FALSE,
  note TEXT,
  UNIQUE(listing_id, day)
);

-- Type-specific detail tables
CREATE TABLE IF NOT EXISTS dining_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  cuisine_type TEXT,
  serves_alcohol BOOLEAN,
  outdoor_seating BOOLEAN,
  reservations_accepted BOOLEAN,
  reservation_url TEXT,
  menu_url TEXT,
  delivery_available BOOLEAN,
  takeout_available BOOLEAN,
  group_size_max INTEGER
);

CREATE TABLE IF NOT EXISTS lodging_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  lodging_type TEXT,
  rooms_count INTEGER,
  check_in_time TEXT,
  check_out_time TEXT,
  booking_url TEXT,
  pet_friendly BOOLEAN,
  group_size_max INTEGER
);

CREATE TABLE IF NOT EXISTS experience_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  experience_type TEXT,
  duration TEXT,
  group_size_min INTEGER,
  group_size_max INTEGER,
  age_minimum INTEGER,
  skill_level TEXT,
  season_start TEXT,
  season_end TEXT,
  booking_url TEXT,
  gear_provided BOOLEAN,
  gear_list TEXT
);

CREATE TABLE IF NOT EXISTS hiking_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
  trail_type TEXT CHECK (trail_type IN ('out_and_back', 'loop', 'point_to_point')),
  distance_miles NUMERIC,
  elevation_gain_ft INTEGER,
  estimated_time TEXT,
  trailhead_lat DOUBLE PRECISION,
  trailhead_lng DOUBLE PRECISION,
  trailhead_address TEXT,
  permit_required BOOLEAN,
  permit_info TEXT,
  dogs_allowed BOOLEAN,
  season_start TEXT,
  season_end TEXT,
  water_available BOOLEAN,
  shade_level TEXT,
  kid_friendly BOOLEAN,
  data_sources TEXT
);

CREATE TABLE IF NOT EXISTS transportation_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  transport_type TEXT,
  service_area TEXT,
  operates_seasonally BOOLEAN,
  season_start TEXT,
  season_end TEXT,
  booking_url TEXT,
  group_size_max INTEGER
);

-- Google Reviews Cache
CREATE TABLE IF NOT EXISTS google_reviews_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  google_place_id TEXT NOT NULL,
  place_rating NUMERIC(2,1),
  place_review_count INTEGER,
  reviews JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id)
);

-- Blog categories
CREATE TABLE IF NOT EXISTS blog_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blog posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT,
  author TEXT DEFAULT 'Zion Travel Editorial',
  category_id INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
  category TEXT,
  category_slug TEXT,
  featured_image TEXT,
  read_time TEXT,
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  focus_keyphrase TEXT,
  views_30d INTEGER NOT NULL DEFAULT 0,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  popularity_refreshed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'scheduled', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media folders (hierarchical)
CREATE TABLE IF NOT EXISTS media_folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES media_folders(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media library
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  title TEXT,
  caption TEXT,
  description TEXT,
  folder_id INTEGER REFERENCES media_folders(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media usage tracking
CREATE TABLE IF NOT EXISTS media_usage (
  id SERIAL PRIMARY KEY,
  media_url TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Site settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pages (JSONB content for homepage, etc.)
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(type);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_type_status ON listings(type, status);
CREATE INDEX IF NOT EXISTS idx_listings_slug ON listings(slug);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_featured ON listings(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_google_reviews_listing ON google_reviews_cache(listing_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category_id ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_is_popular_true ON blog_posts(is_popular) WHERE is_popular = TRUE;
CREATE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(listing_type);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_media_folder_id ON media(folder_id);
CREATE INDEX IF NOT EXISTS idx_listings_is_popular_true ON listings(is_popular) WHERE is_popular = TRUE;
