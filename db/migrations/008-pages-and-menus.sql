-- ============================================
-- Migration 008: Custom Pages + Menu System
-- ============================================

-- 1. Extend the pages table for custom pages
-- Add new columns alongside existing structure
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS page_type TEXT NOT NULL DEFAULT 'custom' CHECK (page_type IN ('system', 'custom')),
  ADD COLUMN IF NOT EXISTS meta_title VARCHAR(500),
  ADD COLUMN IF NOT EXISTS meta_description VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS focus_keyphrase VARCHAR(255),
  ADD COLUMN IF NOT EXISTS og_image TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Mark existing homepage as system page
UPDATE pages SET page_type = 'system', status = 'published' WHERE slug = 'home';

-- 2. Menus table
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  url TEXT,
  item_type TEXT NOT NULL DEFAULT 'custom_link' CHECK (item_type IN ('custom_link', 'custom_page', 'category')),
  page_slug VARCHAR(255),
  category_slug VARCHAR(255),
  position INTEGER NOT NULL DEFAULT 0,
  open_in_new_tab BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_menu_items_menu ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_position ON menu_items(menu_id, position);

-- 4. Menu locations (header / footer assignment)
CREATE TABLE IF NOT EXISTS menu_locations (
  location TEXT PRIMARY KEY CHECK (location IN ('header', 'footer')),
  menu_id UUID REFERENCES menus(id) ON DELETE SET NULL
);

-- Seed the two location rows
INSERT INTO menu_locations (location, menu_id) VALUES ('header', NULL), ('footer', NULL)
  ON CONFLICT (location) DO NOTHING;
