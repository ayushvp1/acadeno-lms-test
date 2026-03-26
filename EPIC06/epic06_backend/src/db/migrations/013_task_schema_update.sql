-- ============================================================================
-- ACADENO LMS — Migration 013: Task Schema Alignment
-- Adding missing columns to tasks table for controller compatibility.
-- ============================================================================

-- 1. Add missing columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS target_student_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Backfill course_id from batches
UPDATE tasks t
SET course_id = b.course_id
FROM batches b
WHERE t.batch_id = b.id AND t.course_id IS NULL;

-- 3. Ensure course_id is NOT NULL after backfill (only if we have batches)
-- We'll leave it nullable if no batches exist yet, but in our case we do.
ALTER TABLE tasks ALTER COLUMN course_id SET NOT NULL;
