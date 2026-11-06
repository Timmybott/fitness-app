-- Favourite foods (shown first in the search) and age/sex for the calorie estimates.
ALTER TABLE foods ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN birth_year INTEGER CHECK (birth_year BETWEEN 1900 AND 2100);
ALTER TABLE users ADD COLUMN sex TEXT CHECK (sex IN ('m', 'f'));
