-- ============================================================================
-- ACADENO LMS — Authentication Module Schema
-- Migration: 001_auth_schema.sql
-- PostgreSQL 15+
-- Created: 2026-03-21
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
-- uuid-ossp provides uuid_generate_v4() for default UUID primary keys.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CUSTOM ENUM TYPE
-- ============================================================================
-- All platform roles. Add new roles here as the system evolves.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'super_admin',
            'hr',
            'bda',
            'trainer',
            'student'
        );
    END IF;
END
$$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- ---------- 2a. users ----------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               TEXT            NOT NULL,
    password_hash       TEXT            NOT NULL,
    role                user_role       NOT NULL DEFAULT 'student',
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    failed_login_count  INT             NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,                              -- NULL = not locked
    mfa_enabled         BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Enforce uniqueness on email (also creates an implicit index)
    CONSTRAINT uq_users_email UNIQUE (email)
);

COMMENT ON TABLE  users IS 'Core identity table for every platform user.';
COMMENT ON COLUMN users.locked_until IS 'Non-null when the account is temporarily locked after too many failed logins.';

-- ---------- 2b. refresh_tokens ----------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID            NOT NULL
                                        REFERENCES users (id) ON DELETE CASCADE,
    token_hash          TEXT            NOT NULL,
    device_fingerprint  TEXT,
    expires_at          TIMESTAMPTZ     NOT NULL,
    revoked_at          TIMESTAMPTZ,                              -- NULL = still valid
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

COMMENT ON TABLE  refresh_tokens IS 'Stores hashed refresh tokens; one row per device session.';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Set when the token is explicitly revoked (logout / rotation).';

-- ---------- 2c. trusted_devices ----------
CREATE TABLE IF NOT EXISTS trusted_devices (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID            NOT NULL
                                        REFERENCES users (id) ON DELETE CASCADE,
    device_fingerprint  TEXT            NOT NULL,
    trusted_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_seen           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- A user can trust a specific device only once
    CONSTRAINT uq_trusted_device UNIQUE (user_id, device_fingerprint)
);

COMMENT ON TABLE trusted_devices IS 'Devices a user has explicitly marked as trusted (skip MFA on next login).';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================
-- users.email is already indexed via the UNIQUE constraint.
-- Add explicit indexes for the remaining high-traffic lookup patterns.

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
    ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_device
    ON trusted_devices (user_id, device_fingerprint);

-- ============================================================================
-- 4. GENERIC updated_at TRIGGER FUNCTION
-- ============================================================================
-- Reusable trigger function: automatically sets `updated_at` to NOW()
-- before every UPDATE on any table that carries the column.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the users table (the only table that has updated_at).
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all three tables.
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents accidental bypass during dev).
ALTER TABLE users           FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens  FORCE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices FORCE ROW LEVEL SECURITY;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5a. USERS TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- POLICY: super_admin_bypass_users
-- Super Admins can perform ALL operations on the users table with no
-- row-level restrictions. The check uses the session variable
-- `app.current_user_role` which must be set by the application layer
-- (e.g.  SET LOCAL "app.current_user_role" = 'super_admin';)
-- before issuing queries.
CREATE POLICY super_admin_bypass_users
    ON users
    FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- POLICY: users_select_own_row
-- Non-admin users can only SELECT their own row. The application sets
-- `app.current_user_id` to the authenticated user's UUID so that the
-- policy can compare it against the row's `id` column.
CREATE POLICY users_select_own_row
    ON users
    FOR SELECT
    USING (
        id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5b. REFRESH_TOKENS TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- POLICY: super_admin_bypass_refresh_tokens
-- Super Admins can manage all refresh tokens (e.g., force-revoke sessions).
CREATE POLICY super_admin_bypass_refresh_tokens
    ON refresh_tokens
    FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- POLICY: own_refresh_tokens
-- Regular users can only see and manage their own refresh tokens.
-- This prevents a user from revoking or reading another user's sessions.
CREATE POLICY own_refresh_tokens
    ON refresh_tokens
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 5c. TRUSTED_DEVICES TABLE POLICIES
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- POLICY: super_admin_bypass_trusted_devices
-- Super Admins can view and manage trusted devices for any user
-- (useful for security audits and forced un-trusting).
CREATE POLICY super_admin_bypass_trusted_devices
    ON trusted_devices
    FOR ALL
    USING  (current_setting('app.current_user_role', TRUE) = 'super_admin')
    WITH CHECK (current_setting('app.current_user_role', TRUE) = 'super_admin');

-- POLICY: own_trusted_devices
-- Users can only see and manage their own trusted devices.
CREATE POLICY own_trusted_devices
    ON trusted_devices
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
    )
    WITH CHECK (
        user_id = current_setting('app.current_user_id', TRUE)::UUID
    );

-- ============================================================================
-- 6. VERIFICATION QUERIES (optional — safe to remove in production)
-- ============================================================================
-- Uncomment the lines below to verify the schema after running the migration.
--
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- SELECT polname, tablename FROM pg_policies WHERE schemaname = 'public';
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_%';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
