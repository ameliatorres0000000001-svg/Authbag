-- Anajak Bag: paints read from a photo of the tube (AI reads the label; staff check before saving).
-- code = the maker's colour code as printed (e.g. "#107", "100-1"); volume in ml; base = what the paint is made on
-- (acrylic artist colours behave differently on leather from leather paints and dyes).
ALTER TABLE paint_products ADD COLUMN code TEXT CHECK (code IS NULL OR length(code) <= 40);
ALTER TABLE paint_products ADD COLUMN volume_ml INTEGER CHECK (volume_ml IS NULL OR volume_ml BETWEEN 1 AND 20000);
ALTER TABLE paint_products ADD COLUMN base TEXT CHECK (base IS NULL OR base IN ('acrylic','leather_acrylic','water_dye','solvent_dye','oil','wax','other'));
CREATE INDEX idx_paint_products_code ON paint_products(lower(brand), lower(code));
