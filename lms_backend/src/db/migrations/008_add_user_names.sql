-- Migration: 008_add_user_names.sql
-- Adding full_name column to users table for unified identity mapping.

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Populate existing users full_name from students if applicable
UPDATE users 
SET full_name = s.first_name || ' ' || s.last_name
FROM students s 
WHERE users.id = s.user_id AND users.full_name IS NULL;

-- Set default for others
UPDATE users SET full_name = SPLIT_PART(email, '@', 1) WHERE full_name IS NULL;

ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
