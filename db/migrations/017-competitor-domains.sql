-- Competitor domains for tracking SEO competitors
CREATE TABLE IF NOT EXISTS competitor_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
