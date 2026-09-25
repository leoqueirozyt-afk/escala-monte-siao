CREATE TABLE notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER REFERENCES ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  month TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notices_month ON notices(month);

ALTER TABLE users ADD COLUMN notices_seen_at TEXT;
