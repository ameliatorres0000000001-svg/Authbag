-- LINE Login: the LINE user id ("sub") of an account that signs in with LINE.
ALTER TABLE users ADD COLUMN line_sub TEXT;
CREATE UNIQUE INDEX idx_users_line_sub ON users(line_sub) WHERE line_sub IS NOT NULL;

-- Admins can take a REVOKED certificate out of every list (e.g. after a test). The certificate itself stays,
-- immutable, so its QR code keeps showing "revoked"; a valid certificate cannot be hidden.
CREATE TABLE hengz_certificate_hidden (
  cert_id    TEXT PRIMARY KEY REFERENCES hengz_certificates(id),
  hidden_by  TEXT NOT NULL REFERENCES users(id),
  hidden_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER hengz_cert_hide_only_revoked BEFORE INSERT ON hengz_certificate_hidden
WHEN NOT EXISTS (SELECT 1 FROM hengz_certificates c WHERE c.id = NEW.cert_id AND c.status = 'revoked')
BEGIN SELECT RAISE(ABORT, 'only a revoked certificate can be removed from the lists'); END;
