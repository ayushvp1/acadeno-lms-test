-- ============================================================================
-- ACADENO LMS — Course & Content Management Schema
-- Migration: 006_courses_schema.sql
-- PostgreSQL 15+
-- Created: 2026-03-24
-- Depends on: 001_auth_schema.sql, 003_registration_schema.sql
-- EPIC-05: Course & Content Management (US-CRS-01 through US-CRS-08)
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS (safe to repeat — idempotent)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. EXTEND EXISTING TABLES
-- ============================================================================
-- courses already exists from EPIC-03 migration 003.
-- 'name' column serves as 'title' in EPIC-05 (no rename needed — controllers alias it).
-- Use ALTER TABLE ADD COLUMN IF NOT EXISTS for safe idempotent execution.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS gst_rate            NUMERIC(5, 2)  NOT NULL DEFAULT 18.00;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS max_batch_capacity   INT            NOT NULL DEFAULT 30;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_by           UUID           REFERENCES users(id) ON DELETE SET NULL;

-- batches already exists from EPIC-03 with all required columns:
-- id, course_id, name (serves as batch_name), schedule, trainer_id,
-- capacity, enrolled_count, start_date, end_date, is_active, created_at, updated_at
-- No ALTER TABLE needed for batches.

-- ============================================================================
-- 2. NEW TABLES
-- ============================================================================

