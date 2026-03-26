-- ============================================================================
-- ACADENO LMS — Student Portal Schema
-- Migration: 007_student_portal_schema.sql
-- PostgreSQL 15+
-- Created: 2026-03-25
-- Depends on: 001_auth_schema.sql, 003_registration_schema.sql,
--             006_courses_schema.sql
-- EPIC-06: Student Portal (content_progress, activity tracking,
--          certificates, discussion forums)
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS (safe to repeat — idempotent)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. EXTEND EXISTING TABLES
-- ============================================================================
-- These ALTER TABLE statements safely extend tables from prior migrations.
-- IF NOT EXISTS guards make this migration fully re-runnable.

-- task_submissions: flag late submissions (US-STU-05)
ALTER TABLE task_submissions
    ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE;

-- content_items: control per-item download permission (US-STU-02)
ALTER TABLE content_items
    ADD COLUMN IF NOT EXISTS is_downloadable BOOLEAN NOT NULL DEFAULT TRUE;



-- ============================================================================
-- 2. NEW TABLES
-- ============================================================================

-- ---------- 2a. content_progress ----------
-- Richer per-student progress tracking per content item.
-- Extends the simpler student_content_progress (006) with watch position
-- and granular completion state required by the video player (US-STU-02).
CREATE TABLE IF NOT EXISTS content_progress (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id              UUID        NOT NULL
                                        REFERENCES users (id) ON DELETE CASCADE,
    content_item_id         UUID        NOT NULL
                                        REFERENCES content_items (id) ON DELETE CASCADE,
    is_completed            BOOLEAN     NOT NULL DEFAULT FALSE,
    watch_position_seconds  INT         NOT NULL DEFAULT 0,
    last_accessed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,                              -- NULL until fully completed

    CONSTRAINT uq_content_progress_student_item UNIQUE (student_id, content_item_id)
);

COMMENT ON TABLE  content_progress IS 'Per-student progress for individual content items; tracks watch position and completion (EPIC-06 US-STU-02).';
COMMENT ON COLUMN content_progress.watch_position_seconds IS 'Last known playback position in seconds; used to resume video playback.';
COMMENT ON COLUMN content_progress.completed_at IS 'Timestamp set once when is_completed transitions to TRUE for the first time.';

-- ---------- 2b. student_activity ----------
-- Daily activity log used for streak calculation on the student dashboard
-- (US-STU-01). One row per student per calendar day.
CREATE TABLE IF NOT EXISTS student_activity (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id              UUID        NOT NULL
                                        REFERENCES users (id) ON DELETE CASCADE,
    activity_date           DATE        NOT NULL,
    content_items_accessed  INT         NOT NULL DEFAULT 0,

    CONSTRAINT uq_student_activity_date UNIQUE (student_id, activity_date)
);

COMMENT ON TABLE  student_activity IS 'Aggregate daily activity log for streak and engagement tracking (EPIC-06 US-STU-01).';
COMMENT ON COLUMN student_activity.content_items_accessed IS 'Count of distinct content items accessed on activity_date; incremented on each access.';

-- ---------- 2c. certificates ----------
-- Course completion certificates generated after all content is finished
-- (US-STU-06). One certificate per student per enrollment.
CREATE TABLE IF NOT EXISTS certificates (
    id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id                  UUID        NOT NULL
                                            REFERENCES users (id) ON DELETE CASCADE,
    enrollment_id               UUID        NOT NULL
                                            REFERENCES enrollments (id) ON DELETE CASCADE,
    certificate_url             TEXT        NOT NULL,
    public_verification_token   UUID        NOT NULL DEFAULT uuid_generate_v4(),
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_certificate_student_enrollment UNIQUE (student_id, enrollment_id)
);

COMMENT ON TABLE  certificates IS 'Course completion certificates; one per student per enrollment (EPIC-06 US-STU-06).';
COMMENT ON COLUMN certificates.certificate_url IS 'Local disk path or CDN URL of the generated PDF certificate.';
COMMENT ON COLUMN certificates.public_verification_token IS 'Publicly shareable UUID for unauthenticated certificate verification.';

