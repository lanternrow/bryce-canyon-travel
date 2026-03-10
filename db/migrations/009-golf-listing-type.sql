-- Migration 009: Add 'golf' to listings type CHECK constraint
-- The add-golf-category.mjs script had a bug: it queried
-- WHERE conname LIKE '%listing_type%' but the constraint is named
-- 'listings_type_check' (with an 's'), so the LIKE pattern didn't match.
-- Categories constraint was updated but listings was silently skipped.

ALTER TABLE listings DROP CONSTRAINT listings_type_check;
ALTER TABLE listings ADD CONSTRAINT listings_type_check
  CHECK (type = ANY (ARRAY['dining','lodging','experiences','hiking','transportation','parks','golf']));
