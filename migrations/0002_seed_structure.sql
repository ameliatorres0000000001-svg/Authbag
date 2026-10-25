-- HENGZ AUTHENTIC — structural seed (NO inspections, NO fake telemetry, NO fabricated certificates).
-- Everything that is a factual claim about a brand is seeded as status='draft' and has NO effect on the engine
-- until a human approves it through the 4-eyes queue.

INSERT INTO settings (key, value) VALUES
 ('approvals_required', '2'),                 -- set to 1 only in explicit single-appraiser mode (audit-logged)
 ('min_authentic_supports', '3'),             -- supports needed before 'consistent_with_references'
 ('retrieval_min_authentic_per_model_era', '5'),
 ('finetune_min_authentic_per_model_era', '30'),
 ('finetune_min_counterfeit_per_model_era', '10'),
 ('locale_default', 'km');

INSERT INTO components (code, name_en, name_km) VALUES
 ('heat_stamp', 'Heat stamp / blind stamp', 'ត្រាក្តៅ'),
 ('date_code',  'Date code / identifier',   'កូដកាលបរិច្ឆេទ / អត្តសញ្ញាណ'),
 ('stitching',  'Stitching',                'ថ្នេរ'),
 ('zipper',     'Zipper & pull',            'ហ្ស៊ីប និង puller'),
 ('hardware',   'Hardware (locks, rings, nuts)', 'ផ្នែកដែក (សោ, ចិញ្ចៀន, nut)'),
 ('rivet',      'Rivets',                   'rivet'),
 ('canvas',     'Canvas / leather surface', 'ផ្ទៃ canvas / ស្បែក'),
 ('lining',     'Lining',                   'ក្រណាត់ខាងក្នុង'),
 ('handles',    'Handles & straps',         'ដៃកាន់ និងខ្សែ'),
 ('rfid',       'RFID / NFC chip',          'ឈីប RFID / NFC');

INSERT INTO observation_defs (key, component_code, value_type, enum_json, label_en, label_km, guidance_en, guidance_km) VALUES
 ('stamp.edge_sharpness','heat_stamp','enum','["crisp","soft","blurred"]','Stamp edge sharpness','ភាពច្បាស់នៃគែមអក្សរលើត្រា','Judge at macro level under raking light; compare against an approved reference of the same model/era.','វាយតម្លៃពីរូបថតជិត ក្រោមពន្លឺចំហៀង ប្រៀបធៀបជាមួយ reference ដែលបានអនុម័តនៃម៉ូដែល/ឆ្នាំដូចគ្នា'),
 ('stamp.text','heat_stamp','text',NULL,'Stamp text (transcribe exactly)','អក្សរលើត្រា (សរសេរតាមដើម)','Type exactly what is stamped, including line breaks as /.','សរសេរតាមដើម រួមទាំងការចុះបន្ទាត់ដោយប្រើ /'),
 ('stamp.foil_or_blind','heat_stamp','enum','["gold_foil","blind","other"]','Stamp type','ប្រភេទត្រា',NULL,NULL),
 ('stamp.leather_tone','heat_stamp','enum','["matches_reference","pinkish_purple","too_dark","too_pale","other"]','Tab leather tone vs reference','ពណ៌ស្បែក tab ធៀបនឹង reference','Photograph in daylight with a colour card.','ថតក្នុងពន្លឺថ្ងៃ ជាមួយកាតពណ៌'),
 ('stitch.thread_color','stitching','enum','["yellow","pale_green","black","matching_leather","other"]','Thread colour','ពណ៌ខ្សែស្រឡាយ',NULL,NULL),
 ('stitch.regularity','stitching','enum','["even","uneven_wavy"]','Stitch regularity','ភាពស្មើនៃថ្នេរ','Look at spacing, angle and tension along one full edge.','មើលគម្លាត មុំ និងភាពតឹង តាមគែមមួយពេញ'),
 ('stitch.count','stitching','number',NULL,'Stitch count (defined segment)','ចំនួនថ្នេរ (ផ្នែកដែលបានកំណត់)',NULL,NULL),
 ('datecode.present','date_code','boolean',NULL,'Date code present','មានកូដកាលបរិច្ឆេទ',NULL,NULL),
 ('datecode.value','date_code','text',NULL,'Date code (transcribe)','កូដកាលបរិច្ឆេទ (សរសេរតាមដើម)','Letters then digits, no spaces. The system decodes it using approved tables only.','អក្សរតាមពីក្រោយដោយលេខ គ្មានចន្លោះ។ ប្រព័ន្ធបកស្រាយដោយប្រើតារាងដែលបានអនុម័តតែប៉ុណ្ណោះ'),
 ('zipper.pull_engraving','zipper','enum','["crisp","soft","blurred"]','Zipper pull logo/engraving','ការឆ្លាក់លើ zipper pull',NULL,NULL),
 ('zipper.pull_finish','zipper','enum','["clean","pitted","solder_residue","uneven"]','Zipper pull finish','ផ្ទៃ zipper pull',NULL,NULL),
 ('zipper.slider_marking','zipper','text',NULL,'Slider / tape marking (transcribe)','ស្លាកលើក្បាល zipper / ក្រណាត់ tape',NULL,NULL),
 ('hardware.edge_finish','hardware','enum','["clean","rough","solder_residue"]','Hardware edge & joint finish','ផ្ទៃគែម និងចំណុចភ្ជាប់នៃផ្នែកដែក',NULL,NULL),
 ('hardware.engraving','hardware','enum','["crisp","fuzzy"]','Hardware engraving','ការឆ្លាក់លើផ្នែកដែក',NULL,NULL),
 ('hardware.finish_tone','hardware','enum','["matches_reference","too_glossy","wrong_tone"]','Hardware finish tone','ពណ៌/ភាពរលោងនៃផ្នែកដែក',NULL,NULL),
 ('rivet.lettering','rivet','enum','["crisp","soft","malformed"]','Rivet lettering','អក្សរលើ rivet',NULL,NULL),
 ('canvas.pattern_alignment','canvas','enum','["aligned","misaligned","unsure"]','Pattern alignment at seams','ការតម្រឹមលំនាំត្រង់ថ្នេរ',NULL,NULL),
 ('rfid.chip_status','rfid','enum','["detected_readable","detected_unreadable","not_detected","not_tested"]','NFC/RFID read result','លទ្ធផលអាន NFC/RFID','A readable tag does NOT prove authenticity. Record only what the reader reports.','tag អាចអានបាន មិនបញ្ជាក់ថាពិតទេ។ កត់ត្រាតែអ្វីដែលឧបករណ៍រាយការណ៍');

