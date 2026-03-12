-- Migration 016: DataForSEO integration tables
-- Adds tables for keyword rank tracking, rank history, and backlink snapshots

-- Tracked keywords for rank monitoring
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  location_code INTEGER DEFAULT 2840, -- US
  language_code TEXT DEFAULT 'en',
  search_volume INTEGER,
  competition REAL,
  competition_level TEXT,
  cpc REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword, location_code, language_code)
);

-- Daily rank snapshots per keyword
CREATE TABLE IF NOT EXISTS keyword_rank_history (
  id SERIAL PRIMARY KEY,
  tracked_keyword_id INTEGER NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  rank_group INTEGER,          -- position in organic results
  rank_absolute INTEGER,       -- absolute position including ads/features
  url TEXT,                    -- which page ranks
  title TEXT,
  snippet TEXT,
  is_featured_snippet BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_rank_history_keyword_date
  ON keyword_rank_history(tracked_keyword_id, checked_at DESC);

-- Backlink snapshots for trend tracking
CREATE TABLE IF NOT EXISTS backlink_snapshots (
  id SERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  total_backlinks BIGINT,
  referring_domains INTEGER,
  domain_rank INTEGER,
  broken_backlinks INTEGER,
  referring_ips INTEGER,
  referring_subnets INTEGER,
  dofollow INTEGER,
  nofollow INTEGER
);
