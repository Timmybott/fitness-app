-- 'shortcut' sessions are long-lived tokens for the iOS Shortcuts health sync.
ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'app';

-- Activity reported by the Shortcuts sync (Apple Health), one row per day.
CREATE TABLE health_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER,
  active_kcal NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- Nutrition totals already written to Apple Health by the shortcut, so each sync only sends the difference.
CREATE TABLE health_export (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kcal NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
