-- A deadline or check-in can carry a time of day — local 'HH:MM'. The day
-- keeps deciding where an item sorts and when it goes red; the time only says
-- when to speak up: with one set, the reminder waits for that moment instead
-- of firing first thing in the morning.

ALTER TABLE items ADD COLUMN deadline_time TEXT;
ALTER TABLE items ADD COLUMN checkin_time TEXT;
