-- HENGZ AUTHENTIC expert certificates. Issued BY HAND by a named HENGZ expert (staff), never by the system or AI,
-- and only for a verification request the experts answered "consistent with references".
-- Wording on the certificate: "Verified by a HENGZ AUTHENTIC expert — consistent with HENGZ AUTHENTIC references".
-- Each certificate has a number and a public code (QR) so anyone can check it; it can be revoked, never edited.
CREATE TABLE hengz_certificates (
  id              TEXT PRIMARY KEY,
  cert_no         TEXT NOT NULL UNIQUE,
  public_code     TEXT NOT NULL UNIQUE,
  request_id      TEXT NOT NULL UNIQUE REFERENCES verify_requests(id),
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  model_text      TEXT,
  item_desc       TEXT CHECK (item_desc IS NULL OR length(item_desc) <= 300),
  photo_id        TEXT REFERENCES verify_photos(id),
  customer_name   TEXT NOT NULL,
  expert_id       TEXT NOT NULL REFERENCES users(id),
  expert_name     TEXT NOT NULL,
  issued_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status          TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','revoked')),
  revoked_reason  TEXT CHECK (revoked_reason IS NULL OR length(revoked_reason) <= 300),
  revoked_at      TEXT,
  CHECK (status <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL))
);

-- only for an answered request whose expert outcome is "consistent with references"
CREATE TRIGGER hengz_cert_requires_expert_answer BEFORE INSERT ON hengz_certificates
WHEN NOT EXISTS (SELECT 1 FROM verify_requests r WHERE r.id = NEW.request_id AND r.status = 'answered' AND r.expert_outcome = 'consistent_with_references')
BEGIN SELECT RAISE(ABORT, 'certificate requires an expert answer: consistent_with_references'); END;

-- the issuer must be a staff expert
CREATE TRIGGER hengz_cert_requires_staff BEFORE INSERT ON hengz_certificates
WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.expert_id AND u.role IN ('owner','lead_authenticator','appraiser'))
BEGIN SELECT RAISE(ABORT, 'certificate requires a staff expert'); END;

-- a certificate is immutable: only revocation (valid -> revoked) is allowed
CREATE TRIGGER hengz_cert_immutable BEFORE UPDATE ON hengz_certificates
WHEN NOT (OLD.status = 'valid' AND NEW.status = 'revoked'
  AND NEW.id = OLD.id AND NEW.cert_no = OLD.cert_no AND NEW.public_code = OLD.public_code AND NEW.request_id = OLD.request_id
  AND NEW.brand_id = OLD.brand_id AND NEW.model_text IS OLD.model_text AND NEW.item_desc IS OLD.item_desc AND NEW.photo_id IS OLD.photo_id
  AND NEW.customer_name = OLD.customer_name AND NEW.expert_id = OLD.expert_id AND NEW.expert_name = OLD.expert_name AND NEW.issued_at = OLD.issued_at)
BEGIN SELECT RAISE(ABORT, 'certificate is immutable; only revocation is allowed'); END;

CREATE TRIGGER hengz_cert_no_delete BEFORE DELETE ON hengz_certificates
BEGIN SELECT RAISE(ABORT, 'certificate is immutable; revoke instead of deleting'); END;
