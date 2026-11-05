-- AI analysis of a verification request, FOR THE EXPERTS ONLY (never shown to the customer, never a decision).
-- Per point: does the customer's photo match the reference of the same part, differ, or is it unclear (with confidence).
-- A suggested outcome from the system's four outcomes only; the expert decides. Comparing suggestions with the
-- experts' answers gives the AI's track record.
CREATE TABLE verify_ai_reviews (
  id                 TEXT PRIMARY KEY,
  request_id         TEXT NOT NULL REFERENCES verify_requests(id) ON DELETE CASCADE,
  model              TEXT,
  suggested_outcome  TEXT CHECK (suggested_outcome IS NULL OR suggested_outcome IN
                       ('insufficient_evidence','requires_expert_review','concerns_found','consistent_with_references')),
  confidence         REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  findings_json      TEXT NOT NULL DEFAULT '[]',
  summary_en         TEXT CHECK (summary_en IS NULL OR length(summary_en) <= 1500),
  summary_km         TEXT CHECK (summary_km IS NULL OR length(summary_km) <= 1500),
  error              TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (error IS NOT NULL OR suggested_outcome IS NOT NULL)
);
CREATE INDEX idx_ai_reviews_request ON verify_ai_reviews(request_id, created_at);
