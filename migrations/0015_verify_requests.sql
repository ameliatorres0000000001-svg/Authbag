-- Expert verification requests: a customer photographs (or uploads) the key parts of a bag, the photos go to the
-- experts' Telegram group, and an expert answers with one of the system's existing outcomes (never "authentic/fake",
-- never a certificate from this system). An official Entrupy certificate is a separate, optional add-on.

CREATE TABLE verify_plans (
  id                  TEXT PRIMARY KEY,
  sort                INTEGER NOT NULL DEFAULT 0,
  name_en             TEXT NOT NULL,
  name_km             TEXT NOT NULL,
  brands_json         TEXT NOT NULL DEFAULT '[]',   -- brand slugs in this price tier
  price_cents         INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),   -- NULL = price not set yet
  entrupy_price_cents INTEGER CHECK (entrupy_price_cents IS NULL OR entrupy_price_cents >= 0),
  currency            TEXT NOT NULL DEFAULT 'USD',
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO verify_plans (id, sort, name_en, name_km, brands_json) VALUES
 ('vp_tier1', 1, 'Tier 1 — Prada, Gucci, MCM, Celine …', 'កម្រិត 1 — Prada, Gucci, MCM, Celine …', '["prada","gucci","mcm","celine","saint-laurent","goyard"]'),
 ('vp_tier2', 2, 'Tier 2 — Louis Vuitton, Bottega Veneta, Balenciaga, Loewe, Fendi …', 'កម្រិត 2 — Louis Vuitton, Bottega Veneta, Balenciaga, Loewe, Fendi …', '["louis-vuitton","bottega-veneta","balenciaga","loewe","fendi"]'),
 ('vp_tier3', 3, 'Tier 3 — Hermès, Chanel, Dior …', 'កម្រិត 3 — Hermès, Chanel, Dior …', '["hermes","chanel","dior"]');

CREATE TABLE verify_requests (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  brand_id             TEXT NOT NULL REFERENCES brands(id),
  model_text           TEXT,
  mode                 TEXT NOT NULL CHECK (mode IN ('scan','upload')),
  plan_id              TEXT REFERENCES verify_plans(id),
  free_trial           INTEGER NOT NULL DEFAULT 0 CHECK (free_trial IN (0,1)),
  entrupy_requested    INTEGER NOT NULL DEFAULT 0 CHECK (entrupy_requested IN (0,1)),
  status               TEXT NOT NULL DEFAULT 'submitted'
                         CHECK (status IN ('submitted','in_review','more_photos','answered','cancelled')),
  -- the expert's answer uses the system's four outcomes only
  expert_outcome       TEXT CHECK (expert_outcome IS NULL OR expert_outcome IN
                         ('insufficient_evidence','requires_expert_review','concerns_found','consistent_with_references')),
  expert_note          TEXT CHECK (expert_note IS NULL OR length(expert_note) <= 2000),
  expert_name          TEXT,
  telegram_message_id  INTEGER,
  telegram_error       TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  answered_at          TEXT,
  CHECK (status <> 'answered' OR expert_outcome IS NOT NULL)
);
CREATE INDEX idx_verify_requests_user ON verify_requests(user_id, created_at);

CREATE TABLE verify_photos (
  id          TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES verify_requests(id) ON DELETE CASCADE,
  step        TEXT NOT NULL CHECK (step IN ('model','logo','serial','material','hardware','zipper','extra')),
  r2_key      TEXT NOT NULL UNIQUE,
  mime        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_verify_photos_request ON verify_photos(request_id);
