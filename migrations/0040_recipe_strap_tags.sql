-- Strap paint: staff mark which published recipes are safe on a strap (flexible, does not crack) and which soak in fast.
-- The app shows only the tags staff set: it never invents a percentage.
ALTER TABLE paint_recipes ADD COLUMN strap_safe INTEGER NOT NULL DEFAULT 0 CHECK (strap_safe IN (0,1));
ALTER TABLE paint_recipes ADD COLUMN fast_soak INTEGER NOT NULL DEFAULT 0 CHECK (fast_soak IN (0,1));
