-- Anajak Secondhand: focus on the Aran (Rong Kluea) second-hand market — knowledge and data — and remove the
-- LINE Official Account feature (not needed).

-- 1. LINE OA removed (LINE Login for signing in stays).
DROP TABLE IF EXISTS line_messages;
DROP TABLE IF EXISTS line_contacts;
DELETE FROM settings WHERE key IN ('line_ai_reply','line_notify','line_daily_limit','line_welcome','line_link_code','line_basic_id');

-- 2. AI skills become the teaching source: a skill can belong to an Aran-market topic and, when it is active,
--    be shown to users as a lesson on the Aran page (public = 1). The AI keeps using it as before.
ALTER TABLE ai_skills ADD COLUMN topic TEXT CHECK (topic IS NULL OR topic IN ('market','bales','grading','pricing','buyers','logistics','online','care'));
ALTER TABLE ai_skills ADD COLUMN public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0,1));
CREATE INDEX idx_ai_skills_public ON ai_skills(public, status, topic);

-- 3. Aran price board: prices staff saw at the market (or read in a source), with the date. Shown to users and given
--    to the AI, which quotes only these and never invents prices. No row = "no data".
CREATE TABLE aran_prices (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL CHECK (category IN ('bale','bag','service')),
  item         TEXT NOT NULL CHECK (length(trim(item)) BETWEEN 2 AND 120),
  grade        TEXT CHECK (grade IS NULL OR length(grade) <= 20),
  price_min    INTEGER CHECK (price_min IS NULL OR price_min >= 0),
  price_max    INTEGER CHECK (price_max IS NULL OR price_max >= 0),
  currency     TEXT NOT NULL DEFAULT 'THB' CHECK (currency IN ('THB','USD','KHR')),
  unit         TEXT NOT NULL CHECK (unit IN ('bale','kg','piece','job')),
  observed_on  TEXT NOT NULL CHECK (observed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  source       TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 2 AND 300),
  note         TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (price_min IS NOT NULL OR price_max IS NOT NULL),
  CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min)
);
CREATE INDEX idx_aran_prices_recent ON aran_prices(category, observed_on);
