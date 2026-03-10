-- ============================================
-- ZION TRAVEL — Database Schema
-- Neon Serverless Postgres
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy text search

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE listing_status AS ENUM ('draft', 'pending', 'published', 'archived');
CREATE TYPE listing_type AS ENUM ('dining', 'lodging', 'experiences', 'hiking', 'transportation');
CREATE TYPE price_range AS ENUM ('free', '$', '$$', '$$$', '$$$$');
CREATE TYPE difficulty_level AS ENUM ('easy', 'moderate', 'hard', 'expert');
CREATE TYPE trail_type AS ENUM ('out_and_back', 'loop', 'point_to_point');
CREATE TYPE user_role AS ENUM ('admin', 'business_owner', 'visitor');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'flagged', 'removed');
CREATE TYPE day_of_week AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'visitor',
  phone VARCHAR(50),
  bio TEXT,
  social_links JSONB DEFAULT '{}',
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- CATEGORIES (per listing type)
-- ============================================

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  listing_type listing_type NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  icon VARCHAR(100),
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slug, listing_type)
);

CREATE INDEX idx_categories_type ON categories(listing_type);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- ============================================
-- LOCATIONS (towns/areas)
-- ============================================

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  lat DECIMAL(10, 7),
  lng DECIMAL(10, 7),
  description TEXT,
  display_order INTEGER DEFAULT 0
);

-- ============================================
-- AMENITIES
-- ============================================

CREATE TABLE amenities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  icon VARCHAR(100),
  category VARCHAR(100), -- e.g. 'general', 'lodging', 'dining', 'outdoor'
  display_order INTEGER DEFAULT 0
);

-- ============================================
-- LISTINGS — Base table (shared fields)
-- ============================================

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type listing_type NOT NULL,
  name VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  tagline VARCHAR(500),
  description TEXT,

  -- Category & Location
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,

  -- Address
  address VARCHAR(500),
  city VARCHAR(255),
  state VARCHAR(100) DEFAULT 'UT',
  zip VARCHAR(20),
  lat DECIMAL(10, 7),
  lng DECIMAL(10, 7),

  -- Contact
  phone VARCHAR(50),
  has_no_phone BOOLEAN NOT NULL DEFAULT false,
  email VARCHAR(255),
  website VARCHAR(500),

  -- Media
  featured_image TEXT,
  gallery JSONB DEFAULT '[]',
  video_url VARCHAR(500),

  -- Pricing
  price_range price_range,
  price_from DECIMAL(10, 2),
  price_to DECIMAL(10, 2),

  -- Status & ownership
  status listing_status NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- SEO
  meta_title VARCHAR(500),
  meta_description VARCHAR(1000),

  -- Stats
  view_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3, 2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(slug, type)
);

CREATE INDEX idx_listings_type ON listings(type);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_location ON listings(location_id);
CREATE INDEX idx_listings_featured ON listings(is_featured);
CREATE INDEX idx_listings_owner ON listings(owner_id);
CREATE INDEX idx_listings_slug ON listings(slug);
CREATE INDEX idx_listings_price_range ON listings(price_range);
CREATE INDEX idx_listings_avg_rating ON listings(avg_rating);
CREATE INDEX idx_listings_name_trgm ON listings USING gin(name gin_trgm_ops);

-- ============================================
-- TYPE-SPECIFIC DETAIL TABLES
-- ============================================

-- DINING details
CREATE TABLE dining_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  cuisine_type VARCHAR(255),
  serves_alcohol BOOLEAN DEFAULT false,
  outdoor_seating BOOLEAN DEFAULT false,
  reservations_accepted BOOLEAN DEFAULT false,
  reservation_url VARCHAR(500),
  menu_url VARCHAR(500),
  delivery_available BOOLEAN DEFAULT false,
  takeout_available BOOLEAN DEFAULT false,
  group_size_max INTEGER
);

