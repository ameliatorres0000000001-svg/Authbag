-- HENGZ AUTHENTIC — core schema (Cloudflare D1 / SQLite)
-- Design rules enforced IN THE DATABASE (not only in app code):
--  * audit_log is append-only (triggers abort UPDATE/DELETE)
--  * a reference asset cannot be 'approved' unless its license is known AND its label basis is not a seller claim / unverified
--  * AI output is stored as observations with an explicit source; only appraiser / ai_confirmed / system observations may count

PRAGMA foreign_keys = ON;

-- ───────── identity & settings ─────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','lead_authenticator','appraiser','reviewer','subscriber','readonly')),
  pw_hash       TEXT NOT NULL,
  pw_salt       TEXT NOT NULL,
  pw_iter       INTEGER NOT NULL DEFAULT 210000,
  locale        TEXT NOT NULL DEFAULT 'km' CHECK (locale IN ('km','en')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,           -- sha256(token) hex; raw token only lives in the cookie
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────── taxonomy: brand → model → era ─────────
CREATE TABLE brands (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  knowledge_status TEXT NOT NULL DEFAULT 'NO_DATA' CHECK (knowledge_status IN ('NO_DATA','LIMITED_DATA','KNOWLEDGE_AVAILABLE')),
  notes            TEXT
);

CREATE TABLE models (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  silhouette  TEXT,
  status      TEXT NOT NULL DEFAULT 'STUB' CHECK (status IN ('STUB','ACTIVE','RETIRED')),
  UNIQUE (brand_id, slug)
);

-- A "production era" is where identifier systems / construction change. Nothing is invented here:
-- eras are entered by experts and must be approved before the engine relies on them.
CREATE TABLE eras (
  id               TEXT PRIMARY KEY,
  model_id         TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  start_year       INTEGER,
  end_year         INTEGER,
  identifier_type  TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (identifier_type IN ('NONE','DATE_CODE','RFID_MICROCHIP','SERIAL','BLIND_STAMP','UNKNOWN')),
  identifier_notes TEXT,
  status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  UNIQUE (model_id, name),
  CHECK (start_year IS NULL OR end_year IS NULL OR start_year <= end_year)
);

-- ───────── components, observation dictionary, capture checklist ─────────
CREATE TABLE components (
  code     TEXT PRIMARY KEY,
  name_en  TEXT NOT NULL,
  name_km  TEXT NOT NULL
);

-- Every observation an appraiser (or AI, pending confirmation) can record. The UI form is generated from this table.
CREATE TABLE observation_defs (
  key            TEXT PRIMARY KEY,
  component_code TEXT NOT NULL REFERENCES components(code),
  value_type     TEXT NOT NULL CHECK (value_type IN ('enum','number','boolean','text')),
  enum_json      TEXT,                 -- ["crisp","soft","blurred"] when value_type='enum'
  unit           TEXT,
  label_en       TEXT NOT NULL,
  label_km       TEXT NOT NULL,
  guidance_en    TEXT,
  guidance_km    TEXT
);

-- Required photos. Resolution order: model-specific → brand-specific → global (brand_id & model_id NULL).
CREATE TABLE capture_templates (
  id             TEXT PRIMARY KEY,
  brand_id       TEXT REFERENCES brands(id) ON DELETE CASCADE,
  model_id       TEXT REFERENCES models(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  component_code TEXT REFERENCES components(code),
  label_en       TEXT NOT NULL,
  label_km       TEXT NOT NULL,
  guidance_en    TEXT,
  guidance_km    TEXT,
  required       INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 100,
  UNIQUE (brand_id, model_id, code)
);

-- ───────── expert rules (the ONLY thing that can produce a concern / consistency signal) ─────────
CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  model_id        TEXT REFERENCES models(id),
  era_id          TEXT REFERENCES eras(id),
  component_code  TEXT NOT NULL REFERENCES components(code),
  observation_key TEXT NOT NULL REFERENCES observation_defs(key),
  check_json      TEXT NOT NULL,       -- {"type":"in","values":["crisp"]} | {"type":"range","min":..,"max":..} | {"type":"equals","value":..} | {"type":"regex","pattern":".."} | {"type":"present"}
  polarity        TEXT NOT NULL CHECK (polarity IN ('authentic_indicator','concern_indicator')),
  severity        TEXT NOT NULL CHECK (severity IN ('major','minor','info')),
  required        INTEGER NOT NULL DEFAULT 0,
  title_en        TEXT NOT NULL,
  title_km        TEXT NOT NULL,
  rationale       TEXT,
  source_tier     INTEGER CHECK (source_tier BETWEEN 1 AND 4),   -- 1 brand, 2 provider, 3 expert, 4 community/unverified
  citations_json  TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','retired')),
  version         INTEGER NOT NULL DEFAULT 1,
  author_id       TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (code, version)
);
CREATE INDEX idx_rules_scope ON rules(brand_id, model_id, era_id, status);

CREATE TABLE rule_approvals (
  rule_id    TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  decision   TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  comment    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (rule_id, user_id)
);

-- Identifier decoding tables are DATA, never hard-coded claims.
CREATE TABLE datecode_formats (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  name            TEXT NOT NULL,
  start_year      INTEGER,
  end_year        INTEGER,
  pattern         TEXT NOT NULL,       -- JS regex source with capture groups
  extraction_json TEXT NOT NULL,       -- {"factoryGroup":1,"periodGroups":[2,4],"yearGroups":[3,5],"periodUnit":"week|month|unconfirmed","yearPivot":0}
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired'))
);

CREATE TABLE factory_codes (
  id        TEXT PRIMARY KEY,
  brand_id  TEXT NOT NULL REFERENCES brands(id),
  code      TEXT NOT NULL,
  country   TEXT,
  location  TEXT,
  notes     TEXT,
  status    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  UNIQUE (brand_id, code)
);

-- ───────── reference library (training / retrieval data) with provenance enforced by constraint ─────────
CREATE TABLE reference_assets (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  model_id        TEXT REFERENCES models(id),
  era_id          TEXT REFERENCES eras(id),
  component_code  TEXT REFERENCES components(code),
  r2_key          TEXT NOT NULL UNIQUE,
  sha256          TEXT NOT NULL,
  width           INTEGER,
  height          INTEGER,
  label           TEXT NOT NULL DEFAULT 'unknown' CHECK (label IN ('authentic','counterfeit','unknown')),
  label_basis     TEXT NOT NULL DEFAULT 'unverified' CHECK (label_basis IN ('purchase_receipt','brand_boutique','provider_certificate','expert_consensus','seller_claim','unverified')),
  license         TEXT NOT NULL DEFAULT 'unknown' CHECK (license IN ('own','consented','licensed','public_domain','unknown')),
  consent_ref     TEXT,
  source_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'quarantine' CHECK (status IN ('quarantine','approved','rejected')),
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status <> 'approved' OR (license <> 'unknown' AND label_basis NOT IN ('seller_claim','unverified') AND label <> 'unknown'))
);
CREATE INDEX idx_assets_scope ON reference_assets(brand_id, model_id, era_id, status);

