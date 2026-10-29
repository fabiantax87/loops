-- 0012 — a Productive booking remembers its budget. Bookings are made against
-- a budget ("Frontend") that belongs to a project and a company; the project
-- column kept only the project's name, so a budget named like a department
-- read as nothing in particular. The calendar now says "BHIC · Frontend".

ALTER TABLE productive_bookings ADD COLUMN budget TEXT;
