-- LINE / WhatsApp interpreter: staff talk with customers / partners (Thai, Malay, Indonesian …) in Khmer.
-- Customer messages (text or voice) are translated into Khmer; staff write Khmer, check the translation, then send it.
-- No AI auto-reply: only staff send. Contact id = the LINE user id, or "wa:<number>" for WhatsApp.
--
-- The production database never got the LINE tables that 0034 describes (0034 was applied there without them), so this
-- migration creates them. It drops any older copy first: those tables only held a chat cache that is deleted after 30
-- days, nothing else reads them, and an older shape would not have the translation columns.
DROP TABLE IF EXISTS line_messages;
DROP TABLE IF EXISTS line_contacts;

CREATE TABLE line_contacts (
  line_user_id    TEXT PRIMARY KEY CHECK (length(line_user_id) BETWEEN 10 AND 64),
  display_name    TEXT CHECK (display_name IS NULL OR length(display_name) <= 120),
  role            TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff')),
  staff_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  followed        INTEGER NOT NULL DEFAULT 1 CHECK (followed IN (0,1)),
  needs_staff     INTEGER NOT NULL DEFAULT 0 CHECK (needs_staff IN (0,1)),
  lang            TEXT CHECK (lang IS NULL OR lang IN ('th','ms','id','en','vi','zh','km','other')),
  messages        INTEGER NOT NULL DEFAULT 0,
  first_seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_message_at TEXT
);
CREATE INDEX idx_line_contacts_recent ON line_contacts(role, last_message_at);

-- content = what the person wrote or said (customer) / the Khmer text staff wrote;
-- translated = the Khmer translation (customer) / the text that was sent to the customer.
CREATE TABLE line_messages (
  id            TEXT PRIMARY KEY,
  line_user_id  TEXT NOT NULL REFERENCES line_contacts(line_user_id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  kind          TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','audio')),
  content       TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  lang          TEXT CHECK (lang IS NULL OR lang IN ('th','ms','id','en','vi','zh','km','other')),
  translated    TEXT CHECK (translated IS NULL OR length(translated) <= 5000),
  sent_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_line_messages_user ON line_messages(line_user_id, created_at);
