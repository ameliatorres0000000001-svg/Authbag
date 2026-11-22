-- LINE interpreter: staff talk with customers / wholesale partners (Thai, Malay, Indonesian …) in Khmer.
-- Customer messages (text or voice) are translated into Khmer; staff write Khmer, check the translation, then send it.
-- No AI auto-reply: only staff send. Reuses the line_contacts / line_messages tables of 0034.
-- line_messages.content = what the person wrote or said (customer) / the Khmer text staff wrote;
-- translated = the Khmer translation (customer) / the text sent to the customer.
ALTER TABLE line_contacts ADD COLUMN lang TEXT CHECK (lang IS NULL OR lang IN ('th','ms','id','en','vi','zh','km','other'));
ALTER TABLE line_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','audio'));
ALTER TABLE line_messages ADD COLUMN lang TEXT CHECK (lang IS NULL OR lang IN ('th','ms','id','en','vi','zh','km','other'));
ALTER TABLE line_messages ADD COLUMN translated TEXT CHECK (translated IS NULL OR length(translated) <= 5000);
ALTER TABLE line_messages ADD COLUMN sent_by TEXT REFERENCES users(id) ON DELETE SET NULL;
