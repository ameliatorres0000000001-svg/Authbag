-- Chanel Classic Flap: STRUCTURE ONLY (model stub, draft eras, observation vocabulary, capture checklist).
-- NO rules, NO serial tables, NO reference assets. Nothing here can move an outcome: the engine only uses approved
-- rules, and every Chanel rule must be added through the admin UI with a source and the 4-eyes queue.

INSERT INTO models (id, brand_id, slug, name, silhouette, status) VALUES
 ('m_chanel_classic_flap', 'b_chanel', 'classic-flap', 'Classic Flap', 'Flap', 'STUB');

-- Eras split on how the serial is carried. Years are left NULL on purpose: a lead authenticator must enter and
-- approve them from a sourced reference.
INSERT INTO eras (id, model_id, name, start_year, end_year, identifier_type, identifier_notes, status) VALUES
 ('e_chanel_flap_sticker', 'm_chanel_classic_flap', 'Serial sticker inside (with card)', NULL, NULL, 'SERIAL',
  'Serial on a sticker inside the bag, usually with a matching card. Stickers can peel off with age. Years to be confirmed.', 'DRAFT'),
 ('e_chanel_flap_plate',   'm_chanel_classic_flap', 'Metal serial plate (no card)', NULL, NULL, 'SERIAL',
  'Serial engraved on a small metal plate inside the bag. Years and code format to be confirmed.', 'DRAFT');

-- Descriptive vocabulary only. These keys carry no polarity until an approved rule references them.
INSERT INTO observation_defs (key, component_code, value_type, enum_json, label_en, label_km, guidance_en, guidance_km) VALUES
 ('hardware.chain_links','hardware','enum','["closed_soldered","some_open","unclear"]','Chain links: closed (soldered) or open','តំណច្រវ៉ាក់៖ ផ្សារបិទជិត ឬមានចំហ',
  'Check every link along the chain under good light; photograph one link straight on and one at an angle.','ពិនិត្យតំណនីមួយៗពេញខ្សែ ក្រោមពន្លឺល្អ។ ថតតំណមួយត្រង់ៗ និងមួយទៀតពីមុំចំហៀង'),
 ('datecode.serial_form','date_code','enum','["sticker_legible","sticker_damaged","sticker_missing","metal_plate","none_found"]','Serial: what was found','លេខ serial៖ អ្វីដែលរកឃើញ',
  'Record what is there. A missing sticker alone proves nothing: old stickers peel off. Photograph the spot where it should be.','កត់ត្រាអ្វីដែលមាន។ ការបាត់ sticker តែមួយមុខ មិនបញ្ជាក់អ្វីទេ ព្រោះ sticker ចាស់អាចរបក។ ថតកន្លែងដែលវាគួរតែមាន'),
 ('hardware.plating_wear','hardware','enum','["none","light","base_metal_visible"]','Plating wear on hardware/chain','ការរបកស្រទាប់ពណ៌លើផ្នែកដែក/ច្រវ៉ាក់',
  'Condition record only: wear happens on any used bag.','កត់ត្រាស្ថានភាពប៉ុណ្ណោះ៖ កាបូបប្រើហើយណាក៏អាចរបកបាន'),
 ('canvas.quilt_alignment','canvas','enum','["aligned","offset","unsure"]','Quilting lines continue across flap and back pocket','ខ្សែក្រឡាចត្រង្គតភ្ជាប់គ្នារវាង flap និងហោប៉ៅក្រោយ',
  'Photograph square-on where the flap meets the body and across the back pocket.','ថតត្រង់ៗ ត្រង់កន្លែង flap ជួបតួកាបូប និងកាត់ហោប៉ៅក្រោយ');

