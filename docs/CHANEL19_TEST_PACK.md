# Chanel 19 test pack (18 hardware photos)

Purpose: test the pipeline end-to-end, NOT to prove authenticity.

- Folder: `test-pack/chanel19/` — 01..18.jpg, `manifest.csv`, `contact_sheet.png`.
- Chanel has status NO_DATA: no approved rules, eras or models. The correct result is
  `insufficient_evidence`. Anything else would be a bug.
- All photos are `label=unknown`, `label_basis=unverified`, `status=quarantine`.
  They cannot become authentic references until a reviewer sets a verified basis
  (receipt, boutique, provider certificate, expert consensus). Seller claim is rejected by the DB.
- The serial reads A0EE63H / A0EE63HJ across photos 02,03,04,08,09,18 (partial in 01).
  Photo 10 and 16 are different fabrics — confirm they belong to the same bag before grouping.
- Quality flags are computed only (blur, brightness, resolution). #09 is a phone crop (low res), #04 is soft.
- Import after deploy: `node scripts/import-assets.mjs https://<worker-url> test-pack/chanel19`
- Next: create bag record, assign photos to stages (hardware / date_code / zipper), run Guided scan,
  then try Compare (it will answer 409 `no_approved_references` until verified Chanel references exist).
