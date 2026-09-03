-- Loops — initial schema.
--
-- Time conventions (enforced by convention, not by SQLite):
--   * `*_at` columns are UTC ISO-8601 instants: '2026-08-28T09:00:00.000Z'.
--   * Day-granular columns (`wake_on`, `expect_by`) are local calendar days:
--     'YYYY-MM-DD'. A loop wakes on a day, not at an instant.
-- Both sort correctly as TEXT, which is why every comparison below is a plain
-- string comparison.

CREATE TABLE clients (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  notes      TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

-- Capture fuzzy-matches on name; two clients differing only in case are a typo.
CREATE UNIQUE INDEX clients_name_unique ON clients (name COLLATE NOCASE);

CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  created_at TEXT NOT NULL
);

CREATE INDEX projects_client ON projects (client_id);
CREATE UNIQUE INDEX projects_client_name ON projects (client_id, name COLLATE NOCASE);

-- The one primitive. A task is (court='mine', wake_kind='date'); a waiting-on is
-- (court='theirs', wake_kind='silence'); an undated intention is wake_kind='none',
-- which is what puts a loop in the idle pool.
CREATE TABLE loops (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  note       TEXT,
  court      TEXT NOT NULL CHECK (court IN ('mine', 'theirs', 'nobody')),

  wake_kind  TEXT NOT NULL DEFAULT 'none' CHECK (wake_kind IN ('none', 'date', 'silence')),
  wake_on    TEXT,   -- wake_kind='date': the day it comes due
  expect_by  TEXT,   -- wake_kind='silence': fires only if nothing inbound by this day
  armed_at   TEXT,   -- when the silence timer was last (re)armed — the outbound touch

  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'closed')),
  outcome    TEXT CHECK (outcome IN ('done', 'dropped', 'superseded')),
  outcome_note TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at  TEXT,

  -- A wake condition and its columns travel together.
  CHECK ((wake_kind = 'date') = (wake_on IS NOT NULL)),
  CHECK ((wake_kind = 'silence') = (expect_by IS NOT NULL)),
  CHECK ((wake_kind = 'silence') = (armed_at IS NOT NULL)),
  -- Snoozing is a wake date in the future, not a separate parking lot.
  CHECK (status <> 'snoozed' OR wake_kind = 'date'),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((status = 'closed') = (outcome IS NOT NULL))
);

CREATE INDEX loops_client_status ON loops (client_id, status);
CREATE INDEX loops_wake_on ON loops (wake_on) WHERE status <> 'closed';
CREATE INDEX loops_expect_by ON loops (expect_by) WHERE status <> 'closed';
CREATE INDEX loops_idle ON loops (client_id) WHERE status = 'open' AND wake_kind = 'none';

-- Append-only history: court changes, chases, closures. Never rewritten, so the
-- client page timeline and the review screen can trust it.
CREATE TABLE loop_events (
  id      INTEGER PRIMARY KEY,
  loop_id INTEGER NOT NULL REFERENCES loops (id) ON DELETE CASCADE,
  at      TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN (
            'created', 'court_changed', 'wake_changed', 'chased',
            'snoozed', 'reopened', 'closed', 'note')),
  from_value TEXT,
  to_value   TEXT,
  note       TEXT
);

CREATE INDEX loop_events_loop ON loop_events (loop_id, at);

CREATE TRIGGER loop_events_no_update BEFORE UPDATE ON loop_events
BEGIN SELECT RAISE(ABORT, 'loop_events is append-only'); END;

CREATE TRIGGER loop_events_no_delete BEFORE DELETE ON loop_events
WHEN (SELECT 1 FROM loops WHERE id = OLD.loop_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'loop_events is append-only'); END;

-- Every contact with a client. An inbound touchpoint linked to a loop is what
-- resolves that loop's silence timer.
CREATE TABLE touchpoints (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  loop_id    INTEGER REFERENCES loops (id) ON DELETE SET NULL,
  at         TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'meeting', 'call', 'other')),
  direction  TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  note       TEXT,
  feel       INTEGER CHECK (feel IN (-1, 0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX touchpoints_client_at ON touchpoints (client_id, at);
CREATE INDEX touchpoints_loop ON touchpoints (loop_id, direction, at);

-- Append-only. Current pulse = latest entry; a project_id IS NULL entry is a
-- client-level reading, which overrides "worst active project".
CREATE TABLE pulse_entries (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  at         TEXT NOT NULL,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  why        TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX pulse_client_at ON pulse_entries (client_id, at);

CREATE TRIGGER pulse_entries_no_update BEFORE UPDATE ON pulse_entries
BEGIN SELECT RAISE(ABORT, 'pulse_entries is append-only'); END;

CREATE TRIGGER pulse_entries_no_delete BEFORE DELETE ON pulse_entries
WHEN (SELECT 1 FROM clients WHERE id = OLD.client_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'pulse_entries is append-only'); END;

-- "This needs a conversation." Cleared, or graduated into a loop.
CREATE TABLE flags (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  reason     TEXT NOT NULL,
  raised_at  TEXT NOT NULL,
  cleared_at TEXT,
  resolution TEXT CHECK (resolution IN ('cleared', 'graduated')),
  loop_id    INTEGER REFERENCES loops (id) ON DELETE SET NULL,
  CHECK ((cleared_at IS NULL) = (resolution IS NULL)),
  CHECK (resolution <> 'graduated' OR loop_id IS NOT NULL)
);

CREATE INDEX flags_open ON flags (client_id) WHERE cleared_at IS NULL;

-- Small key/value scratch for app state that isn't domain data
-- (gap-suggestion rotation cursor, last triage run, …).
CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
