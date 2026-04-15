CREATE TABLE performance_names_new (
  performance_id TEXT PRIMARY KEY,
  name TEXT
);

INSERT INTO performance_names_new (performance_id, name)
SELECT performance_id, name
FROM performance_names;

DROP TABLE performance_names;
ALTER TABLE performance_names_new RENAME TO performance_names;
