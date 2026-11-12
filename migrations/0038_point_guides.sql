-- Teaching guide for each numbered box on an original reference photo: written once by the AI when staff ask for it,
-- stored here, and shown to every viewer (tap a box → short text on the photo, details below) with no AI call.
-- JSON: {"km": {title, popup, look_at, match, differs}, "en": {...}} — see src/shared/pointGuide.ts.
ALTER TABLE reference_points ADD COLUMN guide_json TEXT CHECK (guide_json IS NULL OR length(guide_json) <= 6000);
ALTER TABLE reference_points ADD COLUMN guide_model TEXT;
ALTER TABLE reference_points ADD COLUMN guide_at TEXT;
