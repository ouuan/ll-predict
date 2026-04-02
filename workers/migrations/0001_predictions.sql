CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tour_id TEXT NOT NULL,
  concert_id TEXT NOT NULL,
  performance_id TEXT NOT NULL,
  performance_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  session_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id INTEGER NOT NULL,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  song_id TEXT,
  song_name TEXT,
  text TEXT,
  note TEXT,
  FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS likes (
  prediction_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (prediction_id, session_id)
);

CREATE TABLE IF NOT EXISTS performance_cache (
  performance_id TEXT PRIMARY KEY,
  performance_data TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predictions_tour_id ON predictions(tour_id);
CREATE INDEX IF NOT EXISTS idx_predictions_performance_id ON predictions(performance_id);
CREATE INDEX IF NOT EXISTS idx_predictions_session_id ON predictions(session_id);
CREATE INDEX IF NOT EXISTS idx_prediction_items_prediction_id ON prediction_items(prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_items_song_id ON prediction_items(song_id);
CREATE INDEX IF NOT EXISTS idx_likes_prediction_id ON likes(prediction_id);
CREATE INDEX IF NOT EXISTS idx_likes_session_id ON likes(session_id);
