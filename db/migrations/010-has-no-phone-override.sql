-- ============================================
-- Migration 010: Listing no-phone override
-- Allows listings to explicitly indicate no phone exists
-- and satisfy publish validation without a phone value.
-- ============================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS has_no_phone BOOLEAN;

UPDATE listings
SET has_no_phone = FALSE
WHERE has_no_phone IS NULL;

ALTER TABLE listings ALTER COLUMN has_no_phone SET DEFAULT FALSE;
ALTER TABLE listings ALTER COLUMN has_no_phone SET NOT NULL;
