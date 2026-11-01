-- Lessons: a step-by-step "how to look" guide per model (km + en). Teaching text only: the rules engine never reads
-- lesson_steps, so nothing here can change an inspection outcome. Seeded steps are DRAFT research summaries
-- (resale-guide sources, tier 4) until a lead authenticator approves them.

CREATE TABLE lesson_steps (
  id              TEXT PRIMARY KEY,
  model_id        TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  sort            INTEGER NOT NULL DEFAULT 100,
  component_code  TEXT REFERENCES components(code),
  title_en        TEXT NOT NULL,
  title_km        TEXT NOT NULL,
  body_en         TEXT NOT NULL,
  body_km         TEXT NOT NULL,
  -- [{"en":"feature","km":"…","look_en":"what to look for","look_km":"…"}]
  checks_json     TEXT NOT NULL DEFAULT '[]',
  source_note     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  UNIQUE (model_id, sort)
);
CREATE INDEX idx_lesson_model ON lesson_steps(model_id, sort);

-- Photos can be attached to one lesson step (genuine or counterfeit, labelled by the uploader).
ALTER TABLE reference_assets ADD COLUMN lesson_step_id TEXT REFERENCES lesson_steps(id) ON DELETE SET NULL;
CREATE INDEX idx_assets_lesson ON reference_assets(lesson_step_id);

INSERT OR IGNORE INTO models (id, brand_id, slug, name, silhouette, status) VALUES
 ('m_chanel_19', 'b_chanel', 'chanel-19-flap', 'Chanel 19 Flap Bag', 'Flap', 'STUB');

