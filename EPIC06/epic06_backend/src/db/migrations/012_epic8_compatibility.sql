-- ============================================================================
-- ACADENO LMS — Migration 012: EPIC 08 & Trainer Dashboard Compatibility
-- Adding missing columns to batches and users tables.
-- ============================================================================

-- 1. Alter batches table to add EPIC-08 columns
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code       VARCHAR(50)  UNIQUE,
  ADD COLUMN IF NOT EXISTS schedule_type    VARCHAR(20)  CHECK (schedule_type IN ('weekday','weekend','custom')),
  ADD COLUMN IF NOT EXISTS class_days       JSONB        DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS class_time_start TIME,
  ADD COLUMN IF NOT EXISTS class_time_end   TIME,
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming'
                                            CHECK (status IN ('upcoming','active','completed','cancelled'));

-- 2. Add full_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Populate existing users full_name from students if applicable
UPDATE users 
SET full_name = s.first_name || ' ' || s.last_name
FROM students s 
WHERE users.id = s.user_id AND users.full_name IS NULL;

-- Set default for others
UPDATE users SET full_name = SPLIT_PART(email, '@', 1) WHERE full_name IS NULL;

-- Ensure full_name is NOT NULL after population
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;

-- 3. New trainer_course_pool table for US-HR-04
CREATE TABLE IF NOT EXISTS trainer_course_pool (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  trainer_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by    UUID        NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, trainer_id)
);

-- 4. RLS Policies for trainer_course_pool
ALTER TABLE trainer_course_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_all_trainer_pool ON trainer_course_pool;
CREATE POLICY super_admin_all_trainer_pool ON trainer_course_pool FOR ALL USING (current_setting('app.current_user_role', TRUE) = 'super_admin');

DROP POLICY IF EXISTS hr_all_trainer_pool ON trainer_course_pool;
CREATE POLICY hr_all_trainer_pool ON trainer_course_pool FOR ALL USING (current_setting('app.current_user_role', TRUE) = 'hr');

DROP POLICY IF EXISTS trainer_read_trainer_pool ON trainer_course_pool;
CREATE POLICY trainer_read_trainer_pool ON trainer_course_pool FOR SELECT USING (current_setting('app.current_user_role', TRUE) = 'trainer');
