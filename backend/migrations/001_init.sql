CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque bearer tokens; only the SHA-256 hash is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE goals (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal INTEGER NOT NULL,
  protein INTEGER NOT NULL,
  carbs INTEGER NOT NULL,
  fat INTEGER NOT NULL
);

-- Nutrition values per 100 g.
CREATE TABLE foods (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  kcal NUMERIC NOT NULL,
  protein NUMERIC NOT NULL,
  carbs NUMERIC NOT NULL,
  fat NUMERIC NOT NULL,
  serving_grams NUMERIC,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, barcode)
);

-- Macro values are a snapshot for the logged amount.
CREATE TABLE entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  grams NUMERIC NOT NULL,
  kcal NUMERIC NOT NULL,
  protein NUMERIC NOT NULL,
  carbs NUMERIC NOT NULL,
  fat NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entries_user_date ON entries(user_id, date);

CREATE TABLE body_weights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kg NUMERIC NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- user_id NULL = built-in exercise visible to everyone.
CREATE TABLE exercises (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle TEXT NOT NULL
);

CREATE TABLE templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE template_exercises (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  PRIMARY KEY (template_id, position)
);

CREATE TABLE workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX workouts_user_started ON workouts(user_id, started_at DESC);

CREATE TABLE workout_sets (
  id SERIAL PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  weight NUMERIC NOT NULL,
  reps INTEGER NOT NULL
);
CREATE INDEX workout_sets_exercise ON workout_sets(exercise_id);

CREATE TABLE cardio_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL,
  minutes NUMERIC NOT NULL,
  distance_km NUMERIC,
  kcal NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cardio_user_date ON cardio_sessions(user_id, date);

INSERT INTO exercises (name, muscle) VALUES
  ('Bankdrücken', 'Brust'),
  ('Schrägbankdrücken (Kurzhantel)', 'Brust'),
  ('Butterfly', 'Brust'),
  ('Dips', 'Brust'),
  ('Kniebeuge', 'Beine'),
  ('Beinpresse', 'Beine'),
  ('Ausfallschritte', 'Beine'),
  ('Beinstrecker', 'Beine'),
  ('Beinbeuger', 'Beine'),
  ('Rumänisches Kreuzheben', 'Beine'),
  ('Hip Thrust', 'Beine'),
  ('Wadenheben', 'Beine'),
  ('Kreuzheben', 'Rücken'),
  ('Klimmzüge', 'Rücken'),
  ('Latzug', 'Rücken'),
  ('Langhantelrudern', 'Rücken'),
  ('Kabelrudern', 'Rücken'),
  ('Face Pulls', 'Schultern'),
  ('Schulterdrücken', 'Schultern'),
  ('Seitheben', 'Schultern'),
  ('Bizepscurls', 'Arme'),
  ('Hammercurls', 'Arme'),
  ('Trizepsdrücken (Kabel)', 'Arme'),
  ('French Press', 'Arme'),
  ('Plank (Sekunden)', 'Core'),
  ('Crunches', 'Core'),
  ('Beinheben hängend', 'Core');
