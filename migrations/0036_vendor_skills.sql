-- Anajak Secondhand: an AI assistant for second-hand bag vendors, built around Skills
-- (🎨 paint · 🔍 identify & check · 🧽 clean & repair). The Aran price board and market lessons are removed.

-- 1. Aran price board removed (vendors already know the market).
DROP TABLE IF EXISTS aran_prices;

-- 2. AI skills: knowledge can now be written for the paint and repair skills too. The table is rebuilt to widen
--    the area list; the Aran lesson columns (topic, public) are dropped. Existing skills are kept as they are.
CREATE TABLE ai_skills_new (
  id          TEXT PRIMARY KEY,
  area        TEXT NOT NULL CHECK (area IN ('all','chat','identify','check','paint','repair')),
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  body        TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 10 AND 4000),
  brand       TEXT CHECK (brand IS NULL OR length(brand) <= 80),
  keywords    TEXT CHECK (keywords IS NULL OR length(keywords) <= 300),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active')),
  ai_drafted  INTEGER NOT NULL DEFAULT 0 CHECK (ai_drafted IN (0,1)),
  uses        INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO ai_skills_new (id, area, title, body, brand, keywords, status, ai_drafted, uses, last_used_at, created_by, updated_by, created_at, updated_at)
  SELECT id, area, title, body, brand, keywords, status, ai_drafted, uses, last_used_at, created_by, updated_by, created_at, updated_at FROM ai_skills;
DROP INDEX IF EXISTS idx_ai_skills_public;
DROP INDEX IF EXISTS idx_ai_skills_active;
DROP TABLE ai_skills;
ALTER TABLE ai_skills_new RENAME TO ai_skills;
CREATE INDEX idx_ai_skills_active ON ai_skills(status, area);

-- 3. Answers of the paint-method skill are the same for everyone with the same leather / finish / recipe, so they
--    are kept for 30 days (fewer AI calls). Cleared whenever staff change a paint or "all" skill.
CREATE TABLE skill_cache (
  key         TEXT PRIMARY KEY CHECK (length(key) <= 200),
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
