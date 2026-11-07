-- Anajak Secondhand: AI token use per day, and paid membership (7-day free trial, then monthly by QR).

-- tokens per day / feature / model (input incl. cache, output incl. thinking), for the budget card in Admin
CREATE TABLE ai_usage_daily (
  day            TEXT NOT NULL,
  feature        TEXT NOT NULL,
  model          TEXT NOT NULL,
  calls          INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  input_tokens   INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  PRIMARY KEY (day, feature, model)
);

-- one row per member: when the free trial started and until when they have paid
CREATE TABLE memberships (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  trial_start  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_until   TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- a customer's payment by QR (KHQR in USD, or K Bank / PromptPay in THB) with their transfer slip;
-- staff check the slip against the bank and approve, which extends paid_until by `months`.
CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('khqr','kbank')),
  amount       REAL NOT NULL CHECK (amount > 0),
  currency     TEXT NOT NULL CHECK (currency IN ('USD','THB','KHR')),
  months       INTEGER NOT NULL DEFAULT 1 CHECK (months BETWEEN 1 AND 12),
  reference    TEXT CHECK (reference IS NULL OR length(reference) <= 80),
  slip_key     TEXT NOT NULL,
  slip_mime    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note  TEXT CHECK (review_note IS NULL OR length(review_note) <= 300),
  reviewed_by  TEXT REFERENCES users(id),
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX idx_payments_status ON payments(status, created_at);
CREATE INDEX idx_payments_user ON payments(user_id, created_at);

-- an approved payment is a record: it cannot be edited back or deleted
CREATE TRIGGER payments_approved_immutable BEFORE UPDATE ON payments
WHEN OLD.status = 'approved'
BEGIN SELECT RAISE(ABORT, 'approved payment is immutable'); END;
CREATE TRIGGER payments_approved_no_delete BEFORE DELETE ON payments
WHEN OLD.status = 'approved'
BEGIN SELECT RAISE(ABORT, 'approved payment is immutable'); END;

INSERT OR IGNORE INTO settings (key, value) VALUES ('membership_trial_days', '7');
INSERT OR IGNORE INTO settings (key, value) VALUES ('membership_price_usd', '10');
INSERT OR IGNORE INTO settings (key, value) VALUES ('membership_price_thb', '400');
INSERT OR IGNORE INTO settings (key, value) VALUES ('token_budget', '200000000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('token_budget_days', '15');
INSERT OR IGNORE INTO settings (key, value) VALUES ('token_budget_start', strftime('%Y-%m-%d','now'));
