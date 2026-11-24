-- 0014 — GitHub pull requests. A pull request left open is a client left
-- waiting, and nothing in the app could see one. Three things change:
--
--   project_repos — which repositories belong to which project. A repository
--                   answers to one project; a project may have several.
--   github_pulls  — a read-only cache of every open pull request that is
--                   yours to move: written by you, assigned to you, or
--                   waiting on your review. Replaced wholesale on every sync.
--   items.pull_key — the todo a pull request made for itself. The key
--                   outlives the cache row, so a pull request that comes back
--                   (a second review round) is recognised as a return.

CREATE TABLE project_repos (
  repo       TEXT PRIMARY KEY COLLATE NOCASE,   -- 'owner/name'
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX project_repos_project ON project_repos (project_id);

CREATE TABLE github_pulls (
  key              TEXT PRIMARY KEY,            -- 'owner/name#123'
  repo             TEXT NOT NULL COLLATE NOCASE,
  number           INTEGER NOT NULL,
  title            TEXT NOT NULL,
  url              TEXT NOT NULL,
  author           TEXT,
  authored         INTEGER NOT NULL DEFAULT 0,
  assigned         INTEGER NOT NULL DEFAULT 0,
  review_requested INTEGER NOT NULL DEFAULT 0,
  draft            INTEGER NOT NULL DEFAULT 0,
  opened_at        TEXT NOT NULL,               -- UTC instants, as GitHub gives them
  updated_at       TEXT NOT NULL,
  -- Whether this appearance of the pull request has been given its todo.
  -- Finishing that todo by hand must not conjure another one.
  tasked           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX github_pulls_repo ON github_pulls (repo);

ALTER TABLE items ADD COLUMN pull_key TEXT;

CREATE INDEX items_pull ON items (pull_key) WHERE pull_key IS NOT NULL;
