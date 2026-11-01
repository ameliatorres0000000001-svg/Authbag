-- AI descriptions of what a date code LOOKS like (shape, size, font, spacing, depth, placement), on a reference photo
-- or an inspection photo. Descriptive only: never a verdict or a score. The rules engine never reads this table.
CREATE TABLE datecode_analyses (
  id                  TEXT PRIMARY KEY,
  target_type         TEXT NOT NULL CHECK (target_type IN ('asset','capture')),
  target_id           TEXT NOT NULL,
  brand_id            TEXT REFERENCES brands(id),
  reference_ids_json  TEXT NOT NULL DEFAULT '[]',
  result_json         TEXT NOT NULL,
  model               TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_dca_target ON datecode_analyses(target_type, target_id, created_at);
