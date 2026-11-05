CREATE TABLE water_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  ml INTEGER NOT NULL CHECK (ml > 0),
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX water_user_date ON water_entries(user_id, date);

-- Daily water target and whether burned (active) calories are added to the calorie budget.
ALTER TABLE goals ADD COLUMN water_ml INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE goals ADD COLUMN add_burned BOOLEAN NOT NULL DEFAULT false;
