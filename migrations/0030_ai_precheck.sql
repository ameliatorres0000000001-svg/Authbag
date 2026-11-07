-- Anajak Secondhand: AI pre-check. The owner paused expert review (2026-11): customers get the AI's comparison
-- with the reference photos right after sending (per point: matches / differs / unclear) and a capped summary
-- (more photos / concerns / unclear / no differences seen in these photos). Never "authentic", never a
-- certificate — certificates still need a named expert's answer (0018 triggers unchanged).
-- expert_review_enabled: 1 = experts answer requests (Telegram / push), 0 = paused. Admins switch it.
INSERT OR IGNORE INTO settings (key, value) VALUES ('expert_review_enabled', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_precheck_daily_limit', '5');
