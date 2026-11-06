-- Body height for the calorie estimates (resting energy via Mifflin-St Jeor).
ALTER TABLE users ADD COLUMN height_cm NUMERIC CHECK (height_cm BETWEEN 100 AND 250);
