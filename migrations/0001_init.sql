-- Times are unix epoch milliseconds. Rows are soft-deleted so clients can sync deletions.
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'slate',
  position REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  topic_id TEXT,
  due_at INTEGER,
  all_day INTEGER NOT NULL DEFAULT 0,
  important INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  snoozed_until INTEGER,
  last_nagged_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX tasks_updated_at ON tasks (updated_at);
CREATE INDEX topics_updated_at ON topics (updated_at);
CREATE INDEX tasks_open_due ON tasks (due_at) WHERE done_at IS NULL AND deleted = 0;

CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO topics (id, name, color, position, updated_at) VALUES
  ('personal', 'Personal', 'violet', 1, 1);
