-- Anajak Secondhand: one photo per trending brand + model, uploaded by staff and reused every month that
-- model is ranked. AI (Workers AI background removal) cuts the bag out of its background; if that is not
-- available the original photo is kept and marked cutout = 0. Display only: never evidence, never a verdict.
CREATE TABLE market_model_images (
  id            TEXT PRIMARY KEY,
  brand_key     TEXT NOT NULL CHECK (length(brand_key) BETWEEN 1 AND 80),
  model_key     TEXT NOT NULL CHECK (length(model_key) BETWEEN 1 AND 120),
  brand         TEXT NOT NULL,
  model         TEXT NOT NULL,
  original_key  TEXT NOT NULL,
  display_key   TEXT NOT NULL,
  display_mime  TEXT NOT NULL CHECK (display_mime IN ('image/png','image/jpeg','image/webp')),
  cutout        INTEGER NOT NULL DEFAULT 0 CHECK (cutout IN (0,1)),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (brand_key, model_key)
);