-- ---------- 2d. discussion_posts ----------
-- Module-level discussion threads scoped to a specific batch (US-STU-07).
-- A post belongs to both a module and a batch so RLS can enforce batch isolation.
CREATE TABLE IF NOT EXISTS discussion_posts (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id   UUID        NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
    batch_id    UUID        NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  discussion_posts IS 'Discussion thread posts scoped to a module within a batch (EPIC-06 US-STU-07).';
COMMENT ON COLUMN discussion_posts.batch_id IS 'Enables batch-scoped RLS so students only see posts from their own batch.';

-- ---------- 2e. discussion_replies ----------
-- Replies to a discussion post. Cascade-deleted when the parent post is removed.
CREATE TABLE IF NOT EXISTS discussion_replies (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id     UUID        NOT NULL
                            REFERENCES discussion_posts (id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discussion_replies IS 'Threaded replies to discussion posts; cascade-deleted with their parent post (EPIC-06 US-STU-07).';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

-- content_progress
CREATE INDEX IF NOT EXISTS idx_content_progress_student_id
    ON content_progress (student_id);

CREATE INDEX IF NOT EXISTS idx_content_progress_content_item_id
    ON content_progress (content_item_id);

-- student_activity
CREATE INDEX IF NOT EXISTS idx_student_activity_student_date
    ON student_activity (student_id, activity_date);

-- certificates
CREATE INDEX IF NOT EXISTS idx_certificates_student_id
    ON certificates (student_id);

CREATE INDEX IF NOT EXISTS idx_certificates_verification_token
    ON certificates (public_verification_token);

-- discussion_posts
CREATE INDEX IF NOT EXISTS idx_discussion_posts_module_batch
    ON discussion_posts (module_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_discussion_posts_author_id
    ON discussion_posts (author_id);

-- discussion_replies
CREATE INDEX IF NOT EXISTS idx_discussion_replies_post_id
    ON discussion_replies (post_id);

CREATE INDEX IF NOT EXISTS idx_discussion_replies_author_id
    ON discussion_replies (author_id);

-- ============================================================================
-- 4. UPDATED_AT TRIGGERS (reuse fn_set_updated_at from 001_auth_schema)
-- ============================================================================
-- Use DO $$ guards to keep the migration idempotent (pattern from 006 addendum).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_content_progress_updated_at'
    ) THEN
        CREATE TRIGGER trg_content_progress_updated_at
            BEFORE UPDATE ON content_progress
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;

-- NOTE: content_progress uses last_accessed_at, not updated_at, but the
-- fn_set_updated_at trigger is defined to set `updated_at` — the column
-- does not exist on content_progress, so we do NOT attach the trigger here.
-- last_accessed_at is managed explicitly by the application layer.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_discussion_posts_updated_at'
    ) THEN
        CREATE TRIGGER trg_discussion_posts_updated_at
            BEFORE UPDATE ON discussion_posts
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    END IF;
END $$;

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE content_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_activity     ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies   ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents accidental bypass during dev)
ALTER TABLE content_progress     FORCE ROW LEVEL SECURITY;
ALTER TABLE student_activity     FORCE ROW LEVEL SECURITY;
ALTER TABLE certificates         FORCE ROW LEVEL SECURITY;
ALTER TABLE discussion_posts     FORCE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies   FORCE ROW LEVEL SECURITY;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5a. content_progress POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Super Admin: full access
CREATE POLICY super_admin_bypass_content_progress
    ON content_progress FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR: read-only across all students (reporting / support)
CREATE POLICY hr_read_content_progress
    ON content_progress FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer: read progress for students in their assigned batches (US-STU-07 dashboard)
CREATE POLICY trainer_read_content_progress
    ON content_progress FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND student_id IN (
            SELECT s.user_id FROM students s
            JOIN enrollments e ON e.student_id = s.id
            JOIN batches b ON e.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- Student: full access to their own progress rows only
CREATE POLICY student_own_content_progress
    ON content_progress FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5b. student_activity POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Super Admin: full access
CREATE POLICY super_admin_bypass_student_activity
    ON student_activity FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR: read-only for reporting
CREATE POLICY hr_read_student_activity
    ON student_activity FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer: read activity for students in their batches
CREATE POLICY trainer_read_student_activity
    ON student_activity FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND student_id IN (
            SELECT s.user_id FROM students s
            JOIN enrollments e ON e.student_id = s.id
            JOIN batches b ON e.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- Student: full access to their own activity rows only
CREATE POLICY student_own_activity
    ON student_activity FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5c. certificates POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Super Admin: full access
CREATE POLICY super_admin_bypass_certificates
    ON certificates FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR: read-only (compliance / verification support)
CREATE POLICY hr_read_certificates
    ON certificates FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer: read certificates for students in their batches
CREATE POLICY trainer_read_certificates
    ON certificates FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND enrollment_id IN (
            SELECT e.id FROM enrollments e
            JOIN batches b ON e.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- Student: read their own certificates only (no INSERT/UPDATE — system-generated)
CREATE POLICY student_own_certificates
    ON certificates FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5d. discussion_posts POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Super Admin: full access
CREATE POLICY super_admin_bypass_discussion_posts
    ON discussion_posts FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR: read-only (moderation / oversight)
CREATE POLICY hr_read_discussion_posts
    ON discussion_posts FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer: full access to posts in their assigned batches
CREATE POLICY trainer_batch_discussion_posts
    ON discussion_posts FOR ALL
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

-- Student SELECT: see only posts from their own active batch (US-STU-07)
CREATE POLICY student_read_discussion_posts
    ON discussion_posts FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND batch_id IN (
            SELECT e.batch_id FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- Student INSERT: can only post to their own active batch as themselves
CREATE POLICY student_insert_discussion_posts
    ON discussion_posts FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
        AND batch_id IN (
            SELECT e.batch_id FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
              AND e.status = 'active'
        )
    );

-- Student UPDATE: can only edit their own posts
CREATE POLICY student_update_own_discussion_posts
    ON discussion_posts FOR UPDATE
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5e. discussion_replies POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Super Admin: full access
CREATE POLICY super_admin_bypass_discussion_replies
    ON discussion_replies FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR: read-only
CREATE POLICY hr_read_discussion_replies
    ON discussion_replies FOR SELECT
    USING  (current_setting('app.current_user_role', TRUE) = 'hr');

-- Trainer: full access to replies on posts in their batches
CREATE POLICY trainer_batch_discussion_replies
    ON discussion_replies FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND post_id IN (
            SELECT dp.id FROM discussion_posts dp
            JOIN batches b ON dp.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'trainer'
        AND post_id IN (
            SELECT dp.id FROM discussion_posts dp
            JOIN batches b ON dp.batch_id = b.id
            WHERE b.trainer_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- Student SELECT: see replies for posts in their own active batch
CREATE POLICY student_read_discussion_replies
    ON discussion_replies FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND post_id IN (
            SELECT dp.id FROM discussion_posts dp
            WHERE dp.batch_id IN (
                SELECT e.batch_id FROM enrollments e
                JOIN students s ON e.student_id = s.id
                WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND e.status = 'active'
            )
        )
    );

-- Student INSERT: can reply to posts in their own active batch as themselves
CREATE POLICY student_insert_discussion_replies
    ON discussion_replies FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
        AND post_id IN (
            SELECT dp.id FROM discussion_posts dp
            WHERE dp.batch_id IN (
                SELECT e.batch_id FROM enrollments e
                JOIN students s ON e.student_id = s.id
                WHERE s.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND e.status = 'active'
            )
        )
    );

-- Student UPDATE: can only edit their own replies
CREATE POLICY student_update_own_discussion_replies
    ON discussion_replies FOR UPDATE
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND author_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO lms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;

-- ============================================================================
-- END OF MIGRATION — 007_student_portal_schema.sql
-- ============================================================================
