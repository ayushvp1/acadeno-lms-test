-- ============================================================================
-- ACADENO LMS — Student Registration Module Schema
-- Migration: 002_registration_schema.sql
-- PostgreSQL 15+
-- Created: 2026-03-23
-- Depends on: 001_auth_schema.sql
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS (already created by 001, safe to repeat)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_status') THEN
        CREATE TYPE registration_status AS ENUM (
            'draft',
            'pending_payment',
            'active',
            'cancelled'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status') THEN
        CREATE TYPE enrollment_status AS ENUM (
            'pending_payment',
            'active',
            'completed',
            'dropped',
            'cancelled'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_type') THEN
        CREATE TYPE gender_type AS ENUM (
            'male',
            'female',
            'other'
        );
    END IF;
END
$$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- ---------- 2a. courses ----------
CREATE TABLE IF NOT EXISTS courses (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT            NOT NULL,
    description     TEXT,
    duration_weeks  INT,
    base_fee        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_courses_name UNIQUE (name)
);

COMMENT ON TABLE courses IS 'Course catalogue for the platform.';

-- ---------- 2b. batches ----------
CREATE TABLE IF NOT EXISTS batches (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id       UUID            NOT NULL
                                    REFERENCES courses (id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    schedule        TEXT,                                       -- e.g. "Mon/Wed/Fri 10:00-12:00"
    trainer_id      UUID            REFERENCES users (id) ON DELETE SET NULL,
    capacity        INT             NOT NULL DEFAULT 30,
    enrolled_count  INT             NOT NULL DEFAULT 0,
    start_date      DATE,
    end_date        DATE,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_batch_capacity CHECK (enrolled_count >= 0 AND enrolled_count <= capacity)
);

COMMENT ON TABLE batches IS 'Scheduled batches per course with capacity tracking.';

-- ---------- 2c. students ----------
CREATE TABLE IF NOT EXISTS students (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID            REFERENCES users (id) ON DELETE SET NULL,
    registration_number     TEXT            NOT NULL,
    first_name              TEXT            NOT NULL,
    last_name               TEXT,
    date_of_birth           DATE            NOT NULL,
    gender                  gender_type     NOT NULL,
    phone                   TEXT            NOT NULL,
    email                   TEXT            NOT NULL,
    profile_photo_path      TEXT,

    -- Address & Identity (US-REG-02)
    address_line1           TEXT,
    address_line2           TEXT,
    city                    TEXT,
    state                   TEXT,
    pin_code                TEXT,
    aadhaar_number          TEXT,
    pan_number              TEXT,

    -- Academic (US-REG-03)
    qualification           TEXT,
    institution             TEXT,
    year_of_passing         INT,
    score                   TEXT,
    marksheet_path          TEXT,

    -- Emergency contact (US-REG-09)
    emergency_contact_name          TEXT,
    emergency_contact_relationship  TEXT,
    emergency_contact_phone         TEXT,

    -- Privacy consent (US-REG-07)
    privacy_consent         BOOLEAN         NOT NULL DEFAULT FALSE,
    privacy_consent_at      TIMESTAMPTZ,

    -- Tracking
    registered_by           UUID            REFERENCES users (id) ON DELETE SET NULL,
    lead_id                 UUID,                               -- NULL for walk-ins (US-REG-06)
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_students_reg_number UNIQUE (registration_number)
);

COMMENT ON TABLE  students IS 'Core student record created on final registration submit.';
COMMENT ON COLUMN students.lead_id IS 'NULL for walk-in/referral registrations (US-REG-06).';
COMMENT ON COLUMN students.registered_by IS 'User ID of the BDA/HR who created this registration.';

-- ---------- 2d. enrollments ----------
CREATE TABLE IF NOT EXISTS enrollments (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID                NOT NULL
                                        REFERENCES students (id) ON DELETE CASCADE,
    batch_id        UUID                NOT NULL
                                        REFERENCES batches (id) ON DELETE CASCADE,
    course_id       UUID                NOT NULL
                                        REFERENCES courses (id) ON DELETE CASCADE,
    base_fee        NUMERIC(10, 2)      NOT NULL,
    gst_amount      NUMERIC(10, 2)      NOT NULL,
    total_fee       NUMERIC(10, 2)      NOT NULL,
    status          enrollment_status   NOT NULL DEFAULT 'pending_payment',
    enrolled_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_enrollment_student_batch UNIQUE (student_id, batch_id)
);

COMMENT ON TABLE enrollments IS 'Student-Batch enrollment with fee breakdown and status.';

-- ---------- 2e. registration_drafts ----------
CREATE TABLE IF NOT EXISTS registration_drafts (
    id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number TEXT                    NOT NULL,
    personal_details    JSONB,                                  -- US-REG-01
    address_documents   JSONB,                                  -- US-REG-02
    academic            JSONB,                                  -- US-REG-03
    course_batch        JSONB,                                  -- US-REG-04
    privacy_consent     BOOLEAN                 NOT NULL DEFAULT FALSE,
    privacy_consent_at  TIMESTAMPTZ,
    status              registration_status     NOT NULL DEFAULT 'draft',
    registered_by       UUID                    NOT NULL
                                                REFERENCES users (id) ON DELETE CASCADE,
    lead_id             UUID,                                   -- NULL for walk-ins (US-REG-06)
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_drafts_reg_number UNIQUE (registration_number)
);

COMMENT ON TABLE  registration_drafts IS 'Transient multi-step wizard state for student registration.';
COMMENT ON COLUMN registration_drafts.lead_id IS 'NULL for walk-in/referral registrations (US-REG-06).';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_batches_course_id
    ON batches (course_id);

CREATE INDEX IF NOT EXISTS idx_students_user_id
    ON students (user_id);

CREATE INDEX IF NOT EXISTS idx_students_email
    ON students (email);

CREATE INDEX IF NOT EXISTS idx_students_reg_number
    ON students (registration_number);

CREATE INDEX IF NOT EXISTS idx_students_registered_by
    ON students (registered_by);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id
    ON enrollments (student_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_batch_id
    ON enrollments (batch_id);

CREATE INDEX IF NOT EXISTS idx_drafts_registered_by
    ON registration_drafts (registered_by);

CREATE INDEX IF NOT EXISTS idx_drafts_status
    ON registration_drafts (status);

-- ============================================================================
-- 4. TRIGGERS (reuse fn_set_updated_at from 001_auth_schema)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_batches_updated_at ON batches;
CREATE TRIGGER trg_batches_updated_at
    BEFORE UPDATE ON batches
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON enrollments;
CREATE TRIGGER trg_enrollments_updated_at
    BEFORE UPDATE ON enrollments
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_drafts_updated_at ON registration_drafts;
CREATE TRIGGER trg_drafts_updated_at
    BEFORE UPDATE ON registration_drafts
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_drafts ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE courses             FORCE ROW LEVEL SECURITY;
ALTER TABLE batches             FORCE ROW LEVEL SECURITY;
ALTER TABLE students            FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments         FORCE ROW LEVEL SECURITY;
ALTER TABLE registration_drafts FORCE ROW LEVEL SECURITY;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5a. COURSES TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- super_admin: full access
CREATE POLICY super_admin_bypass_courses
    ON courses FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- All authenticated roles can read active courses
CREATE POLICY read_active_courses
    ON courses FOR SELECT
    USING (
        is_active = TRUE
        AND current_setting('app.current_user_role', TRUE) IN ('hr', 'bda', 'trainer', 'student')
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5b. BATCHES TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY super_admin_bypass_batches
    ON batches FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- All authenticated roles can read active batches
CREATE POLICY read_active_batches
    ON batches FOR SELECT
    USING (
        is_active = TRUE
        AND current_setting('app.current_user_role', TRUE) IN ('hr', 'bda', 'trainer', 'student')
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5c. STUDENTS TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY super_admin_bypass_students
    ON students FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- HR can see all students
CREATE POLICY hr_all_students
    ON students FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

-- BDA can see only students they registered
CREATE POLICY bda_own_students
    ON students FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND registered_by = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND registered_by = current_setting('app.current_user_id', TRUE)::UUID
    );

-- Students can read their own record
CREATE POLICY student_own_record
    ON students FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND user_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5d. ENROLLMENTS TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY super_admin_bypass_enrollments
    ON enrollments FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_enrollments
    ON enrollments FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

CREATE POLICY bda_own_enrollments
    ON enrollments FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND student_id IN (
            SELECT id FROM students
            WHERE registered_by = current_setting('app.current_user_id', TRUE)::UUID
        )
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND student_id IN (
            SELECT id FROM students
            WHERE registered_by = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

CREATE POLICY student_own_enrollments
    ON enrollments FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'student'
        AND student_id IN (
            SELECT id FROM students
            WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5e. REGISTRATION_DRAFTS TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY super_admin_bypass_drafts
    ON registration_drafts FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

CREATE POLICY hr_all_drafts
    ON registration_drafts FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'hr')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'hr');

CREATE POLICY bda_own_drafts
    ON registration_drafts FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND registered_by = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'bda'
        AND registered_by = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ============================================================================
-- 6. GRANT PERMISSIONS (mirror the pattern from setup_db.js)
-- ============================================================================
-- These will be executed via setup_db.js or manually:
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lms_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lms_user;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
