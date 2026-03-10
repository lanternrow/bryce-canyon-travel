-- Rename color settings keys from zion-branded to generic names
-- This ensures existing admin color overrides carry over to the new variable names.

UPDATE settings SET key = 'color_primary' WHERE key = 'color_zion_red';
UPDATE settings SET key = 'color_sand' WHERE key = 'color_zion_sand';
UPDATE settings SET key = 'color_sage' WHERE key = 'color_zion_sage';
UPDATE settings SET key = 'color_sky' WHERE key = 'color_zion_sky';
UPDATE settings SET key = 'color_stone' WHERE key = 'color_zion_stone';
UPDATE settings SET key = 'color_cream' WHERE key = 'color_zion_cream';
UPDATE settings SET key = 'color_dark' WHERE key = 'color_zion_dark';