-- Global 12-point capture checklist (model/brand specific overrides are added through the admin UI)
INSERT INTO capture_templates (id, brand_id, model_id, code, component_code, label_en, label_km, guidance_en, guidance_km, required, sort) VALUES
 ('ct_front',   NULL,NULL,'front',        'canvas',    'Front',                 'ខាងមុខ',               'Full bag, square-on, even daylight.', 'ទាំងមូល ត្រង់ ពន្លឺថ្ងៃស្មើ',1,10),
 ('ct_back',    NULL,NULL,'back',         'canvas',    'Back',                  'ខាងក្រោយ',             NULL,NULL,1,20),
 ('ct_left',    NULL,NULL,'left_side',    'canvas',    'Left side',             'ចំហៀងឆ្វេង',           NULL,NULL,1,30),
 ('ct_right',   NULL,NULL,'right_side',   'canvas',    'Right side',            'ចំហៀងស្តាំ',           NULL,NULL,1,40),
 ('ct_base',    NULL,NULL,'base',         'canvas',    'Base & corners',        'បាត និងជ្រុង',         NULL,NULL,1,50),
 ('ct_handles', NULL,NULL,'handles',      'handles',   'Handles / strap anchors','ដៃកាន់ / ចំណុចភ្ជាប់ខ្សែ',NULL,NULL,1,60),
 ('ct_stamp',   NULL,NULL,'heat_stamp',   'heat_stamp','Heat stamp (macro)',    'ត្រាក្តៅ (ជិត)',        'Fill the frame with the stamp; raking light from the side.','ថតឲ្យពេញស៊ុម ជាមួយពន្លឺចំហៀង',1,70),
 ('ct_datecode',NULL,NULL,'date_code',    'date_code', 'Date code / chip area', 'កូដកាលបរិច្ឆេទ / តំបន់ chip','If none exists, upload a photo of the area and mark "not present".','បើគ្មាន សូមថតតំបន់នោះ ហើយសម្គាល់ "មិនមាន"',0,80),
 ('ct_zipper',  NULL,NULL,'zipper_pull',  'zipper',    'Zipper pull & teeth',   'zipper pull និងធ្មេញ',  NULL,NULL,1,90),
 ('ct_hw',      NULL,NULL,'hardware',     'hardware',  'Hardware close-up',     'ផ្នែកដែក (ជិត)',        NULL,NULL,1,100),
 ('ct_rivet',   NULL,NULL,'rivet',        'rivet',     'Rivet close-up',        'rivet (ជិត)',           NULL,NULL,0,110),
 ('ct_stitch',  NULL,NULL,'stitching',    'stitching', 'Stitching macro',       'ថ្នេរ (ជិត)',           NULL,NULL,1,120),
 ('ct_interior',NULL,NULL,'interior',     'lining',    'Interior & labels',     'ខាងក្នុង និងស្លាក',     NULL,NULL,1,130);