-- LODGING details
CREATE TABLE lodging_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  lodging_type VARCHAR(100), -- hotel, motel, cabin, campground, glamping, vacation_rental, inn, resort
  rooms_count INTEGER,
  check_in_time VARCHAR(20),
  check_out_time VARCHAR(20),
  booking_url VARCHAR(500),
  pet_friendly BOOLEAN DEFAULT false,
  group_size_max INTEGER
);

-- EXPERIENCES details
CREATE TABLE experience_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  experience_type VARCHAR(100), -- tour_operator, rental, guide_service, attraction, adventure
  duration VARCHAR(100), -- e.g. "2 hours", "Half day", "Full day"
  group_size_min INTEGER DEFAULT 1,
  group_size_max INTEGER,
  age_minimum INTEGER,
  skill_level VARCHAR(50), -- beginner, intermediate, advanced
  season_start VARCHAR(20),
  season_end VARCHAR(20),
  booking_url VARCHAR(500),
  gear_provided BOOLEAN DEFAULT false,
  gear_list TEXT
);

-- HIKING details
CREATE TABLE hiking_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  difficulty difficulty_level,
  trail_type trail_type,
  distance_miles DECIMAL(5, 2),
  distance_miles_max DECIMAL(5, 2),  -- optional upper bound for range display (e.g., 4.6-12)
  elevation_gain_ft INTEGER,
  estimated_time VARCHAR(100), -- e.g. "2-3 hours"
  trailhead_lat DECIMAL(10, 7),
  trailhead_lng DECIMAL(10, 7),
  trailhead_address VARCHAR(500),
  permit_required BOOLEAN DEFAULT false,  -- DEPRECATED: use entry_requirement
  entry_requirement VARCHAR(20) DEFAULT 'none',  -- none, entry_fee, permit
  permit_info TEXT,
  dogs_allowed BOOLEAN DEFAULT false,  -- DEPRECATED: use dog_policy
  dog_policy VARCHAR(20) DEFAULT 'not_allowed',  -- not_allowed, on_leash, off_leash
  season_start VARCHAR(20),
  season_end VARCHAR(20),
  water_available BOOLEAN DEFAULT false,
  shade_level VARCHAR(50), -- none, partial, full
  kid_friendly BOOLEAN DEFAULT false,
  surface_type VARCHAR(100),  -- rock, paved, gravel, dirt, native, etc.
  data_sources TEXT   -- comma-separated: NPS,OSM,RIDB,BLM,USFS,USGS,Wikidata,AI
);

-- TRANSPORTATION details
CREATE TABLE transportation_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  transport_type VARCHAR(100), -- shuttle, rental_car, taxi, bike_rental, e-bike, ride_share
  service_area TEXT,
  operates_seasonally BOOLEAN DEFAULT false,
  season_start VARCHAR(20),
  season_end VARCHAR(20),
  booking_url VARCHAR(500),
  group_size_max INTEGER
);

-- ============================================
-- LISTING ↔ AMENITY (junction table)
-- ============================================

CREATE TABLE listing_amenities (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, amenity_id)
);

CREATE INDEX idx_listing_amenities_amenity ON listing_amenities(amenity_id);

-- ============================================
-- BUSINESS HOURS
-- ============================================

CREATE TABLE business_hours (
  id SERIAL PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day day_of_week NOT NULL,
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false,
  note VARCHAR(255), -- e.g. "Seasonal hours"
  UNIQUE(listing_id, day)
);

CREATE INDEX idx_business_hours_listing ON business_hours(listing_id);

-- ============================================
-- REVIEWS
-- ============================================

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(500),
  body TEXT,
  photos JSONB DEFAULT '[]',
  status review_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_listing ON reviews(listing_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- ============================================
-- FAVORITES
-- ============================================

CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_listing ON favorites(listing_id);

-- ============================================
-- BLOG POSTS
-- ============================================

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  content TEXT,
  excerpt TEXT,
  featured_image TEXT,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'scheduled', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- HELPER: Updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
