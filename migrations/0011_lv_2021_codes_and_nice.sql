-- Date codes were still stamped until LV moved to NFC chips (about March 2021), so a code such as PL0241
-- (week 4 of 2021, Italy) falls outside the 2007–2020 format. The existing 2007–2020 format may already be
-- approved, so instead of editing it this adds a separate DRAFT format for 2021 with the same reading
-- (digits 1&3 = week, 2&4 = year). It counts only after a lead authenticator approves it.
INSERT OR IGNORE INTO datecode_formats (id, brand_id, name, start_year, end_year, pattern, extraction_json, notes, status) VALUES
 ('dc_lv_2letter4digit_2021','b_lv','Two-letter factory + 4 digits (2021, until the NFC chip)',2021,2021,
  '^([A-Z]{2})(\d)(\d)(\d)(\d)$',
  '{"factoryGroup":1,"periodGroups":[2,4],"yearGroups":[3,5],"periodUnit":"week","yearPivot":100}',
  'lvcodecalc ("2007 – present (2021)") and resale guides: date codes until the switch to NFC chips around March 2021. Example PL0241 = week 4, 2021. CONFIRM before approving.','draft');

-- Model stubs used by the teaching annotations in docs/annotations/.
-- "Nice" vanity case: Nano / Mini sizes look alike in photos, confirm by size.
INSERT OR IGNORE INTO models (id, brand_id, slug, name, silhouette, status) VALUES
 ('m_lv_nice', 'b_lv', 'nice-vanity', 'Nice (vanity case)', 'Vanity', 'STUB'),
 ('m_lv_josh', 'b_lv', 'josh-backpack', 'Josh Backpack', 'Backpack', 'STUB');
