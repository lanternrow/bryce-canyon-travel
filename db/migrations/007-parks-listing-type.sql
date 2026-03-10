-- Migration 007: Add 'parks' listing type for nearby state/national parks and landscape destinations
-- Run against production Neon DB
-- NOTE: Production uses TEXT + CHECK constraints, not PostgreSQL ENUMs

-- 1. Update CHECK constraints to include 'parks'
ALTER TABLE categories DROP CONSTRAINT categories_listing_type_check;
ALTER TABLE categories ADD CONSTRAINT categories_listing_type_check
  CHECK (listing_type = ANY (ARRAY['dining','lodging','experiences','hiking','transportation','parks']));

ALTER TABLE listings DROP CONSTRAINT listings_type_check;
ALTER TABLE listings ADD CONSTRAINT listings_type_check
  CHECK (type = ANY (ARRAY['dining','lodging','experiences','hiking','transportation','parks']));

-- 2. Seed categories for parks type
INSERT INTO categories (name, slug, listing_type, icon) VALUES
  ('National Park',               'national-park',               'parks', 'mountain'),
  ('State Park',                  'state-park',                  'parks', 'tree-pine'),
  ('National Monument',           'national-monument',           'parks', 'landmark'),
  ('National Recreation Area',    'national-recreation-area',    'parks', 'map'),
  ('Wilderness Area',             'wilderness-area',             'parks', 'trees'),
  ('National Conservation Area',  'national-conservation-area',  'parks', 'leaf'),
  ('Scenic Byway',               'scenic-byway',                'parks', 'route'),
  ('Natural Landmark',            'natural-landmark',            'parks', 'mountain-sun'),
  ('National Forest',             'national-forest',             'parks', 'trees'),
  ('Canyon & Gorge',              'canyon-gorge',                'parks', 'mountain'),
  ('City & Community Park',       'city-community-park',         'parks', 'playground')
ON CONFLICT (slug, listing_type) DO NOTHING;
