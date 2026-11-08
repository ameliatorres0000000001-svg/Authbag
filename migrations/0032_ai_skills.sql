-- Anajak Secondhand: AI skills — shop knowledge written (or AI-drafted, then edited) by staff that the in-app AI
-- reads: the assistant chat, brand/model recognition and the AI pre-check comparison.
-- Only status 'active' skills reach the AI; drafts never do. A skill is knowledge, not a rule: it cannot change
-- the hard rules in the prompts (no authentic/fake verdicts, no certificates, no invented market numbers),
-- and it never changes an expert outcome.
CREATE TABLE ai_skills (
  id          TEXT PRIMARY KEY,
  area        TEXT NOT NULL CHECK (area IN ('all','chat','identify','check')),
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
CREATE INDEX idx_ai_skills_active ON ai_skills(status, area);
