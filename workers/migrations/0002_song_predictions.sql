CREATE TABLE IF NOT EXISTS song_nominations (
  performance_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  song_name TEXT NOT NULL,
  PRIMARY KEY (performance_id, song_id)
);

CREATE TABLE IF NOT EXISTS song_prediction_votes (
  performance_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('will_sing', 'wont_sing')),
  PRIMARY KEY (performance_id, song_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_song_nominations_performance_id ON song_nominations(performance_id);
CREATE INDEX IF NOT EXISTS idx_song_nominations_song_id ON song_nominations(song_id);
CREATE INDEX IF NOT EXISTS idx_song_prediction_votes_performance_id ON song_prediction_votes(performance_id);
CREATE INDEX IF NOT EXISTS idx_song_prediction_votes_song_id ON song_prediction_votes(song_id);
CREATE INDEX IF NOT EXISTS idx_song_prediction_votes_session_id ON song_prediction_votes(session_id);
