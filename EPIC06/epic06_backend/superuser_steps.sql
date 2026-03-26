-- ================================================================
-- superuser_steps.sql
-- Open pgAdmin, connect as the postgres / admin superuser,
-- then run these statements.
-- ================================================================

-- task_submissions.is_late
ALTER TABLE task_submissions  ADD COLUMN IF NOT EXISTS is_late         BOOLEAN NOT NULL DEFAULT FALSE;

-- content_items.is_downloadable
ALTER TABLE content_items     ADD COLUMN IF NOT EXISTS is_downloadable  BOOLEAN NOT NULL DEFAULT TRUE;

-- tasks.status (FR-CRS-05 consistency with content_items)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'));
UPDATE tasks SET status = 'published' WHERE is_published = TRUE AND status = 'draft';

-- tasks.instructions (renaming from rubric for code consistency)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instructions TEXT;
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'rubric') THEN
        UPDATE tasks SET instructions = rubric WHERE instructions IS NULL;
    END IF;
END $$;

-- ==========================================================================
-- ACADENO LMS — EPIC 8 Database Migrations (Integrated)
-- HR & Admin Management
-- ==========================================================================

-- 1. Alter batches table for US-HR-01
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code       VARCHAR(50)  UNIQUE,
  ADD COLUMN IF NOT EXISTS schedule_type    VARCHAR(20)  CHECK (schedule_type IN ('weekday','weekend','custom')),
  ADD COLUMN IF NOT EXISTS class_days       JSONB        DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS class_time_start TIME,
  ADD COLUMN IF NOT EXISTS class_time_end   TIME,
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming'
                                            CHECK (status IN ('upcoming','active','completed','cancelled'));

-- 2. New trainer_course_pool table for US-HR-04
CREATE TABLE IF NOT EXISTS trainer_course_pool (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  trainer_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by    UUID        NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, trainer_id)
);

-- 3. New system_settings table for US-HR-06
CREATE TABLE IF NOT EXISTS system_settings (
  key           VARCHAR(100) PRIMARY KEY,
  value         TEXT         NOT NULL,
  description   TEXT,
  is_sensitive  BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by    UUID         REFERENCES users(id),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default values
INSERT INTO system_settings (key, value, description, is_sensitive)
VALUES
  ('gst_rate',              '18',               'GST percentage applied to all invoices', FALSE),
  ('invoice_prefix',        'INV',              'Prefix used for sequential invoice numbers', FALSE),
  ('at_risk_completion_pct','40',               'Completion % below which a student is flagged at-risk', FALSE),
  ('at_risk_overdue_tasks', '3',                'Number of overdue tasks that triggers at-risk flag', FALSE),
  ('razorpay_webhook_secret','',                'Razorpay webhook signature secret', TRUE)
ON CONFLICT (key) DO NOTHING;
