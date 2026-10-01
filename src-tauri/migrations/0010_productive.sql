-- 0010 — Productive bookings. Work is planned there in day-level allocations
-- ("6h on this project, Monday to Wednesday"), which the calendar shows as
-- committed time beside meetings and tasks. Productive owns the data; this is
-- a read-only cache, replaced a window at a time on every sync, exactly like
-- the Google Calendar one.

CREATE TABLE productive_bookings (
  id              TEXT PRIMARY KEY,
  project         TEXT NOT NULL,
  client          TEXT,
  start_day       TEXT NOT NULL,   -- local days, both ends inclusive
  end_day         TEXT NOT NULL,
  minutes_per_day INTEGER NOT NULL,
  note            TEXT,
  url             TEXT,
  draft           INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);

CREATE INDEX productive_bookings_days ON productive_bookings (start_day, end_day);
