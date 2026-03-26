-- ==========================================================================
-- ACADENO LMS — Migration 014: Audit Logs Table
-- ==========================================================================
-- Tracks significant platform actions for compliance and incident response.
-- Accessible only to Super Admin and HR roles.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID          NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action_type     TEXT          NOT NULL,
    resource_type   TEXT          NOT NULL,
    resource_id     UUID,
    status          TEXT          NOT NULL CHECK (status IN ('success', 'failure')),
    details         JSONB         DEFAULT '{}',
    ip_address      TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for filtering by date and actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);

-- ==========================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ==========================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Only Super Admin and HR can read audit logs
CREATE POLICY admin_hr_read_audit ON audit_logs FOR SELECT
    USING (current_setting('app.current_user_role', TRUE) IN ('super_admin', 'hr'));

-- Only the system (internal logic) should write to audit logs
-- (Assuming the service sets a specific role or we allow specific roles to insert)
CREATE POLICY admin_hr_insert_audit ON audit_logs FOR INSERT
    WITH CHECK (current_setting('app.current_user_role', TRUE) IN ('super_admin', 'hr', 'trainer', 'bda', 'student'));

-- PREVENT DELETION AND UPDATES (Immutable Ledger)
CREATE POLICY no_delete_audit ON audit_logs FOR DELETE
    USING (FALSE);

CREATE POLICY no_update_audit ON audit_logs FOR UPDATE
    USING (FALSE)
    WITH CHECK (FALSE);

-- Trigger to block DELETE at the DB level (failsafe)
CREATE OR REPLACE FUNCTION fn_block_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are immutable and cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_audit_delete ON audit_logs;
CREATE TRIGGER trg_block_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION fn_block_audit_delete();

-- Grant permissions
GRANT SELECT, INSERT ON audit_logs TO lms_user;
