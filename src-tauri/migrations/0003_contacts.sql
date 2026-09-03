-- The people you actually talk to.
--
-- Capture uses these to route a sentence to the right client: write "John" and
-- the loop lands under his client without you naming the company. Names are
-- unique per client, not globally — two clients are each allowed a John, and
-- capture asks which one you meant.

CREATE TABLE contacts (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  role        TEXT,
  created_at  TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX contacts_client ON contacts (client_id);
CREATE UNIQUE INDEX contacts_client_name ON contacts (client_id, name COLLATE NOCASE);
