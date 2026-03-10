-- Migration 014: Upgrade hiking_details fields
-- 1. Add distance_miles_max for range support (e.g., "4.6-12 miles")
-- 2. Convert permit_required (boolean) → entry_requirement (text: none/entry_fee/permit)
-- 3. Convert dogs_allowed (boolean) → dog_policy (text: not_allowed/on_leash/off_leash)

-- 1. Distance range support
ALTER TABLE hiking_details ADD COLUMN IF NOT EXISTS distance_miles_max DECIMAL(5, 2);

-- 2. Entry requirement (replaces permit_required)
ALTER TABLE hiking_details ADD COLUMN IF NOT EXISTS entry_requirement VARCHAR(20) DEFAULT 'none';

-- Migrate existing data: permit_required=true → "permit", false → "none"
UPDATE hiking_details
SET entry_requirement = CASE
  WHEN permit_required = true THEN 'permit'
  ELSE 'none'
END
WHERE entry_requirement IS NULL OR entry_requirement = 'none';

-- 3. Dog policy (replaces dogs_allowed)
ALTER TABLE hiking_details ADD COLUMN IF NOT EXISTS dog_policy VARCHAR(20) DEFAULT 'not_allowed';

-- Migrate existing data: dogs_allowed=true → "on_leash" (safe default), false → "not_allowed"
UPDATE hiking_details
SET dog_policy = CASE
  WHEN dogs_allowed = true THEN 'on_leash'
  ELSE 'not_allowed'
END
WHERE dog_policy IS NULL OR dog_policy = 'not_allowed';

-- Note: Old boolean columns (permit_required, dogs_allowed) are kept for safety.
-- They can be dropped in a future migration after verifying the new columns work.
