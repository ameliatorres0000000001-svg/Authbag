-- Style / article codes (e.g. MCM "MWT4SED09PF001"): a dictionary of code parts and a table of exact codes -> models.
-- Teaching and identification only; never read by the rules engine. A matching code never proves authenticity.
-- MCM structure inferred from codes on MCM's official site (mcmworldwide.com); rows stay DRAFT until approved.

CREATE TABLE style_code_parts (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id),
  field       TEXT NOT NULL CHECK (field IN ('gender','category','year','season','collection','colour')),
  code        TEXT NOT NULL,
  meaning_en  TEXT NOT NULL,
  meaning_km  TEXT NOT NULL,
  year        INTEGER,
  source      TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  UNIQUE (brand_id, field, code)
);

CREATE TABLE style_codes (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL REFERENCES brands(id),
  code         TEXT NOT NULL,                -- normalized full code, e.g. MMKAAVE07BK001
  model_name   TEXT NOT NULL,
  colour_name  TEXT,
  product_url  TEXT,
  source       TEXT NOT NULL CHECK (source IN ('official_site','resale','ai_web','admin')),
  sources_json TEXT NOT NULL DEFAULT '[]',
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (brand_id, code)
);
CREATE INDEX idx_style_codes_brand ON style_codes(brand_id, code);

INSERT OR IGNORE INTO style_code_parts (id, brand_id, field, code, meaning_en, meaning_km, year, source, status) VALUES
 ('scp_mcm_gender_w',(SELECT id FROM brands WHERE slug='mcm'),'gender','W','Women','នារី',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_gender_m',(SELECT id FROM brands WHERE slug='mcm'),'gender','M','Men','បុរស',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_gender_u',(SELECT id FROM brands WHERE slug='mcm'),'gender','U','Unisex','ប្រើបានទាំងពីរ',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_category_t',(SELECT id FROM brands WHERE slug='mcm'),'category','T','Tote / shopper','កាបូបយួរ (tote)',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_category_k',(SELECT id FROM brands WHERE slug='mcm'),'category','K','Backpack','កាបូបស្ពាយក្រោយ',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_season_s',(SELECT id FROM brands WHERE slug='mcm'),'season','S','Spring / Summer','និទាឃរដូវ / រដូវក្ដៅ',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_season_a',(SELECT id FROM brands WHERE slug='mcm'),'season','A','Autumn / Winter','សរទរដូវ / រដូវរងា',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_collection_ve',(SELECT id FROM brands WHERE slug='mcm'),'collection','VE','Visetos (Stark line)','Visetos (ខ្សែ Stark)',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_collection_bo',(SELECT id FROM brands WHERE slug='mcm'),'collection','BO','München line','ខ្សែ München',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_collection_ma',(SELECT id FROM brands WHERE slug='mcm'),'collection','MA','Milla line','ខ្សែ Milla',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_collection_ta',(SELECT id FROM brands WHERE slug='mcm'),'collection','TA','Aren line','ខ្សែ Aren',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_colour_bk',(SELECT id FROM brands WHERE slug='mcm'),'colour','BK','Black','ខ្មៅ',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_colour_co',(SELECT id FROM brands WHERE slug='mcm'),'colour','CO','Cognac','ត្នោតខ្ចី (Cognac)',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_colour_k8',(SELECT id FROM brands WHERE slug='mcm'),'colour','K8','Green (khaki)','បៃតង (khaki)',NULL,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_0',(SELECT id FROM brands WHERE slug='mcm'),'year','0','2010','2010',2010,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_1',(SELECT id FROM brands WHERE slug='mcm'),'year','1','2011','2011',2011,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_2',(SELECT id FROM brands WHERE slug='mcm'),'year','2','2012','2012',2012,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_3',(SELECT id FROM brands WHERE slug='mcm'),'year','3','2013','2013',2013,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_4',(SELECT id FROM brands WHERE slug='mcm'),'year','4','2014','2014',2014,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_5',(SELECT id FROM brands WHERE slug='mcm'),'year','5','2015','2015',2015,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_6',(SELECT id FROM brands WHERE slug='mcm'),'year','6','2016','2016',2016,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_7',(SELECT id FROM brands WHERE slug='mcm'),'year','7','2017','2017',2017,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_8',(SELECT id FROM brands WHERE slug='mcm'),'year','8','2018','2018',2018,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_9',(SELECT id FROM brands WHERE slug='mcm'),'year','9','2019','2019',2019,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_a',(SELECT id FROM brands WHERE slug='mcm'),'year','A','2020','2020',2020,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_b',(SELECT id FROM brands WHERE slug='mcm'),'year','B','2021','2021',2021,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_c',(SELECT id FROM brands WHERE slug='mcm'),'year','C','2022','2022',2022,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_d',(SELECT id FROM brands WHERE slug='mcm'),'year','D','2023','2023',2023,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_e',(SELECT id FROM brands WHERE slug='mcm'),'year','E','2024','2024',2024,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_f',(SELECT id FROM brands WHERE slug='mcm'),'year','F','2025','2025',2025,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_g',(SELECT id FROM brands WHERE slug='mcm'),'year','G','2026','2026',2026,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_h',(SELECT id FROM brands WHERE slug='mcm'),'year','H','2027','2027',2027,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_i',(SELECT id FROM brands WHERE slug='mcm'),'year','I','2028','2028',2028,'mcmworldwide.com product codes (structure inferred)','draft'),
 ('scp_mcm_year_j',(SELECT id FROM brands WHERE slug='mcm'),'year','J','2029','2029',2029,'mcmworldwide.com product codes (structure inferred)','draft');

