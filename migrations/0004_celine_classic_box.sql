-- Celine Classic Box: STRUCTURE ONLY (brand, model stub, draft eras, observation vocabulary, capture checklist).
-- NO rules, NO date-code tables, NO reference assets. Nothing here can move an outcome: the engine only uses
-- approved rules, and every Celine rule must be added through the admin UI with a source and the 4-eyes queue.

INSERT INTO brands (id, slug, name, knowledge_status, notes) VALUES
 ('b_celine', 'celine', 'Celine', 'NO_DATA', 'Structure only. Add rules with sources (tier 1–3) before relying on any Celine check.');

INSERT INTO models (id, brand_id, slug, name, silhouette, status) VALUES
 ('m_celine_classic_box', 'b_celine', 'classic-box', 'Classic Box', 'Box', 'STUB');

-- Eras split on the logo change (accented CÉLINE → CELINE). Years are left NULL on purpose: a lead authenticator
-- must enter and approve them from a sourced reference.
INSERT INTO eras (id, model_id, name, start_year, end_year, identifier_type, identifier_notes, status) VALUES
 ('e_celine_box_accent',    'm_celine_classic_box', 'CÉLINE (accented logo)', NULL, NULL, 'UNKNOWN',
  'Interior stamp reads CÉLINE / PARIS. Identifier code format and years to be confirmed by a lead authenticator.', 'DRAFT'),
 ('e_celine_box_no_accent', 'm_celine_classic_box', 'CELINE (logo without accent)', NULL, NULL, 'UNKNOWN',
  'Logo without accent. Years and identifier format to be confirmed.', 'DRAFT');

-- Descriptive vocabulary only. These keys carry no polarity until an approved rule references them.
INSERT INTO observation_defs (key, component_code, value_type, enum_json, label_en, label_km, guidance_en, guidance_km) VALUES
 ('stamp.accent_e','heat_stamp','enum','["accent_present","no_accent","unreadable"]','Accent on the E in the logo','សញ្ញាលើអក្សរ E ក្នុងឡូហ្គោ','Record what is stamped (CÉLINE vs CELINE). The era must match the rest of the bag.','កត់ត្រាអ្វីដែលបោះត្រា (CÉLINE ឬ CELINE)។ era ត្រូវតែស៊ីនឹងផ្នែកផ្សេងទៀតនៃកាបូប'),
 ('datecode.legible','date_code','enum','["legible","partly_legible","illegible"]','Identifier code legibility','ភាពអានបាននៃកូដ','If not fully legible, retake under white light before transcribing.','បើអានមិនបានច្បាស់ សូមថតម្តងទៀតក្រោមពន្លឺស មុនសរសេរកូដ'),
 ('hardware.screw_head','hardware','enum','["star","flat","phillips","other"]','Screw head type','ប្រភេទក្បាលវីស','Photograph the screws straight on; fill the frame.','ថតវីសត្រង់ៗ ឲ្យពេញស៊ុម');

-- Model-specific capture checklist. Same code as a global template ⇒ overrides it for this model (resolveTemplates).
-- Overrides keep the global component_code, because captures look up their component by template code.
INSERT INTO capture_templates (id, brand_id, model_id, code, component_code, label_en, label_km, guidance_en, guidance_km, required, sort) VALUES
 ('ct_cbox_stamp',     'b_celine','m_celine_classic_box','heat_stamp',        'heat_stamp','Logo stamp inside flap (macro)','ត្រាឡូហ្គោខាងក្នុង flap (ជិត)','Fill the frame with CÉLINE/CELINE PARIS; raking light from the side.','ថតឲ្យពេញស៊ុម ជាមួយពន្លឺចំហៀង',1,70),
 ('ct_cbox_madein',    'b_celine','m_celine_classic_box','made_in_stamp',     'heat_stamp','"Made in Italy" stamp','ត្រា "Made in Italy"','Straight on, even light, whole line in frame.','ថតត្រង់ៗ ពន្លឺស្មើ ឲ្យឃើញបន្ទាត់ទាំងមូល',1,72),
 ('ct_cbox_code',      'b_celine','m_celine_classic_box','date_code',         'date_code', 'Interior identifier code','កូដខាងក្នុង','White daylight, no warm cast, no flash glare; the whole code sharp. If none is found, photograph where you looked and mark "not present".','ពន្លឺថ្ងៃស គ្មានពណ៌ទឹកក្រូច គ្មានពន្លឺ flash ចាំង កូដទាំងមូលច្បាស់។ បើរកមិនឃើញ សូមថតកន្លែងដែលបានរក ហើយសម្គាល់ "មិនមាន"',1,80),
 ('ct_cbox_zip',       'b_celine','m_celine_classic_box','zipper_pull',       'zipper',    'Zipper pull & teeth','zipper pull និងធ្មេញ','Pull, teeth and tape ends in one frame.','ថត pull ធ្មេញ និងចុង tape ក្នុងរូបតែមួយ',1,90),
 ('ct_cbox_zipback',   'b_celine','m_celine_classic_box','zipper_slider_back','zipper',    'Back of zipper slider','ខាងក្រោយក្បាល zipper','Turn the slider over and photograph any maker marking straight on.','ត្រឡប់ក្បាល zipper ហើយថតស្លាកក្រុមហ៊ុនត្រង់ៗ',1,92),
 ('ct_cbox_clasp',     'b_celine','m_celine_classic_box','box_clasp',         'hardware',  'Box clasp: front and hinge','ចាក់សោ box: ខាងមុខ និងត្រចៀក','Closed clasp straight on, then the hinge at an angle.','ថតចាក់សោបិទត្រង់ៗ បន្ទាប់មកថតត្រចៀកពីមុំចំហៀង',1,100),
 ('ct_cbox_claspin',   'b_celine','m_celine_classic_box','box_clasp_inner',   'hardware',  'Box clasp: inner plate and screws','ចាក់សោ box: បន្ទះខាងក្នុង និងវីស','Open the flap; photograph the plate behind the clasp and any engraving.','បើក flap ហើយថតបន្ទះខាងក្រោយចាក់សោ និងការឆ្លាក់',1,102),
 ('ct_cbox_buckle',    'b_celine','m_celine_classic_box','strap_buckle',      'hardware',  'Strap buckle, pin and screws','ក្បាលខ្សែ pin និងវីស','Both sides of the buckle; screws straight on.','ថតទាំងពីរខាងនៃក្បាលខ្សែ និងវីសត្រង់ៗ',1,104),
 ('ct_cbox_stitch',    'b_celine','m_celine_classic_box','stitching',         'stitching', 'Flap edge stitching (macro)','ថ្នេរគែម flap (ជិត)','Follow the curved flap corner; keep thread and edge paint in focus.','ថតតាមជ្រុងកោងនៃ flap ឲ្យខ្សែ និងថ្នាំគែមច្បាស់',1,120),
 ('ct_cbox_interior',  'b_celine','m_celine_classic_box','interior',          'lining',    'Interior compartments & pockets','ថតខាងក្នុង និងហោប៉ៅ','All compartments open; one photo of the zip pocket.','បើកគ្រប់ចន្លោះ និងថតហោប៉ៅ zipper មួយរូប',1,130);
