-- Migration 012: Submission token for business image uploads
-- Adds a unique token column so business owners can upload photos
-- via a public token-based link without needing admin auth.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS submission_token TEXT;

-- Partial unique index: NULLs don't conflict, only actual tokens must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_submission_token
  ON listings(submission_token)
  WHERE submission_token IS NOT NULL;
