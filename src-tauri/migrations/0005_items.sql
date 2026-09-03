-- 0005 — the pivot. One loop primitive becomes three explicit kinds of item:
--   todo     — always has a deadline. Past it, the item is critical (the only
--              red in the app). The one exception: a todo promoted from an
--              idea has no deadline yet, sits with today's work, and cannot
--              go critical until it is given one.
--   idea     — never has a date. Ideas rest until a day with no dated work,
--              when the three oldest surface; ones you once started go first.
--   waiting  — the ball is in their court. An optional check-in day says when
--              to go chasing; chasing re-arms it.
--
-- The old awareness layer (touchpoints, pulse, flags, events) goes with the
-- loop. Nothing running keeps data in these tables.

DROP TABLE IF EXISTS loop_events;
DROP TABLE IF EXISTS touchpoints;
DROP TABLE IF EXISTS pulse_entries;
DROP TABLE IF EXISTS flags;
DROP TABLE IF EXISTS loops;

CREATE TABLE items (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts (id) ON DELETE SET NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('todo', 'idea', 'waiting')),
  title      TEXT NOT NULL,

  -- Day-granular columns are local 'YYYY-MM-DD'; *_at are UTC ISO instants.
  deadline     TEXT,  -- todo: the day it is owed
  idea_since   TEXT,  -- the day it was first an idea; survives promote/demote
  started_on   TEXT,  -- the day it was picked up; on an idea it means "was in progress"
  sent_on      TEXT,  -- waiting: the day the ball went to them
  checkin_on   TEXT,  -- waiting: when to go asking, if ever
  last_chased_on TEXT,
  chase_count  INTEGER NOT NULL DEFAULT 0,

  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  outcome    TEXT CHECK (outcome IN ('done', 'replied', 'dropped')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at  TEXT,

  CHECK ((status = 'closed') = (outcome IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  -- Ideas carry no dates at all.
  CHECK (kind <> 'idea' OR (deadline IS NULL AND checkin_on IS NULL)),
  -- A todo needs a deadline unless it was picked up from an idea.
  CHECK (kind <> 'todo' OR deadline IS NOT NULL OR started_on IS NOT NULL),
  -- A waiting-on knows when the ball left.
  CHECK (kind <> 'waiting' OR sent_on IS NOT NULL)
);

CREATE INDEX items_client_status ON items (client_id, status);
CREATE INDEX items_deadline ON items (deadline) WHERE status = 'open' AND kind = 'todo';
CREATE INDEX items_checkin ON items (checkin_on) WHERE status = 'open' AND kind = 'waiting';
CREATE INDEX items_ideas ON items (idea_since) WHERE status = 'open' AND kind = 'idea';

-- Old scratch keys (silence notifications, rotation cursors) mean nothing now.
DELETE FROM app_meta;