INSERT OR IGNORE INTO style_codes (id, brand_id, code, model_name, colour_name, product_url, source, sources_json, status) VALUES
 ('sc_mcm_mmkfave09k8001',(SELECT id FROM brands WHERE slug='mcm'),'MMKFAVE09K8001','Medium Stark Backpack in Visetos','Green','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKFAVE09K8001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKFAVE09K8001.html"]','draft'),
 ('sc_mcm_mmkaave07bk001',(SELECT id FROM brands WHERE slug='mcm'),'MMKAAVE07BK001','Medium Stark Backpack in Visetos','Black','https://us.mcmworldwide.com/en_US/mcm-backpacks/stark-backpack-in-visetos/MMKAAVE07BK001.html','official_site','["https://us.mcmworldwide.com/en_US/mcm-backpacks/stark-backpack-in-visetos/MMKAAVE07BK001.html"]','draft'),
 ('sc_mcm_mmkfsve05co001',(SELECT id FROM brands WHERE slug='mcm'),'MMKFSVE05CO001','Medium Stark Backpack in Visetos','Cognac','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKFSVE05CO001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKFSVE05CO001.html"]','draft'),
 ('sc_mcm_mmkaave32bk001',(SELECT id FROM brands WHERE slug='mcm'),'MMKAAVE32BK001','Small-Medium Stark Side Studs Backpack in Visetos','Black','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKAAVE32BK001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKAAVE32BK001.html"]','draft'),
 ('sc_mcm_mmkasve11bk001',(SELECT id FROM brands WHERE slug='mcm'),'MMKASVE11BK001','Small Stark Backpack in Visetos','Black','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKASVE11BK001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-backpack-in-visetos/MMKASVE11BK001.html"]','draft'),
 ('sc_mcm_mmkeave12bk001',(SELECT id FROM brands WHERE slug='mcm'),'MMKEAVE12BK001','Medium Stark Side Studs Backpack in Visetos','Black','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKEAVE12BK001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKEAVE12BK001.html"]','draft'),
 ('sc_mcm_mmkgave09co001',(SELECT id FROM brands WHERE slug='mcm'),'MMKGAVE09CO001','Medium MCM x We The Best Stark Backpack in Visetos','Cognac','https://us.mcmworldwide.com/en_US/men/bags/backpacks/mcm-x-we-the-best-stark-backpack-in-visetos/MMKGAVE09CO001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/mcm-x-we-the-best-stark-backpack-in-visetos/MMKGAVE09CO001.html"]','draft'),
 ('sc_mcm_mmkgave07co001',(SELECT id FROM brands WHERE slug='mcm'),'MMKGAVE07CO001','Small-Medium Stark Side Studs Backpack in Gold Crystal Visetos','Cognac','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-gold-crystal-visetos/MMKGAVE07CO001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-gold-crystal-visetos/MMKGAVE07CO001.html"]','draft'),
 ('sc_mcm_mmkeave15co001',(SELECT id FROM brands WHERE slug='mcm'),'MMKEAVE15CO001','Small Stark Side Studs Backpack in Visetos','Cognac','https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKEAVE15CO001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/backpacks/stark-side-studs-backpack-in-visetos/MMKEAVE15CO001.html"]','draft'),
 ('sc_mcm_mwtgsma01bk001',(SELECT id FROM brands WHERE slug='mcm'),'MWTGSMA01BK001','Medium Milla Tote in Grained Leather','Black','https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/milla-tote-in-grained-leather/MWTGSMA01BK001.html','official_site','["https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/milla-tote-in-grained-leather/MWTGSMA01BK001.html"]','draft'),
 ('sc_mcm_mwtgsma02bk001',(SELECT id FROM brands WHERE slug='mcm'),'MWTGSMA02BK001','Small Milla Tote in Grained Leather','Black','https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/milla-tote-in-grained-leather/MWTGSMA02BK001.html','official_site','["https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/milla-tote-in-grained-leather/MWTGSMA02BK001.html"]','draft'),
 ('sc_mcm_mwtdabo14bk001',(SELECT id FROM brands WHERE slug='mcm'),'MWTDABO14BK001','Large München Tote in Maxi Monogram Leather','Black','https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/m%C3%BCnchen-tote-in-maxi-monogram-leather/MWTDABO14BK001.html','official_site','["https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/m%C3%BCnchen-tote-in-maxi-monogram-leather/MWTDABO14BK001.html"]','draft'),
 ('sc_mcm_mwtcsbo01co001',(SELECT id FROM brands WHERE slug='mcm'),'MWTCSBO01CO001','X-Large München Tote in Visetos','Cognac','https://us.mcmworldwide.com/en_US/men/bags/totes/m%C3%BCnchen-tote-in-visetos/MWTCSBO01CO001.html','official_site','["https://us.mcmworldwide.com/en_US/men/bags/totes/m%C3%BCnchen-tote-in-visetos/MWTCSBO01CO001.html"]','draft'),
 ('sc_mcm_mwtesbo06co001',(SELECT id FROM brands WHERE slug='mcm'),'MWTESBO06CO001','Large München Tote in Visetos','Cognac','https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/m%C3%BCnchen-tote-in-visetos/MWTESBO06CO001.html','official_site','["https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/m%C3%BCnchen-tote-in-visetos/MWTESBO06CO001.html"]','draft'),
 ('sc_mcm_mwtfata01co001',(SELECT id FROM brands WHERE slug='mcm'),'MWTFATA01CO001','Small Aren School Bag Tote in Visetos','Cognac','https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/aren-school-bag-tote-in-visetos/MWTFATA01CO001.html','official_site','["https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/aren-school-bag-tote-in-visetos/MWTFATA01CO001.html"]','draft'),
 ('sc_mcm_mwt4sed07pf001',(SELECT id FROM brands WHERE slug='mcm'),'MWT4SED07PF001','Leather tote (2014 S/S, "ED" line) — name not confirmed','PF (pink shade, not confirmed)','https://www.walmart.com/c/kp/mcm-tote-bag','resale','["https://www.walmart.com/c/kp/mcm-tote-bag"]','draft');