INSERT INTO brands (id, slug, name, knowledge_status, notes) VALUES
 ('b_lv',     'louis-vuitton','Louis Vuitton','LIMITED_DATA','First brand. All brand facts start as draft until approved.'),
 ('b_hermes', 'hermes',       'Hermès',       'NO_DATA',NULL),
 ('b_chanel', 'chanel',       'Chanel',       'NO_DATA',NULL),
 ('b_goyard', 'goyard',       'Goyard',       'NO_DATA',NULL),
 ('b_dior',   'dior',         'Dior',         'NO_DATA',NULL);

-- Model STUBS (names only). No eras, no rules are implied. Experts add eras and rules; coverage screen shows what is missing.
INSERT INTO models (id, brand_id, slug, name, silhouette, status) VALUES
 ('m_lv_speedy_b25',  'b_lv','speedy-bandouliere-25','Speedy Bandoulière 25','Speedy','STUB'),
 ('m_lv_keepall_b',   'b_lv','keepall-bandouliere',  'Keepall Bandoulière',   'Keepall','STUB'),
 ('m_lv_multi_poch',  'b_lv','multi-pochette-accessoires','Multi Pochette Accessoires','Pochette','STUB'),
 ('m_lv_palm_springs','b_lv','palm-springs-mini',    'Palm Springs Mini',     'Backpack','STUB'),
 ('m_lv_avenue_sling','b_lv','avenue-sling-bag',     'Avenue Sling Bag',      'Sling','STUB');

-- DRAFT decoding tables. These come from widely circulated community guides (source tier 4) and MUST be confirmed
-- by a lead authenticator before approval. The engine ignores 'draft' tables for verdicts and only shows them as candidates.
INSERT INTO datecode_formats (id, brand_id, name, start_year, end_year, pattern, extraction_json, notes, status) VALUES
 ('dc_lv_2letter4digit_1990_2006','b_lv','Two-letter factory + 4 digits (1990–2006)',1990,2006,
  '^([A-Z]{2})(\d)(\d)(\d)(\d)$',
  '{"factoryGroup":1,"periodGroups":[2,4],"yearGroups":[3,5],"periodUnit":"month","yearPivot":90}',
  'Community guides: digits 1&3 = month, digits 2&4 = year. CONFIRM before approving.','draft'),
 ('dc_lv_2letter4digit_2007_2020','b_lv','Two-letter factory + 4 digits (2007–2020)',2007,2020,
  '^([A-Z]{2})(\d)(\d)(\d)(\d)$',
  '{"factoryGroup":1,"periodGroups":[2,4],"yearGroups":[3,5],"periodUnit":"unconfirmed","yearPivot":100}',
  'Year = digits 2&4 per community guides. Whether digits 1&3 are week or month is UNCONFIRMED — lead authenticator must decide.','draft');

INSERT INTO factory_codes (id, brand_id, code, country, location, notes, status) VALUES
 ('fc_lv_sd','b_lv','SD','United States','San Dimas, California','Consistent with a "made in U.S.A." tab in owner-supplied photos. CONFIRM.','draft');

