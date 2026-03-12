-- Add metrics columns to competitor_domains so we can persist fetched data
ALTER TABLE competitor_domains
  ADD COLUMN IF NOT EXISTS organic_keywords INTEGER,
  ADD COLUMN IF NOT EXISTS top10_count INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_traffic INTEGER,
  ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;
