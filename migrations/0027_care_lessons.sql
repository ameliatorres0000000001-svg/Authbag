-- Anajak Secondhand: bag painting, repair and care lessons (រៀនលាបថ្នាំកាបូប), written by staff.
-- Before/after photos and numbered steps with optional photos. An AI may draft the steps for staff to
-- edit (ai_drafted = 1), but nothing is shown publicly until staff publish it. Teaching only: never a verdict.
CREATE TABLE care_lessons (
  id            TEXT PRIMARY KEY,
  topic         TEXT NOT NULL CHECK (topic IN ('cleaning','edge_paint','recolor','corners','hardware','odor','lining','other')),
  level         TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
  title_km      TEXT NOT NULL CHECK (length(trim(title_km)) BETWEEN 3 AND 160),
  title_en      TEXT CHECK (title_en IS NULL OR length(title_en) <= 160),
  summary       TEXT CHECK (summary IS NULL OR length(summary) <= 800),
  materials     TEXT CHECK (materials IS NULL OR length(materials) <= 1500),
  safety        TEXT CHECK (safety IS NULL OR length(safety) <= 1000),
  minutes       INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 1440),
  before_key    TEXT,
  after_key     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  ai_drafted    INTEGER NOT NULL DEFAULT 0 CHECK (ai_drafted IN (0,1)),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at  TEXT,
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX idx_care_lessons_status ON care_lessons(status, topic);

CREATE TABLE care_lesson_steps (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL REFERENCES care_lessons(id) ON DELETE CASCADE,
  sort        INTEGER NOT NULL,
  body        TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 3 AND 2000),
  tip         TEXT CHECK (tip IS NULL OR length(tip) <= 600),
  photo_key   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_care_steps_lesson ON care_lesson_steps(lesson_id, sort);
