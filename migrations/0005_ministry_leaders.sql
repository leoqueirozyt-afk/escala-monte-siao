CREATE TABLE ministry_leaders (
  ministry_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (ministry_id, user_id),
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO ministry_leaders (ministry_id, user_id)
SELECT id, leader_id FROM ministries WHERE leader_id IS NOT NULL;
