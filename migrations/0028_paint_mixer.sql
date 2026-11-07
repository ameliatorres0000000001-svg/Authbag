-- Anajak Secondhand: paint mixer. Staff record the paints they use and, for each bag colour, a mixing recipe
-- measured from a photo with a white reference (src/shared/color.ts). Users measure their bag the same way and
-- get the recipe whose colour is within ΔE2000 6; otherwise they get no recipe (the app never guesses a colour).
CREATE TABLE paint_products (
  id            TEXT PRIMARY KEY,
  brand         TEXT NOT NULL CHECK (length(trim(brand)) BETWEEN 1 AND 80),
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  kind          TEXT NOT NULL CHECK (kind IN ('leather_paint','edge_paint','dye','finisher','preparer','cleaner','other')),
  color_hex     TEXT CHECK (color_hex IS NULL OR color_hex GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  info          TEXT CHECK (info IS NULL OR length(info) <= 3000),
  sources_json  TEXT NOT NULL DEFAULT '[]',
  photo_key     TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE paint_recipes (
  id            TEXT PRIMARY KEY,
  name_km       TEXT NOT NULL CHECK (length(trim(name_km)) BETWEEN 2 AND 120),
  name_en       TEXT CHECK (name_en IS NULL OR length(name_en) <= 120),
  surface       TEXT NOT NULL CHECK (surface IN ('smooth_leather','grained_leather','vachetta','coated_canvas','suede','edge','other')),
  finish        TEXT NOT NULL DEFAULT 'satin' CHECK (finish IN ('matte','satin','gloss')),
  lab_l         REAL NOT NULL CHECK (lab_l BETWEEN 0 AND 100),
  lab_a         REAL NOT NULL CHECK (lab_a BETWEEN -128 AND 128),
  lab_b         REAL NOT NULL CHECK (lab_b BETWEEN -128 AND 128),
  hex           TEXT NOT NULL,
  measure_json  TEXT NOT NULL,          -- the measurement it was taken from (white + spot + checks)
  photo_key     TEXT,
  method        TEXT CHECK (method IS NULL OR length(method) <= 3000),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_paint_recipes_status ON paint_recipes(status);

CREATE TABLE paint_recipe_parts (
  recipe_id   TEXT NOT NULL REFERENCES paint_recipes(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES paint_products(id),
  parts       REAL NOT NULL CHECK (parts > 0 AND parts <= 100),
  sort        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, product_id)
);

-- a colour someone measured that has no recipe yet (no photo kept: only the corrected colour)
CREATE TABLE paint_color_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_l REAL NOT NULL, lab_a REAL NOT NULL, lab_b REAL NOT NULL,
  hex         TEXT NOT NULL,
  note        TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
