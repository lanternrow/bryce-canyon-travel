-- Migration 020: Create parks_details table for park-specific information
-- Follows the same one-to-one pattern as hiking_details

CREATE TABLE IF NOT EXISTS parks_details (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,

  -- Entry Fees & Passes
  entry_fee           VARCHAR(255),
  annual_pass_accepted BOOLEAN DEFAULT false,
  fee_free_info       TEXT,

  -- Operating Info
  park_hours          VARCHAR(255),
  visitor_center_hours VARCHAR(255),
  seasonal_closure    TEXT,

  -- Park Stats
  elevation_ft        INTEGER,
  acreage             INTEGER,
  year_established    INTEGER,
  governing_agency    VARCHAR(100),

  -- Visitor Facilities
  has_visitor_center  BOOLEAN DEFAULT false,
  has_campgrounds     BOOLEAN DEFAULT false,
  has_scenic_drives   BOOLEAN DEFAULT false,
  has_restrooms       BOOLEAN DEFAULT false,
  has_wheelchair_access BOOLEAN DEFAULT false,
  has_cell_service    BOOLEAN DEFAULT false,

  -- Special Notices (flash floods, traffic, regulations)
  notices             TEXT,

  -- Shared fields (also in hiking_details)
  entry_requirement   VARCHAR(20) DEFAULT 'none',
  dog_policy          VARCHAR(20) DEFAULT 'not_allowed',
  season_start        VARCHAR(20),
  season_end          VARCHAR(20),
  water_available     BOOLEAN DEFAULT false,
  kid_friendly        BOOLEAN DEFAULT false,

  -- Data provenance
  data_sources        TEXT
);
