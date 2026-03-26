-- ============================================================================
-- ACADENO LMS — Migration 009: Reopen Task Submissions (US-TR-02)
-- ============================================================================
-- Extends task_submissions to support the "Reopen" flow for Trainers.
-- Allows students to resubmit tasks based on trainer feedback.
-- ============================================================================

-- 1. Add status and reopen_reason columns
ALTER TABLE task_submissions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted' 
    CHECK (status IN ('submitted', 'evaluated', 'reopen')),
    ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- 2. Backfill status based on grade
-- If grade is 'pending', status is 'submitted' (default)
-- If grade is 'pass' or 'fail', status is 'evaluated'
UPDATE task_submissions
   SET status = 'evaluated'
 WHERE grade IN ('pass', 'fail')
   AND status = 'submitted';

-- 3. Add comment for clarity
COMMENT ON COLUMN task_submissions.status IS 'Current lifecycle state of the submission: submitted, evaluated, or reopen (for resubmission).';
COMMENT ON COLUMN task_submissions.reopen_reason IS 'Feedback from trainer explaining why the task was reopened for resubmission.';
