-- ==========================================================================
-- ACADENO LMS — EPIC 8 Migration: HR & Admin Management
-- ==========================================================================
-- Run this BEFORE deploying EPIC-08 code.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS + ON CONFLICT).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1.1 Alter `batches` table with EPIC-08 columns
-- --------------------------------------------------------------------------
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code       VARCHAR(50)  UNIQUE,
  ADD COLUMN IF NOT EXISTS schedule_type    VARCHAR(20)  CHECK (schedule_type IN ('weekday','weekend','custom')),
  ADD COLUMN IF NOT EXISTS class_days       JSONB        DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS class_time_start TIME,
  ADD COLUMN IF NOT EXISTS class_time_end   TIME,
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming'
                                            CHECK (status IN ('upcoming','active','completed','cancelled'));

-- --------------------------------------------------------------------------
-- 1.2 New `trainer_course_pool` table (US-HR-04)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_course_pool (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  trainer_id  UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  added_by    UUID        NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, trainer_id)
);

-- --------------------------------------------------------------------------
-- 1.3 New `system_settings` table (US-HR-06)
-- --------------------------------------------------------------------------
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
  ('gst_rate',               '18',  'GST percentage applied to all invoices',             FALSE),
  ('invoice_prefix',         'INV', 'Prefix used for sequential invoice numbers',          FALSE),
  ('at_risk_completion_pct', '40',  'Completion % below which a student is flagged at-risk', FALSE),
  ('at_risk_overdue_tasks',  '3',   'Number of overdue tasks that triggers at-risk flag',  FALSE),
  ('razorpay_webhook_secret','',    'Razorpay webhook signature secret',                   TRUE)
ON CONFLICT (key) DO NOTHING;