-- Model-specific capture checklist. Same code as a global template ⇒ overrides it for this model (resolveTemplates).
-- Overrides keep the global component_code, because captures look up their component by template code.
INSERT INTO capture_templates (id, brand_id, model_id, code, component_code, label_en, label_km, guidance_en, guidance_km, required, sort) VALUES
 ('ct_cflap_front',    'b_chanel','m_chanel_classic_flap','front',         'canvas',    'Front, whole bag','ខាងមុខ កាបូបទាំងមូល','Square-on, even daylight, chain laid flat.','ថតត្រង់ៗ ពន្លឺថ្ងៃស្មើ ដាក់ច្រវ៉ាក់រាបស្មើ',1,10),
 ('ct_cflap_back',     'b_chanel','m_chanel_classic_flap','back',          'canvas',    'Back and back pocket quilting','ខាងក្រោយ និងក្រឡាចត្រង្គហោប៉ៅក្រោយ','Square-on so the quilting lines across the pocket are visible.','ថតត្រង់ៗ ឲ្យឃើញខ្សែក្រឡាចត្រង្គកាត់ហោប៉ៅ',1,20),
 ('ct_cflap_handles',  'b_chanel','m_chanel_classic_flap','handles',       'handles',   'Chain eyelets and leather weave','រន្ធច្រវ៉ាក់ និងស្បែកត្បាញក្នុងច្រវ៉ាក់','Both eyelets close up; leather woven through the chain.','ថតរន្ធទាំងពីរជិតៗ និងស្បែកដែលត្បាញក្នុងច្រវ៉ាក់',1,60),
 ('ct_cflap_chain',    'b_chanel','m_chanel_classic_flap','chain_links',   'hardware',  'Chain links (macro)','តំណច្រវ៉ាក់ (ជិត)','One link straight on, one at an angle; show the joint of the link.','ថតតំណមួយត្រង់ៗ និងមួយពីមុំចំហៀង ឲ្យឃើញកន្លែងតភ្ជាប់',1,62),
 ('ct_cflap_stamp',    'b_chanel','m_chanel_classic_flap','heat_stamp',    'heat_stamp','Interior stamp CHANEL ® MADE IN …','ត្រាខាងក្នុង CHANEL ® MADE IN …','Fill the frame; light from the side so the foil and letter edges show.','ថតឲ្យពេញស៊ុម ពន្លឺចំហៀង ឲ្យឃើញ foil និងគែមអក្សរ',1,70),
 ('ct_cflap_serial',   'b_chanel','m_chanel_classic_flap','date_code',     'date_code', 'Serial sticker or metal plate','sticker ឬបន្ទះលេខ serial','White light, whole code sharp. If none is found, photograph where it should be and record "missing".','ពន្លឺស លេខទាំងមូលច្បាស់។ បើរកមិនឃើញ ថតកន្លែងដែលវាគួរមាន ហើយកត់ "បាត់"',1,80),
 ('ct_cflap_zip',      'b_chanel','m_chanel_classic_flap','zipper_pull',   'zipper',    'Interior zip pocket pull','zipper pull ហោប៉ៅខាងក្នុង','Pull and teeth in one frame.','ថត pull និងធ្មេញក្នុងរូបតែមួយ',0,90),
 ('ct_cflap_lock',     'b_chanel','m_chanel_classic_flap','hardware',      'hardware',  'CC turn-lock, front','សោ CC ខាងមុខ','Straight on, then from the side to show depth.','ថតត្រង់ៗ បន្ទាប់មកពីចំហៀងឲ្យឃើញជម្រៅ',1,100),
 ('ct_cflap_lockback', 'b_chanel','m_chanel_classic_flap','turnlock_back', 'hardware',  'Turn-lock back plate and screws','បន្ទះខាងក្រោយសោ និងវីស','Open the flap; plate text and both screws straight on.','បើក flap ថតអក្សរលើបន្ទះ និងវីសទាំងពីរត្រង់ៗ',1,102),
 ('ct_cflap_stitch',   'b_chanel','m_chanel_classic_flap','stitching',     'stitching', 'Quilting stitches (macro)','ថ្នេរក្រឡាចត្រង្គ (ជិត)','One full diamond side in frame so stitches can be counted.','ឲ្យឃើញម្ខាងនៃក្រឡាពេញមួយ ដើម្បីរាប់ថ្នេរ',1,120),
 ('ct_cflap_interior', 'b_chanel','m_chanel_classic_flap','interior',      'lining',    'Interior compartments and pockets','ខាងក្នុង និងហោប៉ៅ','All compartments open, lining colour in daylight.','បើកគ្រប់ចន្លោះ ពណ៌ក្រណាត់ក្នុងពន្លឺថ្ងៃ',1,130);
