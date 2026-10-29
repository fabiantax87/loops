-- 0011 — a client gets an address. Most of what you owe them ends in a mail,
-- so the client page offers a mailto link; the column is optional and plain.

ALTER TABLE clients ADD COLUMN email TEXT;
