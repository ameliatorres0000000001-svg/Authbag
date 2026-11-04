-- The photo shown large on an album card (the whole bag). NULL = chosen automatically.
ALTER TABLE models ADD COLUMN cover_asset_id TEXT REFERENCES reference_assets(id);
