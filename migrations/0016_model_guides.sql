-- One short "how to look at this model" guide per album (model), in Khmer and English.
-- Written as an AI draft from the album's teaching points, then reviewed by staff. Teaching only:
-- a guide never feeds an evaluation outcome.
CREATE TABLE model_guides (
  model_id     TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  i18n_json    TEXT NOT NULL,                 -- {"km":{"title","intro","steps":[...]},"en":{...}}
  status       TEXT NOT NULL DEFAULT 'ai_draft' CHECK (status IN ('ai_draft','approved')),
  ai_model     TEXT,
  updated_by   TEXT REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
