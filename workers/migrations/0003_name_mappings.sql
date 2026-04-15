CREATE TABLE IF NOT EXISTS performance_names (
  performance_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS song_names (
  song_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO performance_names (performance_id, name)
SELECT
  performance_id,
  performance_name
FROM predictions
WHERE performance_name IS NOT NULL AND trim(performance_name) <> ''
ON CONFLICT(performance_id) DO UPDATE SET
  name = excluded.name
WHERE performance_names.name <> excluded.name;

INSERT INTO song_names (song_id, name)
SELECT
  song_id,
  song_name
FROM prediction_items
WHERE song_id IS NOT NULL AND song_name IS NOT NULL AND trim(song_name) <> ''
ON CONFLICT(song_id) DO UPDATE SET
  name = excluded.name
WHERE song_names.name <> excluded.name;

INSERT INTO song_names (song_id, name)
SELECT
  song_id,
  song_name
FROM song_nominations
WHERE song_name IS NOT NULL AND trim(song_name) <> ''
ON CONFLICT(song_id) DO UPDATE SET
  name = excluded.name
WHERE song_names.name <> excluded.name;

DROP INDEX IF EXISTS idx_predictions_tour_id;
DROP INDEX IF EXISTS idx_predictions_performance_id;
DROP INDEX IF EXISTS idx_predictions_session_id;

-- Backup items before replacing predictions table. This avoids accidental data loss
-- if foreign key cascades are enforced during DROP/RENAME.
CREATE TABLE prediction_items_backup AS
SELECT
  id,
  prediction_id,
  item_order,
  item_type,
  song_id,
  text,
  note
FROM prediction_items;

CREATE TABLE predictions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tour_id TEXT NOT NULL,
  concert_id TEXT NOT NULL,
  performance_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  session_id TEXT NOT NULL
);

INSERT INTO predictions_new (
  id,
  tour_id,
  concert_id,
  performance_id,
  nickname,
  description,
  created_at,
  session_id
)
SELECT
  id,
  tour_id,
  concert_id,
  performance_id,
  nickname,
  description,
  created_at,
  session_id
FROM predictions;

DROP TABLE predictions;
ALTER TABLE predictions_new RENAME TO predictions;

CREATE INDEX IF NOT EXISTS idx_predictions_tour_id ON predictions(tour_id);
CREATE INDEX IF NOT EXISTS idx_predictions_performance_id ON predictions(performance_id);
CREATE INDEX IF NOT EXISTS idx_predictions_session_id ON predictions(session_id);

DROP INDEX IF EXISTS idx_prediction_items_prediction_id;
DROP INDEX IF EXISTS idx_prediction_items_song_id;

CREATE TABLE prediction_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  song_id TEXT,
  text TEXT,
  note TEXT,
  FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
);

INSERT INTO prediction_items_new (
  id,
  prediction_id,
  item_order,
  item_type,
  song_id,
  text,
  note
)
SELECT
  id,
  prediction_id,
  item_order,
  item_type,
  song_id,
  text,
  note
FROM prediction_items_backup;

DROP TABLE prediction_items;
ALTER TABLE prediction_items_new RENAME TO prediction_items;
DROP TABLE prediction_items_backup;

CREATE INDEX IF NOT EXISTS idx_prediction_items_prediction_id ON prediction_items(prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_items_song_id ON prediction_items(song_id);

DROP INDEX IF EXISTS idx_song_nominations_performance_id;
DROP INDEX IF EXISTS idx_song_nominations_song_id;

CREATE TABLE song_nominations_new (
  performance_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  PRIMARY KEY (performance_id, song_id)
);

INSERT INTO song_nominations_new (performance_id, song_id)
SELECT performance_id, song_id
FROM song_nominations;

DROP TABLE song_nominations;
ALTER TABLE song_nominations_new RENAME TO song_nominations;

CREATE INDEX IF NOT EXISTS idx_song_nominations_performance_id ON song_nominations(performance_id);
CREATE INDEX IF NOT EXISTS idx_song_nominations_song_id ON song_nominations(song_id);
