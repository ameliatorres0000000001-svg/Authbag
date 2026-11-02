-- Louis Vuitton factory (country) codes and 1980s date-code formats, from resale guides (tier 4):
-- lvcodecalc.com, Fashionphile, Rebag, Lollipuff, Love That Bag. Everything is DRAFT: the decoder shows it as
-- candidates for learning, and nothing counts toward an outcome until a lead authenticator approves it.
-- Codes that guides assign to two countries keep both ("France or USA"); a code never proves anything alone,
-- the country must also match the "Made in" stamp.
-- Upsert only touches draft rows, so a code someone has already approved is left alone.

INSERT INTO factory_codes (id, brand_id, code, country, location, notes, status) VALUES
 ('fc_lv_a0','b_lv','A0','France',NULL,'lvcodecalc. Contains a digit, so the 2-letter formats do not match it yet. CONFIRM.','draft'),
 ('fc_lv_a1','b_lv','A1','France',NULL,'lvcodecalc. Contains a digit, so the 2-letter formats do not match it yet. CONFIRM.','draft'),
 ('fc_lv_a2','b_lv','A2','France',NULL,'lvcodecalc. Contains a digit, so the 2-letter formats do not match it yet. CONFIRM.','draft'),
 ('fc_lv_aa','b_lv','AA','France',NULL,'lvcodecalc. AAS = special order. CONFIRM.','draft'),
 ('fc_lv_ah','b_lv','AH','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_an','b_lv','AN','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ar','b_lv','AR','France',NULL,'lvcodecalc, Fashionphile. CONFIRM.','draft'),
 ('fc_lv_as','b_lv','AS','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ba','b_lv','BA','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_be','b_lv','BE','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_bj','b_lv','BJ','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_bu','b_lv','BU','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_dr','b_lv','DR','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_du','b_lv','DU','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_co','b_lv','CO','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ct','b_lv','CT','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_et','b_lv','ET','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_mb','b_lv','MB','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_mi','b_lv','MI','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_no','b_lv','NO','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ra','b_lv','RA','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ri','b_lv','RI','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_sf','b_lv','SF','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_sl','b_lv','SL','France',NULL,'lvcodecalc (e.g. SL4107 = week 40, 2017). CONFIRM.','draft'),
 ('fc_lv_sn','b_lv','SN','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_sp','b_lv','SP','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_sr','b_lv','SR','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_tj','b_lv','TJ','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_th','b_lv','TH','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_tr','b_lv','TR','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ts','b_lv','TS','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ty','b_lv','TY','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_vi','b_lv','VI','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_vx','b_lv','VX','France',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_lp','b_lv','LP','Germany',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ol','b_lv','OL','Germany',NULL,'Love That Bag guide. CONFIRM.','draft'),
 ('fc_lv_bo','b_lv','BO','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ce','b_lv','CE','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_fo','b_lv','FO','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ma','b_lv','MA','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_pl','b_lv','PL','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_rc','b_lv','RC','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_re','b_lv','RE','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_tb','b_lv','TB','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_td','b_lv','TD','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_nz','b_lv','NZ','Italy',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ca','b_lv','CA','Spain',NULL,'lvcodecalc, Fashionphile, Rebag, Lollipuff. CONFIRM.','draft'),
 ('fc_lv_jj','b_lv','JJ','Spain',NULL,'lvcodecalc: mostly straps. CONFIRM.','draft'),
 ('fc_lv_lo','b_lv','LO','Spain',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_lb','b_lv','LB','Spain',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_gi','b_lv','GI','Spain',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_ub','b_lv','UB','Spain',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_di','b_lv','DI','Switzerland',NULL,'lvcodecalc, Love That Bag. CONFIRM.','draft'),
 ('fc_lv_fa','b_lv','FA','Switzerland',NULL,'lvcodecalc, Love That Bag. CONFIRM.','draft'),
 ('fc_lv_fc','b_lv','FC','United States',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_os','b_lv','OS','United States',NULL,'lvcodecalc. CONFIRM.','draft'),
 ('fc_lv_tx','b_lv','TX','United States',NULL,'lvcodecalc. CONFIRM.','draft'),
 -- codes that guides assign to two countries
 ('fc_lv_bc','b_lv','BC','Italy or Spain (Spain from 2015)',NULL,'lvcodecalc lists BC under Italy and under Spain (2015 onwards). Check the Made in stamp.','draft'),
 ('fc_lv_sa','b_lv','SA','France or Italy',NULL,'lvcodecalc lists SA under France and Italy. Check the Made in stamp.','draft'),
 ('fc_lv_lm','b_lv','LM','Spain or France (2019+)',NULL,'lvcodecalc: Spain; also France from 2019. Check the Made in stamp.','draft'),
 ('fc_lv_la','b_lv','LA','United States or France (2019+)',NULL,'lvcodecalc: USA; also France from 2019. Check the Made in stamp.','draft'),
 ('fc_lv_lw','b_lv','LW','France or Spain',NULL,'lvcodecalc lists LW under France and Spain. Check the Made in stamp.','draft'),
 ('fc_lv_sd','b_lv','SD','United States or France',NULL,'lvcodecalc lists SD under France and USA (San Dimas, California). Check the Made in stamp.','draft'),
 ('fc_lv_fl','b_lv','FL','France or United States',NULL,'lvcodecalc lists FL under France and USA. Check the Made in stamp.','draft'),
 ('fc_lv_fh','b_lv','FH','United States (some guides: Italy)',NULL,'lvcodecalc: USA; one guide also lists Italy. Check the Made in stamp.','draft')
ON CONFLICT (brand_id, code) DO UPDATE SET country = excluded.country, notes = excluded.notes
 WHERE factory_codes.status = 'draft';

-- Earlier formats (draft). Digits are read year first, then month.
--  1982 – mid 1980s: 3–4 digits, e.g. 833 = March 1983, 8312 = December 1983 (no factory letters).
--  mid – late 1980s: the same digits followed by two factory letters, e.g. 8612TH = December 1986, France.
INSERT OR IGNORE INTO datecode_formats (id, brand_id, name, start_year, end_year, pattern, extraction_json, notes, status) VALUES
 ('dc_lv_digits_1982_1986','b_lv','Digits only, year + month (1982–mid 1980s)',1982,1986,
  '^(\d)(\d)(\d)(\d?)()$',
  '{"factoryGroup":5,"periodGroups":[3,4],"yearGroups":[1,2],"periodUnit":"month","yearPivot":80}',
  'lvcodecalc: first two digits = year, the last 1–2 = month. No factory letters. CONFIRM before approving.','draft'),
 ('dc_lv_digits_letters_1986_1989','b_lv','Year + month + 2 factory letters (mid–late 1980s)',1986,1989,
  '^(\d)(\d)(\d)(\d?)([A-Z]{2})$',
  '{"factoryGroup":5,"periodGroups":[3,4],"yearGroups":[1,2],"periodUnit":"month","yearPivot":80}',
  'lvcodecalc: first two digits = year, the last 1–2 = month, then the factory letters. CONFIRM before approving.','draft');
