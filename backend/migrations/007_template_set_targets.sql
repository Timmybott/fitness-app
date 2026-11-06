-- Planned weight and reps per set ([{"weight": 80, "reps": 8}, ...]); sets/reps stay as a summary.
ALTER TABLE template_exercises ADD COLUMN targets JSONB NOT NULL DEFAULT '[]';
