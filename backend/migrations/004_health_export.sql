-- More activity data from the hourly Health import.
ALTER TABLE health_daily ADD COLUMN exercise_min NUMERIC;
ALTER TABLE health_daily ADD COLUMN distance_km NUMERIC;
ALTER TABLE health_daily ADD COLUMN flights INTEGER;

-- Where a weight came from: weights imported from Health must not be exported back to it.
ALTER TABLE body_weights ADD COLUMN source TEXT NOT NULL DEFAULT 'app';

-- The nightly export now works per finished day: a row means that day's nutrition/weight was written to Health.
DROP TABLE health_export;
CREATE TABLE health_export (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE workouts ADD COLUMN health_exported_at TIMESTAMPTZ;
ALTER TABLE cardio_sessions ADD COLUMN health_exported_at TIMESTAMPTZ;