-- ---------- 2a. modules ----------
-- Top-level learning modules belonging to a course (FR-CRS-01).
-- position is a non-unique ordering hint — duplicates are allowed during reorder transactions.
CREATE TABLE IF NOT EXISTS modules (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    position    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  modules          IS 'Top-level learning modules inside a course (EPIC-05 FR-CRS-01).';
COMMENT ON COLUMN modules.position IS 'Zero-based display order. Not unique — allows atomic reordering.';

-- ---------- 2b. sub_modules ----------
-- Sub-modules nested inside modules (FR-CRS-01).
CREATE TABLE IF NOT EXISTS sub_modules (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id   UUID        NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    position    INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sub_modules          IS 'Sub-modules nested within modules (EPIC-05 FR-CRS-01).';
COMMENT ON COLUMN sub_modules.position IS 'Zero-based display order within parent module.';

-- ---------- 2c. content_items ----------
-- Individual content pieces within sub-modules:
-- video (MP4 → HLS via MediaConvert), pdf, document, external_link, live_session.
CREATE TABLE IF NOT EXISTS content_items (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_module_id     UUID        NOT NULL REFERENCES sub_modules(id) ON DELETE CASCADE,
    title             TEXT        NOT NULL,
    content_type      TEXT        NOT NULL
                                  CHECK (content_type IN
                                    ('video', 'pdf', 'document', 'external_link', 'live_session')),
    s3_key            TEXT,                                           -- storage key for uploaded files
    external_url      TEXT,                                           -- YouTube/Vimeo/Meet links
    transcode_status  TEXT        NOT NULL DEFAULT 'not_applicable'
                                  CHECK (transcode_status IN
                                    ('not_applicable', 'processing', 'complete', 'failed')),
    hls_url           TEXT,                                           -- populated after MediaConvert
    job_id            TEXT,                                           -- MediaConvert job ID
    status            TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'published')),
    position          INT         NOT NULL DEFAULT 0,
    file_size_bytes   BIGINT,
    duration_seconds  INT,
    created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  content_items                 IS 'Individual content pieces (video, PDF, doc, link, live session) within sub-modules.';
COMMENT ON COLUMN content_items.hls_url         IS 'HLS manifest URL populated after AWS MediaConvert transcoding (US-CRS-02).';
COMMENT ON COLUMN content_items.job_id          IS 'AWS MediaConvert job ID for status polling (US-CRS-02).';
COMMENT ON COLUMN content_items.transcode_status IS 'Lifecycle: not_applicable → processing → complete|failed.';

-- ---------- 2d. tasks ----------
-- Assignments, quizzes and projects created by trainers for a batch (US-CRS-05).
CREATE TABLE IF NOT EXISTS tasks (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id        UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    title           TEXT        NOT NULL,
    description     TEXT,
    task_type       TEXT        NOT NULL
                                CHECK (task_type IN ('quiz', 'assignment', 'project')),
    due_date        TIMESTAMPTZ NOT NULL,
    max_score       INT         NOT NULL DEFAULT 100,
    rubric          TEXT,
    is_published    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tasks IS 'Tasks (quiz/assignment/project) assigned by a trainer to a batch (US-CRS-05).';

-- ---------- 2e. task_submissions ----------
-- One row per student per task — enforced by UNIQUE constraint.
CREATE TABLE IF NOT EXISTS task_submissions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id         UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_text   TEXT,
    s3_key          TEXT,                                             -- uploaded submission file
    score           INT,
    feedback        TEXT,
    status          TEXT        NOT NULL DEFAULT 'submitted'
                                CHECK (status IN ('submitted', 'evaluated', 'reopened')),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_at    TIMESTAMPTZ,

    CONSTRAINT uq_task_submission UNIQUE (task_id, student_id)
);

COMMENT ON TABLE  task_submissions IS 'Student submissions for tasks. One row per student per task (US-CRS-05).';
COMMENT ON COLUMN task_submissions.student_id IS 'References users.id directly — the student user record.';

-- ---------- 2f. live_sessions ----------
-- Scheduled online class sessions for a batch (US-CRS-08).
CREATE TABLE IF NOT EXISTS live_sessions (
    id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id                    UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    title                       TEXT        NOT NULL,
    scheduled_at                TIMESTAMPTZ NOT NULL,
    duration_minutes            INT         NOT NULL DEFAULT 60,
    meeting_url                 TEXT        NOT NULL,
    google_calendar_event_id    TEXT,
    created_by                  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_sessions IS 'Scheduled online class sessions for batches with optional Google Calendar sync (US-CRS-08).';

-- ---------- 2g. student_content_progress ----------
-- Tracks which content items each student has completed.
-- Required for completion_percent in batch dashboard (US-CRS-07).
CREATE TABLE IF NOT EXISTS student_content_progress (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_item_id UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_content_progress UNIQUE (student_id, content_item_id)
);

COMMENT ON TABLE student_content_progress IS 'Student completion records for individual content items (EPIC-05 US-CRS-07 dashboard).';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_modules_course_id             ON modules (course_id);
CREATE INDEX IF NOT EXISTS idx_modules_position              ON modules (course_id, position);

CREATE INDEX IF NOT EXISTS idx_submodules_module_id          ON sub_modules (module_id);
CREATE INDEX IF NOT EXISTS idx_submodules_position           ON sub_modules (module_id, position);

CREATE INDEX IF NOT EXISTS idx_content_sub_module_id         ON content_items (sub_module_id);
CREATE INDEX IF NOT EXISTS idx_content_status                ON content_items (status);
CREATE INDEX IF NOT EXISTS idx_content_created_by            ON content_items (created_by);
CREATE INDEX IF NOT EXISTS idx_content_position              ON content_items (sub_module_id, position);

CREATE INDEX IF NOT EXISTS idx_tasks_batch_id                ON tasks (batch_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by              ON tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date                ON tasks (due_date);

CREATE INDEX IF NOT EXISTS idx_task_subs_task_id             ON task_submissions (task_id);
CREATE INDEX IF NOT EXISTS idx_task_subs_student_id          ON task_submissions (student_id);

CREATE INDEX IF NOT EXISTS idx_live_sessions_batch_id        ON live_sessions (batch_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled       ON live_sessions (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_content_progress_student      ON student_content_progress (student_id);
CREATE INDEX IF NOT EXISTS idx_content_progress_item         ON student_content_progress (content_item_id);

-- ============================================================================
-- 4. UPDATED_AT TRIGGERS (reuse fn_set_updated_at from 001_auth_schema)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_content_items_updated_at ON content_items;
CREATE TRIGGER trg_content_items_updated_at
    BEFORE UPDATE ON content_items
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE modules                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_modules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_content_progress    ENABLE ROW LEVEL SECURITY;

ALTER TABLE modules                     FORCE ROW LEVEL SECURITY;
ALTER TABLE sub_modules                 FORCE ROW LEVEL SECURITY;
ALTER TABLE content_items               FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                       FORCE ROW LEVEL SECURITY;
ALTER TABLE task_submissions            FORCE ROW LEVEL SECURITY;
ALTER TABLE live_sessions               FORCE ROW LEVEL SECURITY;
ALTER TABLE student_content_progress    FORCE ROW LEVEL SECURITY;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5a. modules RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_modules ON modules FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_modules ON modules FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

-- BR-C01: Trainer sees/edits only modules for courses they are assigned to
CREATE POLICY trainer_assigned_modules ON modules FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND course_id IN (
            SELECT course_id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND is_active = TRUE
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND course_id IN (
            SELECT course_id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND is_active = TRUE
        )
    );

-- BR-C02: Students read modules for their active enrollments only
CREATE POLICY student_read_modules ON modules FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND course_id IN (
            SELECT e.course_id FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5b. sub_modules RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_sub_modules ON sub_modules FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_sub_modules ON sub_modules FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

CREATE POLICY trainer_assigned_sub_modules ON sub_modules FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND module_id IN (
            SELECT m.id FROM modules m
            JOIN batches b ON m.course_id = b.course_id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND b.is_active = TRUE
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND module_id IN (
            SELECT m.id FROM modules m
            JOIN batches b ON m.course_id = b.course_id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND b.is_active = TRUE
        )
    );

CREATE POLICY student_read_sub_modules ON sub_modules FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND module_id IN (
            SELECT m.id FROM modules m
            WHERE m.course_id IN (
                SELECT e.course_id FROM enrollments e
                JOIN students s ON e.student_id = s.id
                WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND e.status = 'active'
            )
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5c. content_items RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_content ON content_items FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_content ON content_items FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer sees their own uploaded content (BR-C01)
CREATE POLICY trainer_own_content ON content_items FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND created_by = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND created_by = current_setting('app.current_user_id', TRUE)::UUID
    );

-- BR-C02: Students read only published content for active enrollments
CREATE POLICY student_read_published_content ON content_items FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND status = 'published'
        AND sub_module_id IN (
            SELECT sm.id FROM sub_modules sm
            JOIN modules m ON sm.module_id = m.id
            WHERE m.course_id IN (
                SELECT e.course_id FROM enrollments e
                JOIN students s ON e.student_id = s.id
                WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND e.status = 'active'
            )
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5d. tasks RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_tasks ON tasks FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_tasks ON tasks FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

-- BR-C01: Trainer manages tasks only for their assigned batches
CREATE POLICY trainer_batch_tasks ON tasks FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND batch_id IN (
            SELECT id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND batch_id IN (
            SELECT id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- BR-C02: Students read only published tasks for their active batch
CREATE POLICY student_read_published_tasks ON tasks FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND is_published = TRUE
        AND batch_id IN (
            SELECT e.batch_id FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5e. task_submissions RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_task_subs ON task_submissions FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_task_subs ON task_submissions FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer can read/update submissions for their batch tasks
CREATE POLICY trainer_batch_task_subs ON task_submissions FOR ALL
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

-- Students manage only their own submissions
CREATE POLICY student_own_task_subs ON task_submissions FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5f. live_sessions RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_live_sessions ON live_sessions FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_live_sessions ON live_sessions FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

CREATE POLICY trainer_batch_live_sessions ON live_sessions FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND batch_id IN (
            SELECT id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND batch_id IN (
            SELECT id FROM batches
            WHERE trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY student_read_live_sessions ON live_sessions FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND batch_id IN (
            SELECT e.batch_id FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5g. student_content_progress RLS
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE POLICY super_admin_bypass_progress ON student_content_progress FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_read_progress ON student_content_progress FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

CREATE POLICY trainer_read_progress ON student_content_progress FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'trainer');

CREATE POLICY student_own_progress ON student_content_progress FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO lms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;

-- ============================================================================
-- 7. ADDENDUM — Missing columns for taskController and liveSessionReminderJob
-- ============================================================================
-- These ALTER TABLE statements safely extend the tables created above.
-- Using IF NOT EXISTS guards so the migration is re-runnable.

-- task_submissions: add grade, file_url, notes, evaluated_by, updated_at
ALTER TABLE task_submissions
    ADD COLUMN IF NOT EXISTS grade        TEXT        NOT NULL DEFAULT 'pending'
                                          CHECK (grade IN ('pass', 'fail', 'pending')),
    ADD COLUMN IF NOT EXISTS file_url     TEXT,
    ADD COLUMN IF NOT EXISTS notes        TEXT,
    ADD COLUMN IF NOT EXISTS evaluated_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- live_sessions: add reminder_sent, updated_at
ALTER TABLE live_sessions
    ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Updated-at trigger for task_submissions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_submissions_updated_at'
    ) THEN
        CREATE TRIGGER trg_task_submissions_updated_at
            BEFORE UPDATE ON task_submissions
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;

-- Updated-at trigger for live_sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_live_sessions_updated_at'
    ) THEN
        CREATE TRIGGER trg_live_sessions_updated_at
            BEFORE UPDATE ON live_sessions
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;

-- Re-grant after column additions
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO lms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;

-- ============================================================================
-- END OF MIGRATION — 006_courses_schema.sql
-- ============================================================================
