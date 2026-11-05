-- NFC chip reads, to tell a reader whether the same chip ID was read before on other accounts
-- (a chip ID seen on several bags can mean a copied chip). Only a SHA-256 hash of the UID is kept.
CREATE TABLE nfc_scans (
  id          TEXT PRIMARY KEY,
  uid_hash    TEXT NOT NULL CHECK (length(uid_hash) = 64),
  brand       TEXT NOT NULL CHECK (brand IN ('lv','chanel','other')),
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_nfc_scans_uid ON nfc_scans(uid_hash, created_at);
