-- Learning studio: per-model teaching sets (up to 5 reference photos per model, each with a teaching note,
-- an AI prompt and "look here" points) and a study set of labelled comparison photos.
-- Teaching data is ANNOTATION ONLY: the rules engine never reads these columns or the reference_points table,
-- so nothing here can change an inspection outcome. All existing CHECK constraints on reference_assets still apply.

ALTER TABLE reference_assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'general' CHECK (purpose IN ('general','model_set','study'));
ALTER TABLE reference_assets ADD COLUMN slot INTEGER CHECK (slot IS NULL OR slot BETWEEN 1 AND 5);
ALTER TABLE reference_assets ADD COLUMN teaching_title TEXT CHECK (teaching_title IS NULL OR length(teaching_title) <= 120);
ALTER TABLE reference_assets ADD COLUMN teaching_note TEXT CHECK (teaching_note IS NULL OR length(teaching_note) <= 4000);
ALTER TABLE reference_assets ADD COLUMN ai_prompt TEXT CHECK (ai_prompt IS NULL OR length(ai_prompt) <= 2000);
CREATE INDEX idx_assets_purpose ON reference_assets(purpose, model_id);

-- "Look here" boxes on a reference photo, each with a short explanation of what to check.
-- AI may only propose points (source='ai_suggested'), labelled as such; the engine never reads this table.
CREATE TABLE reference_points (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES reference_assets(id) ON DELETE CASCADE,
  x           REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y           REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  w           REAL NOT NULL CHECK (w > 0 AND x + w <= 1.000001),
  h           REAL NOT NULL CHECK (h > 0 AND y + h <= 1.000001),
  label       TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  note        TEXT CHECK (note IS NULL OR length(note) <= 1000),
  source      TEXT NOT NULL CHECK (source IN ('appraiser','ai_suggested')),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_refpoints_asset ON reference_points(asset_id);

-- Date-code teaching data (still DRAFT: shown as candidates, never counted until a lead authenticator approves).
-- Resale guides (Fashionphile, Rebag, Yoogi's Closet, Lollipuff) agree that from 2007 digits 1&3 are the WEEK
-- and digits 2&4 the year, e.g. CA4109 → CA (Spain), week 40, 2019. LV moved to NFC chips from ~2021.
UPDATE datecode_formats
   SET extraction_json = '{"factoryGroup":1,"periodGroups":[2,4],"yearGroups":[3,5],"periodUnit":"week","yearPivot":100}',
       notes = 'Resale guides (Fashionphile, Rebag, Yoogi''s Closet): digits 1&3 = week, digits 2&4 = year. Example CA4109 → week 40, 2019. Items from ~2021 carry an NFC chip instead. CONFIRM before approving.'
 WHERE id = 'dc_lv_2letter4digit_2007_2020' AND status = 'draft';

INSERT OR IGNORE INTO factory_codes (id, brand_id, code, country, location, notes, status) VALUES
 ('fc_lv_ca','b_lv','CA','Spain',NULL,'Listed as Spain by Fashionphile, Rebag and Lollipuff date-code guides. CONFIRM.','draft'),
 ('fc_lv_lo','b_lv','LO','Spain',NULL,'Listed as Spain in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_lb','b_lv','LB','Spain',NULL,'Listed as Spain in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_gi','b_lv','GI','Spain',NULL,'Listed as Spain in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_ar','b_lv','AR','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_mi','b_lv','MI','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_sp','b_lv','SP','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_sr','b_lv','SR','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_th','b_lv','TH','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_vi','b_lv','VI','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_du','b_lv','DU','France',NULL,'Listed as France in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_fc','b_lv','FC','United States',NULL,'Listed as USA in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_fh','b_lv','FH','United States',NULL,'Listed as USA in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_ce','b_lv','CE','Italy',NULL,'Listed as Italy in resale date-code guides. CONFIRM.','draft'),
 ('fc_lv_fo','b_lv','FO','Italy',NULL,'Listed as Italy in resale date-code guides. CONFIRM.','draft');
