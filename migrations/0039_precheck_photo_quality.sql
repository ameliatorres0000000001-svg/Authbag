-- AI pre-check: how clear each customer photo is (clear / soft / unclear), so the result screen can ask for a retake
-- of exactly the photos that were too blurry, dark or far. JSON: [{"photo_id","step","quality","note_en","note_km"}].
ALTER TABLE verify_ai_reviews ADD COLUMN photos_json TEXT CHECK (photos_json IS NULL OR length(photos_json) <= 6000);
