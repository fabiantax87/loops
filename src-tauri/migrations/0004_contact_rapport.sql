-- How it is with a person, in your own words.
--
-- A number you can read at a glance and a line explaining it — "straight to the
-- point, all business" is as useful as a score, often more so, which is why the
-- note stands on its own and the rating is optional.
--
-- Unlike pulse, this is not a time series. It is a living description of a
-- working relationship, so it is edited in place rather than appended to.

ALTER TABLE contacts ADD COLUMN rapport INTEGER CHECK (rapport BETWEEN 1 AND 10);
ALTER TABLE contacts ADD COLUMN rapport_note TEXT;

-- People who leave are deleted outright now, so nothing sets this.
ALTER TABLE contacts DROP COLUMN archived_at;
