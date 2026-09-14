-- 0008 — the calendar. Tasks learn how long they take, and Google Calendar
-- meetings get a local, read-only cache so the calendar screen renders
-- instantly and offline. Meetings are never edited here — Google owns them.

-- How long a todo takes, in minutes. NULL means the default (30).
ALTER TABLE items ADD COLUMN duration_minutes INTEGER;

-- A window of Google Calendar events, replaced wholesale on every sync.
-- Timed events carry UTC instants; all-day events carry local days with an
-- exclusive end, exactly as Google hands them over.
CREATE TABLE google_events (
  id          TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  start_at    TEXT,
  end_at      TEXT,
  start_day   TEXT,
  end_day     TEXT,
  location    TEXT,
  description TEXT,
  attendees   TEXT,          -- JSON: [{ name, email, self, response }]
  meet_url    TEXT,
  html_link   TEXT,
  status      TEXT NOT NULL DEFAULT 'confirmed',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (calendar_id, id)
);

CREATE INDEX google_events_start ON google_events (start_at);
CREATE INDEX google_events_start_day ON google_events (start_day);

-- The calendars behind those events; syncing skips the disabled ones.
CREATE TABLE google_calendars (
  id      TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
