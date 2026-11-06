-- Anajak Secondhand: second-hand luxury bag market data for Thailand, Indonesia and Malaysia.
-- Entered by hand by staff, one ranked list per country per month, each row with the source it came from.
-- Nothing is seeded: until staff enter a month, the app shows "no data".
-- Market data is information only: it never feeds an inspection outcome or a certificate.
CREATE TABLE market_trends (
  id          TEXT PRIMARY KEY,
  country     TEXT NOT NULL CHECK (country IN ('TH','ID','MY')),
  period      TEXT NOT NULL CHECK (period GLOB '[2][0-9][0-9][0-9]-[01][0-9]' AND substr(period, 6, 2) BETWEEN '01' AND '12'),
  rank        INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 50),
  brand       TEXT NOT NULL CHECK (length(trim(brand)) BETWEEN 1 AND 80),
  model       TEXT NOT NULL CHECK (length(trim(model)) BETWEEN 1 AND 120),
  movement    TEXT CHECK (movement IS NULL OR movement IN ('up','down','same','new')),
  price_min   INTEGER CHECK (price_min IS NULL OR price_min >= 0),
  price_max   INTEGER CHECK (price_max IS NULL OR price_max >= 0),
  currency    TEXT CHECK (currency IS NULL OR currency IN ('THB','IDR','MYR','USD')),
  note        TEXT CHECK (note IS NULL OR length(note) <= 500),
  -- where the ranking came from (marketplace, sales data, survey…): required, so every row is traceable
  source      TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 3 AND 300),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min),
  CHECK ((price_min IS NULL AND price_max IS NULL) OR currency IS NOT NULL),
  UNIQUE (country, period, rank)
);
CREATE INDEX idx_market_trends_period ON market_trends(country, period);

-- Short market updates shown on the home screen (price moves, new releases, demand notes), each with a source.
CREATE TABLE market_updates (
  id          TEXT PRIMARY KEY,
  country     TEXT CHECK (country IS NULL OR country IN ('TH','ID','MY')),
  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  body        TEXT CHECK (body IS NULL OR length(body) <= 2000),
  source      TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 3 AND 300),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_market_updates_created ON market_updates(created_at);

-- AI assistant chat: only a per-user daily message count is kept (the conversation itself is not stored).
CREATE TABLE ai_chat_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (user_id, day)
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_chat_daily_limit', '30');