UPDATE code_guides SET gives_year = 'window',
  where_en = 'Brass logo plate on the outside (engraved number); a white fabric label in an interior seam with the long article code, a second number and "Made in …" (Korea, Italy, Germany, Romania, China…).',
  where_km = 'បន្ទះឡូហ្គោលង្ហិនខាងក្រៅ (លេខឆ្លាក់); ស្លាកក្រណាត់សក្នុងថ្នេរខាងក្នុង មានលេខ article វែង លេខទីពីរ និង "Made in …" (Korea, Italy, Germany, Romania, China…)។',
  example = 'MWT4SED09PF001',
  body_en = 'The long article code on the fabric label reads in parts: M (MCM) · gender (W women, M men) · type (T tote, K backpack) · year (digit 0–9 = 2010–2019, letter A = 2020, B = 2021 …) · season (S spring/summer, A autumn/winter) · line (VE Visetos, BO München, MA Milla …) · model number · colour (BK black, CO cognac …) · 001 size/variant. Example MWT4SED09PF001 = women · tote · 2014 · spring/summer · line ED · model 09 · colour PF. The structure is inferred from codes on MCM''s official site, so treat it as a guide. The plate number and the second label number have no published meaning: use them to check that tag, plate and card agree. Type the code to see the parts and, when known, the exact model.',
  body_km = 'លេខ article វែងលើស្លាកក្រណាត់ អានជាផ្នែកៗ៖ M (MCM) · ភេទ (W នារី, M បុរស) · ប្រភេទ (T tote, K កាបូបស្ពាយក្រោយ) · ឆ្នាំ (លេខ 0–9 = 2010–2019, អក្សរ A = 2020, B = 2021 …) · រដូវ (S និទាឃ/ក្ដៅ, A សរទ/រងា) · ខ្សែ (VE Visetos, BO München, MA Milla …) · លេខម៉ូដែល · ពណ៌ (BK ខ្មៅ, CO cognac …) · 001 ទំហំ/ប្រភេទ។ ឧទាហរណ៍ MWT4SED09PF001 = នារី · tote · 2014 · និទាឃ/ក្ដៅ · ខ្សែ ED · ម៉ូដែល 09 · ពណ៌ PF។ រចនាសម្ព័ន្ធនេះយល់ចេញពីលេខនៅលើគេហទំព័រផ្លូវការ MCM ដូច្នេះប្រើជាការណែនាំ។ លេខលើបន្ទះ និងលេខទីពីរលើស្លាក មិនមានអត្ថន័យផ្សព្វផ្សាយទេ៖ ប្រើវាដើម្បីពិនិត្យថា ស្លាក បន្ទះ និងកាត ស៊ីគ្នា។ វាយលេខ ដើម្បីឃើញផ្នែកនីមួយៗ និងម៉ូដែលពិតប្រាកដ (បើមានក្នុងតារាង)។',
  sources_json = '["https://us.mcmworldwide.com/en_US/mcm-backpacks/stark-backpack-in-visetos/MMKAAVE07BK001.html", "https://us.mcmworldwide.com/en_US/women/bags/totes-shoppers/milla-tote-in-grained-leather/MWTGSMA01BK001.html", "https://legitgrails.com/blogs/mcm/how-to-spot-real-vs-fake-mcm-backpack", "https://www.libascollective.com/tools/serial-number-checker"]'
 WHERE id = 'cg_mcm';