CREATE TABLE asset_embeddings (
  asset_id    TEXT PRIMARY KEY REFERENCES reference_assets(id) ON DELETE CASCADE,
  model_name  TEXT NOT NULL,
  dim         INTEGER NOT NULL,
  vector      BLOB NOT NULL,           -- float32 little-endian; brute-force cosine is fine below ~20k vectors, migrate to Vectorize/pgvector after
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────── inspections ─────────
CREATE TABLE inspections (
  id              TEXT PRIMARY KEY,
  ref_code        TEXT NOT NULL UNIQUE,
  created_by      TEXT NOT NULL REFERENCES users(id),
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  model_id        TEXT NOT NULL REFERENCES models(id),
  era_id          TEXT REFERENCES eras(id),
  claimed_year    INTEGER,
  item_ref        TEXT,
  customer_ref    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_evidence','in_review','evaluated','signed_off','closed')),
  outcome         TEXT CHECK (outcome IN ('insufficient_evidence','requires_expert_review','concerns_found','consistent_with_references')),
  evaluated_at    TEXT,
  signed_off_by   TEXT REFERENCES users(id),
  signed_off_at   TEXT,
  signoff_note    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_insp_status ON inspections(status, created_at);

CREATE TABLE captures (
  id             TEXT PRIMARY KEY,
  inspection_id  TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  template_code  TEXT NOT NULL,
  r2_key         TEXT NOT NULL UNIQUE,
  sha256         TEXT NOT NULL,
  mime           TEXT NOT NULL,
  bytes          INTEGER NOT NULL,
  width          INTEGER,
  height         INTEGER,
  quality_json   TEXT,                 -- {"blurScore":..,"brightness":..,"warnings":[..]} computed client-side, re-checked server-side where possible
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (inspection_id, template_code, sha256)
);

CREATE TABLE observations (
  id             TEXT PRIMARY KEY,
  inspection_id  TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  capture_id     TEXT REFERENCES captures(id) ON DELETE SET NULL,
  component_code TEXT NOT NULL REFERENCES components(code),
  key            TEXT NOT NULL REFERENCES observation_defs(key),
  value_json     TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('appraiser','ai_suggested','ai_confirmed','system')),
  confidence     REAL,
  entered_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (source <> 'ai_confirmed' OR entered_by IS NOT NULL)
);
CREATE INDEX idx_obs_insp ON observations(inspection_id, key, created_at);

-- Immutable history of every evaluation run (what rules were used is snapshotted by hash).
CREATE TABLE evaluations (
  id                  TEXT PRIMARY KEY,
  inspection_id       TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  engine_version      TEXT NOT NULL,
  outcome             TEXT NOT NULL CHECK (outcome IN ('insufficient_evidence','requires_expert_review','concerns_found','consistent_with_references')),
  detail_json         TEXT NOT NULL,
  rules_snapshot_hash TEXT NOT NULL,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ───────── official providers & certificates ─────────
CREATE TABLE providers (
  id               TEXT PRIMARY KEY,   -- 'entrupy', 'realauthentication', ...
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','awaiting_authorization','connected','test_failed')),
  last_test_at     TEXT,
  last_test_ok     INTEGER,
  last_test_message TEXT,
  config_json      TEXT NOT NULL DEFAULT '{}',   -- NON-secret config only (base URL, account label). Secrets live in Worker secrets.
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status <> 'connected' OR COALESCE(last_test_ok, 0) = 1)    -- cannot be 'connected' without a successful test (NULL counts as not tested)
);

CREATE TABLE provider_checks (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  provider_id   TEXT NOT NULL REFERENCES providers(id),
  external_ref  TEXT,
  status        TEXT NOT NULL DEFAULT 'submitted',
  result_json   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE certificates (
  id                  TEXT PRIMARY KEY,
  cert_no             TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('provider_verified','user_uploaded_unverified','hengz_expert_report')),
  provider_id         TEXT REFERENCES providers(id),
  inspection_id       TEXT REFERENCES inspections(id),
  official_result     TEXT,
  issue_date          TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','unverified','revoked')),
  external_url        TEXT,
  file_r2_key         TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- a provider_verified certificate must point at a provider and be verified; uploads can never be 'verified'
  CHECK (kind <> 'provider_verified' OR (provider_id IS NOT NULL AND verification_status IN ('verified','revoked'))),
  CHECK (kind <> 'user_uploaded_unverified' OR verification_status = 'unverified')
);

-- ───────── tamper-evident audit log ─────────
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id       TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  detail_json   TEXT,
  prev_hash     TEXT NOT NULL,
  hash          TEXT NOT NULL          -- sha256(prev_hash | ts | user_id | action | resource_type | resource_id | detail_json), computed in the Worker
);

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- Approved rules are immutable except retiring them (create a new version instead).
CREATE TRIGGER rules_approved_immutable BEFORE UPDATE ON rules
WHEN OLD.status = 'approved' AND NOT (NEW.status = 'retired' AND NEW.check_json = OLD.check_json AND NEW.observation_key = OLD.observation_key AND NEW.polarity = OLD.polarity AND NEW.severity = OLD.severity)
BEGIN SELECT RAISE(ABORT, 'approved rules are immutable; create a new version'); END;
