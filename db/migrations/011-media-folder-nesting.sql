-- Migration 011: Nested media folders
-- Adds parent_id for folder hierarchy and sort_order for manual ordering.

ALTER TABLE media_folders
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES media_folders(id) ON DELETE SET NULL;

ALTER TABLE media_folders
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_media_folder_id ON media(folder_id);
