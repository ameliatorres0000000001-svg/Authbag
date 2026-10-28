-- Analysis points ("marks"): a rectangle on one inspection photo that an appraiser wants to look at closely
-- (serial plate characters, a screw head, a stitch row). Annotation only: the engine never reads this table,
-- so a mark cannot change an outcome. AI may only *propose* marks (source='ai_suggested'), labelled as such.
CREATE TABLE capture_marks (
  id            TEXT PRIMARY KEY,
  capture_id    TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  x             REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y             REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  w             REAL NOT NULL CHECK (w > 0 AND x + w <= 1.000001),
  h             REAL NOT NULL CHECK (h > 0 AND y + h <= 1.000001),
  label         TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  note          TEXT,
  source        TEXT NOT NULL CHECK (source IN ('appraiser','ai_suggested')),
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_marks_capture ON capture_marks(capture_id);
CREATE INDEX idx_marks_inspection ON capture_marks(inspection_id);
