-- Buy-back offers: after the experts answered "consistent with references", HENGZ AUTHENTIC can offer to buy the
-- bag back, and the customer can send the price they want. Each offer is answered once (accepted / declined),
-- withdrawn by its sender, or superseded by a newer offer. Amounts are whole cents.
CREATE TABLE buyback_offers (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES verify_requests(id),
  from_side     TEXT NOT NULL CHECK (from_side IN ('hengz','customer')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  currency      TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  note          TEXT CHECK (note IS NULL OR length(note) <= 500),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined','withdrawn','superseded')),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_by  TEXT REFERENCES users(id),
  responded_at  TEXT,
  CHECK (status = 'open' OR responded_at IS NOT NULL)
);
CREATE INDEX idx_buyback_request ON buyback_offers(request_id, created_at);

-- an offer can be made only once the experts answered "consistent with references"
CREATE TRIGGER buyback_requires_consistent BEFORE INSERT ON buyback_offers
WHEN NOT EXISTS (SELECT 1 FROM verify_requests r WHERE r.id = NEW.request_id AND r.status = 'answered' AND r.expert_outcome = 'consistent_with_references')
BEGIN SELECT RAISE(ABORT, 'buy-back offer requires an expert answer: consistent_with_references'); END;

-- an offer is answered once; amount, sender and request never change
CREATE TRIGGER buyback_answer_once BEFORE UPDATE ON buyback_offers
WHEN NOT (OLD.status = 'open' AND NEW.status <> 'open'
  AND NEW.id = OLD.id AND NEW.request_id = OLD.request_id AND NEW.from_side = OLD.from_side AND NEW.amount_cents = OLD.amount_cents
  AND NEW.currency = OLD.currency AND NEW.note IS OLD.note AND NEW.created_by = OLD.created_by AND NEW.created_at = OLD.created_at)
BEGIN SELECT RAISE(ABORT, 'buy-back offer is answered once and never edited'); END;

CREATE TRIGGER buyback_no_delete BEFORE DELETE ON buyback_offers
BEGIN SELECT RAISE(ABORT, 'buy-back offers are kept; withdraw instead of deleting'); END;
