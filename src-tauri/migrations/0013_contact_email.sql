-- 0013 — email belongs to a person, not a company. The client-level address
-- from 0011 stays in the table but nothing reads it any more; each contact
-- gets their own, optional and plain, and the client page links it.

ALTER TABLE contacts ADD COLUMN email TEXT;
