-- ============================================
-- Migration 006: Enhanced Google Places Data
-- Adds columns for New Places API fields and
-- new amenities for auto-mapping from Google.
-- ============================================

-- New columns on listings for Google-specific data
ALTER TABLE listings ADD COLUMN IF NOT EXISTS google_maps_uri TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS google_primary_type TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS google_types TEXT[];

-- New amenities for Google boolean signals that lack existing matches
-- NOTE: production amenities table does not have display_order column
INSERT INTO amenities (name, slug, icon, category) VALUES
  ('Dine-In', 'dine-in', 'utensils', 'dining'),
  ('Curbside Pickup', 'curbside-pickup', 'car-side', 'dining'),
  ('Accepts Credit Cards', 'accepts-credit-cards', 'credit-card', 'general')
ON CONFLICT (slug) DO NOTHING;
