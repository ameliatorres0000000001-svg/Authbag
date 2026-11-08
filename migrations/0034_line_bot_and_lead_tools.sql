-- Anajak Secondhand: LINE Official Account (Messaging API) + sharper customer finder.
--
-- LINE: customers who add the shop's LINE OA get answers from the AI (shop knowledge = active AI skills); when they want to
-- order, pay, bargain or send photos, the AI hands over to staff (needs_staff = 1) and staff are told. Staff can link
-- their own LINE to receive shop notifications. Only the last messages are kept for context (old ones are deleted by the
-- cron after 30 days). Secrets: LINE_MESSAGING_SECRET, LINE_MESSAGING_TOKEN (wrangler secret put) — never in the DB.
CREATE TABLE line_contacts (
  line_user_id    TEXT PRIMARY KEY CHECK (length(line_user_id) BETWEEN 10 AND 64),
  display_name    TEXT CHECK (display_name IS NULL OR length(display_name) <= 120),
  role            TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff')),
  staff_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  followed        INTEGER NOT NULL DEFAULT 1 CHECK (followed IN (0,1)),
  needs_staff     INTEGER NOT NULL DEFAULT 0 CHECK (needs_staff IN (0,1)),
  ai_paused_until TEXT,
  messages        INTEGER NOT NULL DEFAULT 0,
  first_seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_message_at TEXT,
  CHECK (role = 'customer' OR staff_user_id IS NOT NULL)
);
CREATE INDEX idx_line_contacts_recent ON line_contacts(role, last_message_at);

CREATE TABLE line_messages (
  id            TEXT PRIMARY KEY,
  line_user_id  TEXT NOT NULL REFERENCES line_contacts(line_user_id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_line_messages_user ON line_messages(line_user_id, created_at);

INSERT OR IGNORE INTO settings (key, value) VALUES ('line_ai_reply', '1'), ('line_notify', '1'), ('line_daily_limit', '20');

-- Customer finder: what the search was for, and how well an account fits the shop's offer (3 strong · 2 medium · 1 weak).
ALTER TABLE leads ADD COLUMN topic TEXT CHECK (topic IS NULL OR length(topic) <= 120);
ALTER TABLE leads ADD COLUMN fit INTEGER CHECK (fit IS NULL OR fit BETWEEN 1 AND 3);
ALTER TABLE lead_runs ADD COLUMN topic TEXT CHECK (topic IS NULL OR length(topic) <= 120);
