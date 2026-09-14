-- 0009 — some clients are ones you lead rather than only work for. The rail
-- gives those their own band, so the flag lives on the client itself.
--
-- Note the word: a contact's *role* may already be "lead", which is somebody
-- else's job title. This is about you, so the column is `leading`.

ALTER TABLE clients ADD COLUMN leading INTEGER NOT NULL DEFAULT 0;
