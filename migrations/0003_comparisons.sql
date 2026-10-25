-- AI side-by-side explanations: descriptive only, never a verdict. Stored for audit and for appraiser review.
CREATE TABLE comparisons (
  id             TEXT PRIMARY KEY,
  inspection_id  TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  capture_id     TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  asset_ids_json TEXT NOT NULL,
  result_json    TEXT NOT NULL,
  model          TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_comparisons_capture ON comparisons(capture_id);

-- New observation vocabulary seen in owner-supplied comparison photos (single photo pairs, tier 4, unverified).
INSERT INTO observation_defs (key, component_code, value_type, enum_json, label_en, label_km, guidance_en, guidance_km) VALUES
 ('zipper.pull_registered_mark','zipper','enum','["registered_symbol","dot","none"]','Mark after zipper-maker name','សញ្ញាបន្ទាប់ឈ្មោះក្រុមហ៊ុន zipper','Photo the zipper pull face-on in even light.','ថតមុខ zipper pull ត្រង់ ក្នុងពន្លឺស្មើ'),
 ('hardware.coating_evenness','hardware','enum','["even","uneven_glossy","chipped_or_bubbled"]','Coating / plating evenness','ភាពស្មើនៃថ្នាំកូត/ចំហុយលោហៈ','Photograph at an angle that shows the base of the shackle.','ថតមុំដែលឃើញគល់ដៃសោ');

INSERT INTO rules (id, code, brand_id, model_id, era_id, component_code, observation_key, check_json, polarity, severity, required, title_en, title_km, rationale, source_tier, citations_json, status, version) VALUES
 ('r_lv_zip_mark_c','LV-ZIP-MARK-C','b_lv',NULL,NULL,'zipper','zipper.pull_registered_mark','{"type":"in","values":["registered_symbol"]}','concern_indicator','minor',0,'Registered-mark symbol after Lampo name on pull','មានសញ្ញា ® បន្ទាប់ឈ្មោះ Lampo លើ pull','Single photo pair: the compared authentic pull shows a small dot, the counterfeit shows ®. Needs confirmation across models/years before approval.',4,'[{"type":"owner_comparison_photo","note":"single pair, source unverified"}]','draft',1),
 ('r_lv_hw_coat_c','LV-HW-COAT-C','b_lv',NULL,NULL,'hardware','hardware.coating_evenness','{"type":"in","values":["uneven_glossy","chipped_or_bubbled"]}','concern_indicator','minor',0,'Padlock coating uneven / bubbled at shackle base','ថ្នាំកូតសោមិនស្មើ/ពងត្រង់គល់ដៃសោ','Single photo pair (coloured padlock): authentic shows even brushed finish, counterfeit shows glossy uneven coating. Finish varies by collection.',4,'[{"type":"owner_comparison_photo","note":"single pair, source unverified"}]','draft',1),
 ('r_lv_hw_coat_a','LV-HW-COAT-A','b_lv',NULL,NULL,'hardware','hardware.coating_evenness','{"type":"in","values":["even"]}','authentic_indicator','minor',0,'Padlock coating even','ថ្នាំកូតសោស្មើ','Weak indicator on its own; many counterfeits also have even coatings.',4,'[{"type":"owner_comparison_photo","note":"single pair, source unverified"}]','draft',1);
