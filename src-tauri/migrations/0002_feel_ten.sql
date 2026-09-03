-- Feel stamps move from a three-way −/0/+ to a 1–10 rating.
--
-- SQLite can't rewrite a CHECK constraint in place, so the table is rebuilt.
-- Nothing references `touchpoints`, which makes the swap safe.
--
-- Existing stamps keep their meaning at the same points the words map to:
--   − → 3   0 → 5   + → 8

CREATE TABLE touchpoints_new (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  loop_id    INTEGER REFERENCES loops (id) ON DELETE SET NULL,
  at         TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'meeting', 'call', 'other')),
  direction  TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  note       TEXT,
  feel       INTEGER CHECK (feel BETWEEN 1 AND 10),
  created_at TEXT NOT NULL
);

INSERT INTO touchpoints_new
  (id, client_id, project_id, loop_id, at, channel, direction, note, feel, created_at)
SELECT
  id, client_id, project_id, loop_id, at, channel, direction, note,
  CASE feel WHEN -1 THEN 3 WHEN 0 THEN 5 WHEN 1 THEN 8 ELSE NULL END,
  created_at
FROM touchpoints;

DROP TABLE touchpoints;

ALTER TABLE touchpoints_new RENAME TO touchpoints;

CREATE INDEX touchpoints_client_at ON touchpoints (client_id, at);
CREATE INDEX touchpoints_loop ON touchpoints (loop_id, direction, at);