-- DRAFT rules distilled from the owner-supplied counterfeit-vs-authentic comparison images (2026-10-23).
-- Provenance of those images is unverified, so every rule is tier 4 + draft. They appear in the UI as "unverified hints" only.
INSERT INTO rules (id, code, brand_id, model_id, era_id, component_code, observation_key, check_json, polarity, severity, required, title_en, title_km, rationale, source_tier, citations_json, status, version) VALUES
 ('r_lv_stamp_edge_c','LV-STAMP-EDGE-C','b_lv',NULL,NULL,'heat_stamp','stamp.edge_sharpness','{"type":"in","values":["blurred"]}','concern_indicator','major',0,'Heat-stamp edges blurred / mushy','គែមអក្សរលើត្រាព្រិល / ទន់','Owner comparison images show soft, shallow letterforms on the counterfeit examples versus sharp, even impressions.',4,'[{"type":"user_supplied_image","note":"counterfeit-vs-authentic comparison, provenance unverified"}]','draft',1),
 ('r_lv_stamp_edge_a','LV-STAMP-EDGE-A','b_lv',NULL,NULL,'heat_stamp','stamp.edge_sharpness','{"type":"in","values":["crisp"]}','authentic_indicator','minor',0,'Heat-stamp edges crisp','គែមអក្សរលើត្រាច្បាស់',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_stitch_reg_c','LV-STITCH-REG-C','b_lv',NULL,NULL,'stitching','stitch.regularity','{"type":"in","values":["uneven_wavy"]}','concern_indicator','major',0,'Stitching uneven / wavy','ថ្នេរមិនស្មើ / រលក','Wavy, inconsistent tab stitching appears in the counterfeit example of the owner comparison image.',4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_stitch_reg_a','LV-STITCH-REG-A','b_lv',NULL,NULL,'stitching','stitch.regularity','{"type":"in","values":["even"]}','authentic_indicator','minor',1,'Stitching even','ថ្នេរស្មើ',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_stitch_col_c','LV-STITCH-COLOR-C','b_lv',NULL,NULL,'stitching','stitch.thread_color','{"type":"in","values":["pale_green"]}','concern_indicator','minor',0,'Pale-green thread on natural-leather tab','ខ្សែស្រឡាយពណ៌បៃតងស្លេកលើ tab ស្បែកធម្មជាតិ','Thread colour varies by line and era; scope this rule to a model/era before approval.',4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_stamp_tone_c','LV-STAMP-TONE-C','b_lv',NULL,NULL,'heat_stamp','stamp.leather_tone','{"type":"in","values":["pinkish_purple"]}','concern_indicator','minor',0,'Pinkish-purple tab leather tone','ពណ៌ស្បែក tab ទៅខាងពណ៌ផ្កាឈូក-ស្វាយ','Needs colour-card calibrated photos before approval.',4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_hw_edge_c','LV-HW-EDGE-C','b_lv',NULL,NULL,'hardware','hardware.edge_finish','{"type":"in","values":["rough","solder_residue"]}','concern_indicator','major',0,'Hardware joints rough / solder residue','ចំណុចភ្ជាប់ផ្នែកដែកគ្រើម / មានស្នាមប្រៃ','Owner comparison shows visible solder blobs and uneven polishing on the counterfeit nut and ring.',4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_hw_edge_a','LV-HW-EDGE-A','b_lv',NULL,NULL,'hardware','hardware.edge_finish','{"type":"in","values":["clean"]}','authentic_indicator','minor',0,'Hardware joints clean','ចំណុចភ្ជាប់ផ្នែកដែកស្អាត',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_hw_engr_c','LV-HW-ENGR-C','b_lv',NULL,NULL,'hardware','hardware.engraving','{"type":"in","values":["fuzzy"]}','concern_indicator','major',0,'Hardware engraving fuzzy','ការឆ្លាក់លើផ្នែកដែកព្រិល',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_hw_engr_a','LV-HW-ENGR-A','b_lv',NULL,NULL,'hardware','hardware.engraving','{"type":"in","values":["crisp"]}','authentic_indicator','minor',0,'Hardware engraving crisp','ការឆ្លាក់លើផ្នែកដែកច្បាស់',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_zip_engr_c','LV-ZIP-ENGR-C','b_lv',NULL,NULL,'zipper','zipper.pull_engraving','{"type":"in","values":["blurred"]}','concern_indicator','major',0,'Zipper-pull logo blurred','ឡូហ្គោលើ zipper pull ព្រិល',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_zip_engr_a','LV-ZIP-ENGR-A','b_lv',NULL,NULL,'zipper','zipper.pull_engraving','{"type":"in","values":["crisp"]}','authentic_indicator','minor',0,'Zipper-pull logo crisp','ឡូហ្គោលើ zipper pull ច្បាស់',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1),
 ('r_lv_zip_fin_c','LV-ZIP-FINISH-C','b_lv',NULL,NULL,'zipper','zipper.pull_finish','{"type":"in","values":["pitted","solder_residue","uneven"]}','concern_indicator','minor',0,'Zipper-pull finish pitted / uneven','ផ្ទៃ zipper pull មានរណ្តៅ / មិនស្មើ',NULL,4,'[{"type":"user_supplied_image","note":"provenance unverified"}]','draft',1);

-- Provider directory. Status stays 'not_configured' until a REAL connection test succeeds (DB CHECK enforces this).
INSERT INTO providers (id, name, status, config_json) VALUES
 ('entrupy','Entrupy','not_configured','{"base_url":"","notes":"Verify base URL and auth scheme against developer.entrupy.com after receiving an API key. Business license + verified web presence are required by the provider."}'),
 ('realauthentication','Real Authentication','not_configured','{}'),
 ('legitapp','LegitApp','not_configured','{}');
