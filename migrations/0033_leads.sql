-- Anajak Secondhand: find customers (ស្វែងរកម៉ូយ) — public TikTok accounts that sell second-hand designer bags
-- (often on LIVE) in Thailand, Malaysia and Indonesia: resellers who could buy stock wholesale.
-- Found by an AI web search limited to tiktok.com (an account is kept only when its link really came back from the
-- search) or added by staff. Only public business info is stored: handle, display name, link, what they sell, source.
-- Staff only; staff track who they contacted.
CREATE TABLE leads (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL DEFAULT 'tiktok' CHECK (platform IN ('tiktok')),
  country       TEXT NOT NULL CHECK (country IN ('TH','MY','ID')),
  handle        TEXT NOT NULL CHECK (length(handle) BETWEEN 2 AND 40),
  name          TEXT CHECK (name IS NULL OR length(name) <= 120),
  url           TEXT NOT NULL CHECK (url LIKE 'https://www.tiktok.com/@%'),
  kind          TEXT NOT NULL DEFAULT 'reseller' CHECK (kind IN ('live_seller','reseller','shop')),
  sells         TEXT CHECK (sells IS NULL OR length(sells) <= 300),
  why           TEXT CHECK (why IS NULL OR length(why) <= 300),
  source_url    TEXT CHECK (source_url IS NULL OR length(source_url) <= 500),
  source_title  TEXT CHECK (source_title IS NULL OR length(source_title) <= 200),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','saved','contacted','customer','not_fit')),
  note          TEXT CHECK (note IS NULL OR length(note) <= 500),
  found_by      TEXT NOT NULL CHECK (found_by IN ('ai','staff')),
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_leads_handle ON leads(platform, lower(handle));
CREATE INDEX idx_leads_country ON leads(country, status, created_at);

-- each search (automatic weekly per country, or started by an admin)
CREATE TABLE lead_runs (
  id           TEXT PRIMARY KEY,
  country      TEXT NOT NULL CHECK (country IN ('TH','MY','ID')),
  trigger      TEXT NOT NULL CHECK (trigger IN ('auto','manual')),
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at  TEXT,
  found        INTEGER NOT NULL DEFAULT 0,
  added        INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX idx_lead_runs_country ON lead_runs(country, started_at);

INSERT OR IGNORE INTO settings (key, value) VALUES ('leads_auto', '1');
