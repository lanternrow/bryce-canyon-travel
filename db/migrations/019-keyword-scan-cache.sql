-- Migration 019: Cache keyword scan results across navigation
CREATE TABLE IF NOT EXISTS keyword_scan_cache (
  id SERIAL PRIMARY KEY,
  scan_type TEXT NOT NULL,
  input_key TEXT NOT NULL,
  results JSONB NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scan_type, input_key)
);