INSERT INTO lesson_steps (id, model_id, sort, component_code, title_en, title_km, body_en, body_km, checks_json, source_note, status) VALUES
 ('ls_c19_overall','m_chanel_19',10,'canvas',
  'Overall shape and quilting','រាងទូទៅ និងក្រឡាចត្រង្គ',
  'Chanel 19 has oversized, soft and puffy diamond quilting. Look at the whole bag first, square-on in daylight: the diamonds should be the same size on both sides, and the lines should continue from the flap onto the body without jumping.',
  'Chanel 19 មានក្រឡាចត្រង្គធំ ទន់ និងប៉ោង។ មើលកាបូបទាំងមូលជាមុន ថតត្រង់ៗក្នុងពន្លឺថ្ងៃ៖ ក្រឡាទាំងសងខាងគួរមានទំហំស្មើគ្នា ហើយខ្សែគួរតភ្ជាប់ពី flap ចុះមកតួកាបូប ដោយមិនលោត។',
  '[{"en":"Diamond size","km":"ទំហំក្រឡា","look_en":"Same size left and right, symmetrical around the lock","look_km":"ទំហំដូចគ្នាឆ្វេង-ស្តាំ ស៊ីមេទ្រីជុំវិញសោ"},{"en":"Line continuity","km":"ការតភ្ជាប់ខ្សែ","look_en":"Quilting lines run on from flap to body","look_km":"ខ្សែក្រឡាបន្តពី flap ទៅតួ"},{"en":"Stitch evenness","km":"ភាពស្មើនៃថ្នេរ","look_en":"Small, even, straight stitches along each line","look_km":"ថ្នេរតូច ស្មើ ត្រង់ តាមខ្សែនីមួយៗ"}]',
  'Resale authentication guides (Retyche, The Luxury Closet). Draft.','draft'),
 ('ls_c19_chain','m_chanel_19',20,'handles',
  'Chain, woven leather and shoulder pad','ច្រវ៉ាក់ ស្បែកត្បាញ និងទ្រនាប់ស្មា',
  'The 19 chain mixes metal tones (gold, silver and ruthenium-coloured links) with leather woven through it, and a wide leather pad where it rests on the shoulder. Check that the leather is woven evenly through every link and that the links are closed and smooth, with a consistent finish.',
  'ច្រវ៉ាក់ Chanel 19 លាយពណ៌ដែក (មាស ប្រាក់ និងពណ៌ ruthenium) ជាមួយស្បែកត្បាញឆ្លងកាត់ ហើយមានទ្រនាប់ស្បែកធំត្រង់ស្មា។ ពិនិត្យថាស្បែកត្បាញស្មើគ្រប់តំណ តំណបិទជិត រលោង និងពណ៌ផ្ទៃដូចគ្នា។',
  '[{"en":"Leather weave","km":"ស្បែកត្បាញ","look_en":"Even tension, no twists or gaps through each link","look_km":"តឹងស្មើ មិនរមួល មិនចំហ គ្រប់តំណ"},{"en":"Link joints","km":"កន្លែងតភ្ជាប់តំណ","look_en":"Closed, smooth joints; no rough solder","look_km":"បិទជិត រលោង គ្មានស្នាមផ្សារគ្រើម"},{"en":"Finish","km":"ផ្ទៃដែក","look_en":"Same finish on every link of one tone; weighty, not hollow","look_km":"ផ្ទៃដូចគ្នាគ្រប់តំណនៃពណ៌មួយ ធ្ងន់ មិនប្រហោង"}]',
  'Resale authentication guides (Retyche, Luxury Evermore). Draft.','draft'),
 ('ls_c19_cc','m_chanel_19',30,'hardware',
  'CC turn-lock, front','សោ CC ខាងមុខ',
  'The large CC lock on the 19 has leather woven through its links. Look straight on, then from the side. Both Cs should be the same width and thickness, interlock evenly (one C passes over at the top and under at the bottom), and the turn piece should sit centred.',
  'សោ CC ធំលើ Chanel 19 មានស្បែកត្បាញក្នុងតំណ។ មើលត្រង់ៗ រួចមើលពីចំហៀង។ អក្សរ C ទាំងពីរគួរមានទទឹង និងកម្រាស់ស្មើគ្នា ពាក់គ្នាស្មើ (C មួយឆ្លងពីលើនៅខាងលើ និងពីក្រោមនៅខាងក្រោម) ហើយក្បាលបង្វិលនៅកណ្តាល។',
  '[{"en":"C proportions","km":"សមាមាត្រ C","look_en":"Both Cs equal width and thickness","look_km":"C ទាំងពីរទទឹង និងកម្រាស់ស្មើ"},{"en":"Overlap","km":"ការពាក់គ្នា","look_en":"Even, alternating overlap top and bottom","look_km":"ពាក់គ្នាស្មើ ឆ្លាស់លើ-ក្រោម"},{"en":"Centring","km":"ទីតាំងកណ្តាល","look_en":"Turn piece centred; lock straight on the flap","look_km":"ក្បាលបង្វិលនៅកណ្តាល សោត្រង់លើ flap"}]',
  'Resale authentication guides. Draft: confirm against verified photos of the same season.','draft'),
 ('ls_c19_lockback','m_chanel_19',40,'hardware',
  'Turn-lock back plate and screws','បន្ទះខាងក្រោយសោ និងវីស',
  'Open the flap and look at the plate behind the lock. The CHANEL lettering should be crisp with clean edges, letters the same height and evenly spaced; the screws should sit flush and straight. Shoot straight on, then at an angle with side light to see the depth of the letters.',
  'បើក flap ហើយមើលបន្ទះខាងក្រោយសោ។ អក្សរ CHANEL គួរច្បាស់ គែមស្អាត កម្ពស់ស្មើ គម្លាតស្មើ ហើយវីសគួរដាក់ស្មើផ្ទៃ និងត្រង់។ ថតត្រង់ៗ រួចថតពីមុំចំហៀង ជាមួយពន្លឺចំហៀង ដើម្បីឃើញជម្រៅអក្សរ។',
  '[{"en":"Letter edges","km":"គែមអក្សរ","look_en":"Sharp, clean edges; no blobs or pits","look_km":"គែមស្រួច ស្អាត គ្មានដុំ ឬរន្ធ"},{"en":"Letter height & spacing","km":"កម្ពស់ និងគម្លាតអក្សរ","look_en":"Same height, even gaps, straight baseline","look_km":"កម្ពស់ស្មើ គម្លាតស្មើ បន្ទាត់ត្រង់"},{"en":"Screws","km":"វីស","look_en":"Flush, straight, matching finish","look_km":"ស្មើផ្ទៃ ត្រង់ ពណ៌ដូចបន្ទះ"}]',
  'Resale authentication guides. Draft.','draft'),
 ('ls_c19_marks','m_chanel_19',50,'hardware',
  'Stamped marks on hardware','ត្រាលើផ្នែកដែក',
  'Small stamped letters on chain tabs or hardware are easy to fake badly. Use the lens viewer (Relief, Edges) on a close-up: the stamp should be pressed evenly, letters fully formed, centred on the tab, with the same texture as the surrounding metal.',
  'អក្សរតូចៗដែលបោះត្រាលើ tab ច្រវ៉ាក់ ឬផ្នែកដែក ពិបាកចម្លងឲ្យល្អ។ ប្រើកែវពង្រីក (ជម្រៅ 3D គែមអក្សរ) លើរូបជិត៖ ត្រាគួរចុចស្មើ អក្សរពេញរាង នៅកណ្តាល tab និងមានផ្ទៃដូចដែកជុំវិញ។',
  '[{"en":"Depth","km":"ជម្រៅ","look_en":"Even pressure across every letter","look_km":"ចុចស្មើគ្រប់អក្សរ"},{"en":"Letter form","km":"រាងអក្សរ","look_en":"Complete shapes, no broken strokes","look_km":"រាងពេញ គ្មានខ្សែដាច់"},{"en":"Position","km":"ទីតាំង","look_en":"Centred and straight on the tab","look_km":"នៅកណ្តាល និងត្រង់លើ tab"}]',
  'General hardware-stamp guidance from resale guides. Draft.','draft'),
 ('ls_c19_serial','m_chanel_19',60,'date_code',
  'Serial: metal plate (2021+) or sticker','Serial៖ បន្ទះដែក (2021+) ឬ sticker',
  'From about spring 2021 Chanel replaced the serial sticker and card with a small metal plate inside the bag: an engraved CC logo above an 8-character code of letters and digits (e.g. A0EE63HJ), with a microchip that only Chanel boutiques can scan. The code is random and does NOT tell you the year. Older bags have a sticker (7 or 8 digits) and a matching card. Check that the plate is flush and secure, and the engraving even: all characters the same height, evenly spaced, on a straight line, same texture as the CC.',
  'ចាប់ពីប្រហែលនិទាឃរដូវឆ្នាំ 2021 Chanel ប្តូរ sticker និងកាត serial ទៅជាបន្ទះដែកតូចក្នុងកាបូប៖ ឡូហ្គោ CC ឆ្លាក់ នៅលើកូដ 8 តួ (អក្សរ និងលេខ ឧ. A0EE63HJ) ហើយមាន microchip ដែលមានតែហាង Chanel ទេ ទើបស្កេនបាន។ កូដនេះចៃដន្យ មិនប្រាប់ឆ្នាំផលិតទេ។ កាបូបចាស់មាន sticker (7 ឬ 8 ខ្ទង់) និងកាតដែលត្រូវគ្នា។ ពិនិត្យថាបន្ទះជាប់ស្មើផ្ទៃ ហើយការឆ្លាក់ស្មើ៖ តួអក្សរកម្ពស់ស្មើ គម្លាតស្មើ លើបន្ទាត់ត្រង់ និងផ្ទៃដូច CC។',
  '[{"en":"Code length","km":"ប្រវែងកូដ","look_en":"8 characters on a metal plate (2021+), 7–8 digits on a sticker (older)","look_km":"8 តួលើបន្ទះដែក (2021+) ឬ 7–8 ខ្ទង់លើ sticker (ចាស់)"},{"en":"Engraving","km":"ការឆ្លាក់","look_en":"Even height, spacing and baseline; same texture as the CC","look_km":"កម្ពស់ គម្លាត និងបន្ទាត់ស្មើ ផ្ទៃដូច CC"},{"en":"Plate fit","km":"ការភ្ជាប់បន្ទះ","look_en":"Flush and secure, clean edges","look_km":"ស្មើផ្ទៃ ជាប់រឹង គែមស្អាត"},{"en":"Microchip","km":"Microchip","look_en":"Cannot be checked at home; a Chanel boutique can scan it","look_km":"មិនអាចពិនិត្យនៅផ្ទះ ហាង Chanel អាចស្កេនបាន"}]',
  'Fashionphile (metal plate edition, serial codes decoded), Collector''s Cage, Into Archive. Draft.','draft'),
 ('ls_c19_stamp','m_chanel_19',70,'heat_stamp',
  'Interior stamp','ត្រាខាងក្នុង',
  'Inside, the stamp reads CHANEL with the ® symbol and "MADE IN …". Fill the frame and light from the side: letters crisp, evenly spaced, the ® small and round, and the country should fit the rest of the bag.',
  'ខាងក្នុង ត្រាសរសេរ CHANEL មានសញ្ញា ® និង "MADE IN …"។ ថតឲ្យពេញស៊ុម ពន្លឺចំហៀង៖ អក្សរច្បាស់ គម្លាតស្មើ សញ្ញា ® តូច និងមូល ហើយប្រទេសគួរស្របនឹងផ្នែកផ្សេងៗនៃកាបូប។',
  '[{"en":"Lettering","km":"អក្សរ","look_en":"Crisp, even spacing, centred","look_km":"ច្បាស់ គម្លាតស្មើ នៅកណ្តាល"},{"en":"® symbol","km":"សញ្ញា ®","look_en":"Small, round, clearly formed","look_km":"តូច មូល រាងច្បាស់"},{"en":"Made in","km":"Made in","look_en":"Country consistent with the bag","look_km":"ប្រទេសស្របនឹងកាបូប"}]',
  'Resale authentication guides. Draft.','draft');
