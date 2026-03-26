-- ============================================================================
-- ACADENO LMS — Task Quizzes Schema
-- Migration: 011_task_quizzes.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_questions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id         UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    question_text   TEXT        NOT NULL,
    option_a        TEXT        NOT NULL,
    option_b        TEXT        NOT NULL,
    option_c        TEXT        NOT NULL,
    option_d        TEXT        NOT NULL,
    correct_option  CHAR(1)     NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    points          INT         NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast retrieval
CREATE INDEX IF NOT EXISTS idx_quiz_questions_task_id ON quiz_questions (task_id);

-- RLS Enforcement
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions FORCE ROW LEVEL SECURITY;

-- Trainer: manage questions for their tasks
CREATE POLICY trainer_manage_quiz_questions ON quiz_questions FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND task_id IN (
            SELECT t.id FROM tasks t
            JOIN batches b ON t.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND task_id IN (
            SELECT t.id FROM tasks t
            JOIN batches b ON t.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- Student: read questions for published quiz tasks (but we'll obfuscate correct_option in API)
CREATE POLICY student_read_quiz_questions ON quiz_questions FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND task_id IN (
            SELECT id FROM tasks WHERE is_published = TRUE AND task_type = 'quiz'
        )
    );

-- HR/Super Admin: full access
CREATE POLICY super_admin_all_quiz_questions ON quiz_questions FOR ALL
    USING (current_setting('app.current_user_role', TRUE) IN ('super_admin', 'hr'))
    WITH CHECK (current_setting('app.current_user_role', TRUE) IN ('super_admin', 'hr'));

GRANT ALL PRIVILEGES ON quiz_questions TO lms_user;
