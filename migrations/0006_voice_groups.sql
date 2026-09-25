CREATE TABLE voice_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('F','M')),
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO voice_classifications (name, gender, color, sort_order) VALUES
  ('Soprano', 'F', '#EC4899', 1),
  ('Mezzo-soprano', 'F', '#A855F7', 2),
  ('Contralto', 'F', '#059669', 3),
  ('Tenor', 'M', '#2563EB', 4),
  ('Barítono', 'M', '#D97706', 5),
  ('Baixo', 'M', '#475569', 6);

CREATE TABLE voice_classification_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  classification_id INTEGER NOT NULL REFERENCES voice_classifications(id)
);

CREATE TABLE voice_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('VOZ','MUSICO')),
  name TEXT NOT NULL
);

CREATE TABLE voice_group_members (
  group_id INTEGER NOT NULL REFERENCES voice_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE schedules ADD COLUMN group_id INTEGER REFERENCES voice_groups(id) ON DELETE SET NULL;

CREATE TABLE schedule_group_members (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED')),
  PRIMARY KEY (schedule_id, user_id)
);
