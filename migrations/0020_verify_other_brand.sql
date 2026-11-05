-- A customer can verify a bag of a brand that is not in the list yet: the request uses the placeholder brand
-- "Other" and keeps the typed name in brand_text. Staff can later add the brand to the list.
INSERT OR IGNORE INTO brands (id, slug, name, knowledge_status) VALUES ('b_other', 'other', 'Other', 'NO_DATA');
ALTER TABLE verify_requests ADD COLUMN brand_text TEXT CHECK (brand_text IS NULL OR length(brand_text) BETWEEN 1 AND 80);
