-- ============================================
-- Migration 004: Redirects Table
-- Stores custom 301/302 redirect rules managed
-- through the admin panel.
-- ============================================

CREATE TABLE IF NOT EXISTS redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path VARCHAR(1000) NOT NULL,
  to_path VARCHAR(1000) NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  hit_count INTEGER NOT NULL DEFAULT 0,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_redirects_from_path ON redirects(from_path);
