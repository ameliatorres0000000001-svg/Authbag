-- Teaching points in both Khmer and English: {"km":{"label":"…","note":"…"},"en":{"label":"…","note":"…"}}.
-- label/note keep the original text; the UI shows the viewer's language when present. Teaching only.
ALTER TABLE reference_points ADD COLUMN i18n_json TEXT;
