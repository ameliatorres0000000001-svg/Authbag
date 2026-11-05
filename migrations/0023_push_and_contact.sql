-- Phone notifications for experts (Web Push). One row per phone/browser that turned notifications on.
CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);

-- The app's own VAPID key pair, created by the Worker on first use (the private key never leaves the server).
CREATE TABLE push_keys (
  id           TEXT PRIMARY KEY CHECK (id = 'vapid'),
  public_key   TEXT NOT NULL,
  private_jwk  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
